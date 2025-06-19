import { checkWinCondition } from '../services/checkWinCondition.js';
import { emitSystemMessage, emitToMafiaOnly } from '../utils/chatUtils.js';

export async function handleNightVote(socket, io, client, { targetId }) {
  console.log('Night vote received:', targetId);
  const { room, playerId } = socket.data || {};
  if (!room || !playerId) return;
  let raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : null;
  if (!roomData || roomData.phase !== 'Ночь') return;

  roomData.nightVotes = roomData.nightVotes || {};
  roomData.nightVotes[playerId] = targetId;
  const voter = roomData.players.find(p => p.playerId === playerId);
  const target = roomData.players.find(p => p.playerId === targetId);
  if (voter && target) {
    await emitToMafiaOnly(io, client, room, `Мафия ${voter.name} проголосовал за ${target.name}`, roomData.players);
  }
  await client.set(`room:${room}`, JSON.stringify(roomData));

  const mafiaPlayers = roomData.players.filter(p => p.role === 'Мафия');
  const votedCount = Object.keys(roomData.nightVotes).length;
  if (votedCount >= mafiaPlayers.length) {
    const counts = {};
    Object.values(roomData.nightVotes).forEach(id => counts[id] = (counts[id] || 0) + 1);
    const victimId = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    /*   roomData.players = roomData.players.filter(p => p.playerId !== victimId); */
    roomData.players = roomData.players.map(p =>
      p.playerId === victimId ? { ...p, alive: false } : p
    );
    delete roomData.nightVotes;
    roomData.phase = 'День';
    await client.set(`room:${room}`, JSON.stringify(roomData));
    io.to(room).emit('playerKilled', victimId);
    const gameEnded = await checkWinCondition(io, client, room, roomData);
    if (gameEnded) return;
    io.to(room).emit('phaseChange', roomData.phase);
    await emitSystemMessage(io, client, room, 'Город просыпается, на асфальте виднеются лужи крови...');
  }
}