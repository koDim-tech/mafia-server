import { assignRoles } from '../gameLogic.js';
import { emitSystemMessage } from '../utils/chatUtils.js';


export async function handleStartGame(socket, io, client) {
  const { room, playerId } = socket.data;
  let raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : null;
  if (!roomData) return;

  const player = roomData.players.find(p => p.playerId === playerId);
  if (!player || !player.isHost) return;

  const roles = assignRoles(roomData.players);
  roomData.players = roomData.players.map((p, i) => ({ ...p, role: roles[i] }));
  roomData.phase = 'Ночь';
  roomData.gameStarted = true;

  await client.set(`room:${room}`, JSON.stringify(roomData));

  roomData.players.forEach(p => io.to(p.id).emit('yourRole', p.role));
  io.to(room).emit('phaseChange', roomData.phase);
  io.to(room).emit('startGame');
  await emitSystemMessage(io, client, room, 'Город засыпает...');
}