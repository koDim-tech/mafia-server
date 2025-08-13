import { emitSystemMessage } from "../utils/chatUtils.js";
import { ROLES, ROLES_DISTRIBUTION } from '../constants.js';

export const checkWinCondition = async (io, client, room, roomData) => {
  if (!roomData || !Array.isArray(roomData.players)) return false;

  const MIN_PLAYERS_FOR_WIN = 3; 
  const livingPlayers = roomData.players.filter(p => p.alive);

  if (livingPlayers.length < MIN_PLAYERS_FOR_WIN) {
    await endGame(io, client, room, roomData, null, 'Игра окончена: недостаточно игроков для продолжения.');
    return true;
  }

  const mafia = roomData.players.filter(p => p.role === ROLES.MAFIA && p.alive);
  const civilians = roomData.players.filter(p => p.role !== ROLES.MAFIA && p.alive);

  if (mafia.length === 0) {
    await endGame(io, client, room, roomData, ROLES.CIVILIAN, 'Мирные победили!');
    return true;
  } else if (mafia.length >= civilians.length) {
    await endGame(io, client, room, roomData, ROLES.MAFIA, 'Мафия победила!');
    return true;
  }
  return false;
};


async function endGame(io, client, room, roomData, winner, message) {
  roomData.phase = 'gameOver';
  roomData.gameOverTimeoutActive = true;
  await client.set(`room:${room}`, JSON.stringify(roomData));
  if (message) await emitSystemMessage(io, client, room, message);

  io.to(room).emit('phaseChanged', {
    phase: 'gameOver',
    maxPlayers: roomData.maxPlayers,
    winner,
    players: roomData.players.map(p => ({
      name: p.name,
      playerId: p.playerId,
      isHost: p.isHost,
      alive: p.alive,
    })),
  });
  io.to(room).emit('gameEnded', { winner });

  setTimeout(async () => {
    const fresh = await client.get(`room:${room}`);
    if (!fresh) return;
    const state = JSON.parse(fresh);
    if (state.phase === 'gameOver' && state.gameOverTimeoutActive) {
      await client.del(`room:${room}`);
      await client.del(`chat:${room}`);
      io.to(room).emit('roomClosed');
    }
  }, 60_000);
}
