
import { emitSystemMessage } from '../utils/chatUtils.js';

export async function handleJoinRoom(socket, io, client, { name, room, playerId }) {
  console.log(`Player ${name} (${playerId}) is trying to join room: ${room}`);
  let raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : { players: [], gameStarted: false, phase: null };

  let existing = roomData.players.find(p => p.playerId === playerId);
  let isHost = false;

  if (roomData.gameStarted && !existing) {
    socket.emit('gameAlreadyStarted');
    return;
  }

  if (!existing) {
    isHost = roomData.players.length === 0;
    roomData.players.push({ id: socket.id, name, playerId, isHost, alive: true });
  } else {
    existing.id = socket.id;
    existing.name = name;
    isHost = existing.isHost;
  }

  await client.set(`room:${room}`, JSON.stringify(roomData));

  socket.join(room);
  socket.data = { room, playerId };

  socket.emit('roomJoined', {
    players: roomData.players,
    gameStarted: roomData.gameStarted,
  });

  io.to(room).emit('roomData', { players: roomData.players });

  const historyKey = `chat:${room}`;
  const storedMessages = await client.lRange(historyKey, 0, -1);
  const messages = storedMessages.map(m => JSON.parse(m));
  socket.emit('chatHistory', messages);

  await emitSystemMessage(io, client, room, `${name} присоединился к комнате.`);
  socket.emit('welcome', { playerId, isHost });

  if (roomData.gameStarted) {
    const player = roomData.players.find(p => p.playerId === playerId);
    if (player?.role) socket.emit('yourRole', player.role);
    socket.emit('phaseChange', roomData.phase);
    if (!player.alive) socket.emit('playerKilled', playerId);
  }
};
