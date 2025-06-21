import { emitSystemMessage } from "../utils/chatUtils.js";



export async function handleJoinRoom(
  socket,
  io,
  client,
  { name, room, playerId }
) {
  console.log(`Player ${name} (${playerId}) is trying to join room: ${room}`);

  let raw = await client.get(`room:${room}`);
  let roomData = raw
    ? JSON.parse(raw)
    : { players: [], phase: "lobby", gameStarted: false };

  console.log('[DEBUG] После реконнекта', room, 'dayVotes:', roomData.dayVotes);

  let existing = roomData.players.find((p) => p.playerId === playerId);
  let isHost = false;

  // Защита: не впускаем нового если игра уже началась
  if (roomData.phase !== "lobby" && !existing) {
    socket.emit("gameAlreadyStarted");
    return;
  }

  // Добавляем игрока или обновляем socket.id у существующего
  if (!existing) {
    isHost = roomData.players.length === 0;
    roomData.players.push({
      id: socket.id,
      name,
      playerId,
      isHost,
      alive: true,
      role: null,
    });
  } else {
    existing.id = socket.id;
    existing.name = name;
    isHost = existing.isHost;
  }

  await client.set(`room:${room}`, JSON.stringify(roomData));
  socket.join(room);
  socket.data = { room, playerId };

  // Отправляем всем roomData (без ролей)
  io.to(room).emit("roomData", {
    players: roomData.players.map((p) => ({
      name: p.name,
      playerId: p.playerId,
      isHost: p.isHost,
      alive: p.alive,
    })),
    phase: roomData.phase,
  });

  // Лично подключившемуся "roomJoined"
  socket.emit("roomJoined", {
    players: roomData.players.map((p) => ({
      name: p.name,
      playerId: p.playerId,
      isHost: p.isHost,
      alive: p.alive,
    })),
    gameStarted: roomData.phase !== "lobby",
  });

  // Если игра идет — восстановить состояние
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
      players: roomData.players.map((p) => ({
        name: p.name,
        playerId: p.playerId,
        isHost: p.isHost,
        alive: p.alive,
        // role: p.role, // только если нужно для мафии/админа
      })),
    });
  }

  // Чат история
  const historyKey = `chat:${room}`;
  const storedMessages = await client.lRange(historyKey, 0, -1);
  const messages = storedMessages.map((m) => JSON.parse(m));
  socket.emit("chatHistory", messages);

  // Системное сообщение
  await emitSystemMessage(io, client, room, `${name} присоединился к комнате.`);
  socket.emit("welcome", { playerId, isHost });
}
