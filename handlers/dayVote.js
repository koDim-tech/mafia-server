import { checkWinCondition } from '../services/checkWinCondition.js';
import { emitSystemMessage } from '../utils/chatUtils.js';

export async function handleDayVote(socket, io, client, { targetId }) {
  const { room, playerId } = socket.data || {};
  if (!room || !playerId) return;
  let raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : null;
  if (!roomData || roomData.phase !== 'День') return;

  roomData.dayVotes = roomData.dayVotes || {};
  roomData.dayVotes[playerId] = targetId;
  const voter = roomData.players.find(p => p.playerId === playerId);
  const target = roomData.players.find(p => p.playerId === targetId);
  if (voter && target) {
    await emitSystemMessage(io, client, room, `${voter.name} проголосовал за ${target.name}`);
  }
  await client.set(`room:${room}`, JSON.stringify(roomData));

  const aliveCount = roomData.players.length;
  const votedCount = Object.keys(roomData.dayVotes).length;
  if (votedCount >= aliveCount) {
    const counts = {};
    Object.values(roomData.dayVotes).forEach(id => {
      counts[id] = (counts[id] || 0) + 1;
    });

    const entries = Object.entries(counts);
    const max = Math.max(...entries.map(e => e[1]));
    const mostVoted = entries.filter(([_, count]) => count === max);

    delete roomData.dayVotes;

    if (mostVoted.length > 1) {
      await emitSystemMessage(io, client, room, 'Ничья — никто не был казнен.');
      roomData.phase = 'Ночь';
      await client.set(`room:${room}`, JSON.stringify(roomData));
      io.to(room).emit('phaseChange', 'Ночь');
      await emitSystemMessage(io, client, room, 'Город засыпает...');
      return;
    }

    const eliminatedId = mostVoted[0][0];
    roomData.players = roomData.players.filter(p => p.playerId !== eliminatedId);
    await client.set(`room:${room}`, JSON.stringify(roomData));
    io.to(room).emit('playerEliminated', eliminatedId);

    const gameEnded = await checkWinCondition(io, client, room, roomData);
    if (gameEnded) return;

    roomData.phase = 'Ночь';
    await client.set(`room:${room}`, JSON.stringify(roomData));
    io.to(room).emit('phaseChange', 'Ночь');
    await emitSystemMessage(io, client, room, 'Город засыпает...');
  }
}