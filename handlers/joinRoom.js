// handlers/joinRoom.js
import { emitSystemMessage } from "../utils/chatUtils.js";
import { validate as uuidValidate } from "uuid";

// Регулярки для валидации
const ROOM_ID_RE      = /^[\w-]{3,30}$/;          // a-zA-Z0-9_-
const PLAYER_NAME_RE  = /^[\p{L}0-9 _-]{1,20}$/u; // буквы любых алфавитов, цифры, пробел, _-
const MAX_PASSWORD_LEN = 30;

export async function handleJoinRoom(
  socket,
  io,
  client,
  { name, room, playerId, password }
) {
  // 1. Типы и простая валидация
  if (
    typeof name !== "string" ||
    typeof room !== "string" ||
    typeof playerId !== "string"
  ) {
    return socket.emit("joinRoomError", { message: "Некорректные данные." });
  }
  name = name.trim();
  if (!PLAYER_NAME_RE.test(name)) {
    return socket.emit("joinRoomError", { message: "Неверное имя игрока." });
  }
  if (!ROOM_ID_RE.test(room)) {
    return socket.emit("joinRoomError", { message: "Неверный ID комнаты." });
  }
  if (!uuidValidate(playerId)) {
    return socket.emit("joinRoomError", { message: "Некорректный playerId." });
  }
  if (password !== undefined) {
    if (typeof password !== "string" || password.length > MAX_PASSWORD_LEN) {
      return socket.emit("joinRoomError", { message: "Неверный пароль." });
    }
  }

  // 2. Начинаем WATCH на ключ
  await client.watch(`room:${room}`);
  const raw = await client.get(`room:${room}`);
  if (!raw) {
    await client.unwatch();
    return socket.emit("joinRoomError", { message: "Комната не найдена." });
  }

  const roomData = JSON.parse(raw);
  // 3. Права доступа
  if (roomData.private && roomData.password !== password) {
    await client.unwatch();
    return socket.emit("joinRoomError", { message: "Неверный пароль." });
  }

  // 4. Ищем существующего (реконнект) или проверяем лимит
  let existing = roomData.players.find(p => p.playerId === playerId);
  if (!existing && roomData.players.length >= roomData.maxPlayers) {
    await client.unwatch();
    return socket.emit("joinRoomError", { message: "Нет свободных мест." });
  }

  let isHost = false;
  if (existing) {
    // реконнект
    existing.id = socket.id;
    existing.name = name;
    isHost = existing.isHost;
  } else {
    // новый вход
    isHost = roomData.players.length === 0;
    roomData.players.push({
      id: socket.id,
      name,
      playerId,
      isHost,
      alive: true,
      role: null,
      ready: false,
    });
  }

  // 5. Не пускаем новых, если не в лобби
  if (roomData.phase !== "lobby" && !existing) {
    await client.unwatch();
    return socket.emit("gameAlreadyStarted");
  }

  // 6. Атомарно сохраняем только если никто не успел изменить за это время
  const tx = client.multi();
  tx.set(`room:${room}`, JSON.stringify(roomData));
  const execResult = await tx.exec(); // null — значит конфликт

  if (!execResult) {
    // кто-то другой модифицировал комнату
    return socket.emit("joinRoomError", { message: "Попробуйте ещё раз." });
  }

  // 7. Всё в порядке — подключаем
  socket.join(room);
  socket.data = { room, playerId };

  // 8. Шлём обновлённое состояние всем в комнате
  const publicPlayers = roomData.players.map(p => ({
    name:     p.name,
    playerId: p.playerId,
    isHost:   p.isHost,
    alive:    p.alive,
    ready:    !!p.ready,
  }));
  io.to(room).emit("roomData", {
    players:    publicPlayers,
    phase:      roomData.phase,
    maxPlayers: roomData.maxPlayers
  });

  socket.emit("roomJoined", {
    players:     publicPlayers,
    gameStarted: roomData.phase !== "lobby",
    maxPlayers:  roomData.maxPlayers
  });

  // 9. Если игра уже идёт — возвращаем роль/статус
  if (roomData.phase !== "lobby") {
    const me = roomData.players.find(p => p.playerId === playerId);
    if (me?.role)    socket.emit("roleAssigned",  { role: me.role });
    if (!me?.alive)  socket.emit("playerKilled", playerId);
    io.to(room).emit("phaseChanged", {
      phase:      roomData.phase,
      maxPlayers: roomData.maxPlayers,
      players:    publicPlayers
    });
  }

  // 10. Чат‑история и welcome
  const historyKey = `chat:${room}`;
  const stored = await client.lRange(historyKey, 0, -1);
  socket.emit("chatHistory", stored.map(m => JSON.parse(m)));

  if (roomData.phase === "lobby") {
    await emitSystemMessage(io, client, room, `${name} присоединился к комнате.`);
  }
  socket.emit("welcome", { playerId, isHost });
}
