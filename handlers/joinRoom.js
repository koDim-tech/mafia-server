import { emitSystemMessage } from "../utils/chatUtils.js";

// Для race protection — можно сделать простую блокировку на уровне кода (или через Redis-lock, но тут не нужно)
export async function handleJoinRoom(
  socket,
  io,
  client,
  { name, room, playerId, password }
) {
  console.log(`Player ${name} (${playerId}) is trying to join room: ${room}`);

  let raw = await client.get(`room:${room}`);
  if (!raw) {
    socket.emit("joinRoomError", { message: "Комната не найдена" });
    return;
  }
  let roomData = JSON.parse(raw);

  if (roomData.private && roomData.password !== password) {
    socket.emit("joinRoomError", { message: "Неверный пароль" });
    return;
  }

  // Найдем игрока по playerId (на случай реконнекта)
  let existing = roomData.players.find((p) => p.playerId === playerId);
  let isHost = false;

  // Сначала — если он уже в комнате, просто обновляем id
  if (existing) {
    existing.id = socket.id;
    existing.name = name;
    isHost = existing.isHost;
  } else {
    // Проверяем место только при добавлении нового
    if (roomData.players.length >= roomData.maxPlayers) {
      socket.emit("joinRoomError", { message: "В комнате нет свободных мест" });
      return;
    }
    // Если еще не было — добавляем
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

    // 👉 СРАЗУ после добавления — перепроверяем лимит!
/*     if (roomData.players.length > roomData.maxPlayers) {
      // Откатываем добавление
      roomData.players = roomData.players.filter(p => p.playerId !== playerId);
      await client.set(`room:${room}`, JSON.stringify(roomData));
      console.log('-1 player')
      socket.emit("joinRoomError", { message: "В комнате уже нет мест" });
      return;
    } */
  }

  // Фаза "не лобби" — не пускать новых
  if (roomData.phase !== "lobby" && !existing) {
    socket.emit("gameAlreadyStarted");
    return;
  }

  // Сохраняем обновленную комнату
  await client.set(`room:${room}`, JSON.stringify(roomData));
  socket.join(room);
  socket.data = { room, playerId };

  // Рассылаем roomData всем в комнате
  io.to(room).emit("roomData", {
    players: roomData.players.map((p) => ({
      name: p.name,
      playerId: p.playerId,
      isHost: p.isHost,
      alive: p.alive,
      ready: !!p.ready,
    })),
    phase: roomData.phase,
    maxPlayers: roomData.maxPlayers,
  });

  // Лично подключившемуся "roomJoined"
  socket.emit("roomJoined", {
    players: roomData.players.map((p) => ({
      name: p.name,
      playerId: p.playerId,
      isHost: p.isHost,
      alive: p.alive,
      ready: !!p.ready,
    })),
    gameStarted: roomData.phase !== "lobby",
    maxPlayers: roomData.maxPlayers,
  });

  // Если игра уже идет — отправить роль/статус
  if (roomData.phase && roomData.phase !== "lobby") {
    const player = roomData.players.find((p) => p.playerId === playerId);
    if (player && player.role) {
      socket.emit("roleAssigned", { role: player.role });
    }
    if (player && player.alive === false) {
      socket.emit("playerKilled", playerId);
    }
    io.to(room).emit("phaseChanged", {
      phase: roomData.phase,
      maxPlayers: roomData.maxPlayers,
      players: roomData.players.map((p) => ({
        name: p.name,
        playerId: p.playerId,
        isHost: p.isHost,
        alive: p.alive,
        ready: !!p.ready,
      })),
    });
  }

  // Чат-история
  const historyKey = `chat:${room}`;
  const storedMessages = await client.lRange(historyKey, 0, -1);
  const messages = storedMessages.map((m) => JSON.parse(m));
  socket.emit("chatHistory", messages);

  // Системное сообщение
  roomData.phase === "lobby" && await emitSystemMessage(io, client, room, `${name} присоединился к комнате.`);
  socket.emit("welcome", { playerId, isHost });
}
