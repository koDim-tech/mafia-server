// handlers/joinRoom.js
import { emitSystemMessage } from "../utils/chatUtils.js";
import { validate as uuidValidate } from "uuid";

// Валидаторы
const ROOM_ID_RE       = /^[\w-]{3,30}$/;             // a-zA-Z0-9_-
const PLAYER_NAME_RE   = /^[\p{L}0-9 _\-@]{1,20}$/u;   // буквы, цифры, пробел, _-@
const MAX_PASSWORD_LEN = 30;

function buildUserNameFromUser(user) {
  if (!user || typeof user !== "object") return null;
  const candidate =
    (user.username ? `@${user.username}` : null) ||
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.first_name ||
    null;

  if (!candidate) return null;

  let display = candidate.normalize("NFKC").trim();
  if (display.length > 20) display = display.slice(0, 20).trim();

  // мягкая санация
  if (!PLAYER_NAME_RE.test(display)) {
    display = display.replace(/[^\p{L}0-9 _\-@]/gu, "").trim();
    if (!display) return null;
    if (display.length > 20) display = display.slice(0, 20).trim();
  }
  return display;
}

function makeFallbackName() {
  return "Игрок-" + Math.random().toString(36).slice(2, 6);
}

export async function handleJoinRoom(
  socket,
  io,
  client,
  { user, room, playerId, password }
) {
  // Базовые проверки входящих полей для соединения
  if (typeof room !== "string" || !ROOM_ID_RE.test(room)) {
    return socket.emit("joinRoomError", { message: "Неверный ID комнаты." });
  }
  if (typeof playerId !== "string" || !uuidValidate(playerId)) {
    return socket.emit("joinRoomError", { message: "Некорректный playerId." });
  }
  if (password !== undefined) {
    if (typeof password !== "string" || password.length > MAX_PASSWORD_LEN) {
      return socket.emit("joinRoomError", { message: "Неверный пароль." });
    }
  }

  const roomKey = `room:${room}`;

  // WATCH
  await client.watch(roomKey);
  const raw = await client.get(roomKey);
  if (!raw) {
    await client.unwatch();
    return socket.emit("joinRoomError", { message: "Комната не найдена." });
  }

  const roomData = JSON.parse(raw);

  // Пароль (если приватная)
  if (roomData.private && roomData.password !== password) {
    await client.unwatch();
    return socket.emit("joinRoomError", { message: "Неверный пароль." });
  }

  // Ищем игрока по playerId — это ключевой идентификатор для реконнекта
  let existing = roomData.players.find(p => p.playerId === playerId);

  // Если НЕ существующий игрок и игра уже не в лобби — не впускаем
  if (!existing && roomData.phase !== "lobby") {
    await client.unwatch();
    return socket.emit("gameAlreadyStarted");
  }

  // Если НЕ существующий игрок — проверяем лимит мест
  if (!existing && roomData.players.length >= roomData.maxPlayers) {
    await client.unwatch();
    return socket.emit("joinRoomError", { message: "Нет свободных мест." });
  }

  // Собираем видимые поля пользователя (могут отсутствовать при реконнекте)
  const userAvatar = user?.photo_url || null;
  // Имя: если новый игрок — строим из user, иначе не трогаем
  let userNameForNew = buildUserNameFromUser(user) || makeFallbackName();

  // Создаём/обновляем игрока
  let isHost = false;
  if (existing) {
    // Реконнект: не трогаем имя/роль/alive/ready
    existing.id = socket.id;
    // можно обновить аватар, если пришёл новый
    if (userAvatar) existing.avatar = userAvatar;
    isHost = existing.isHost;
  } else {
    // Новый вход
    isHost = roomData.players.length === 0;
    // гарантируем валидность имени под регэксп
    if (!PLAYER_NAME_RE.test(userNameForNew)) {
      userNameForNew = makeFallbackName();
    }
    roomData.players.push({
      id: socket.id,
      name: userNameForNew,
      avatar: userAvatar,
      playerId,
      isHost,
      alive: true,
      role: null,
      ready: false,
    });
  }

  // Атомарная запись
  const tx = client.multi();
  tx.set(roomKey, JSON.stringify(roomData));
  const execResult = await tx.exec();
  if (!execResult) {
    // конфликт записи — пробуем ещё раз с фронта
    return socket.emit("joinRoomError", { message: "Попробуйте ещё раз." });
  }

  // Присоединяем сокет к комнате и сохраняем в контекст сокета
  socket.join(room);
  socket.data = { room, playerId };

  // Публичные данные игроков
  const publicPlayers = roomData.players.map(p => ({
    name:     p.name,
    avatar:   p.avatar,
    playerId: p.playerId,
    isHost:   p.isHost,
    alive:    p.alive,
    ready:    !!p.ready,
  }));

  // Отправляем состояние
  io.to(room).emit("roomData", {
    players:    publicPlayers,
    phase:      roomData.phase,
    maxPlayers: roomData.maxPlayers,
  });

  socket.emit("roomJoined", {
    players:     publicPlayers,
    gameStarted: roomData.phase !== "lobby",
    maxPlayers:  roomData.maxPlayers,
  });

  // Если игра уже идёт — синхронизируем статусы для вошедшего
  if (roomData.phase !== "lobby") {
    const me = roomData.players.find(p => p.playerId === playerId);
    if (me?.role)    socket.emit("roleAssigned", { role: me.role });
    if (!me?.alive)  socket.emit("playerKilled", playerId);
    io.to(room).emit("phaseChanged", {
      phase:      roomData.phase,
      maxPlayers: roomData.maxPlayers,
      players:    publicPlayers,
    });
  }

  // Чат-история
  const historyKey = `chat:${room}`;
  const stored = await client.lRange(historyKey, 0, -1);
  socket.emit("chatHistory", stored.map(m => JSON.parse(m)));

  // Приветствие — только в лобби и только при новом входе
  if (roomData.phase === "lobby" && !existing) {
    await emitSystemMessage(io, client, room, `${userNameForNew} присоединился к комнате.`);
  }

  socket.emit("welcome", { playerId, isHost });
}
