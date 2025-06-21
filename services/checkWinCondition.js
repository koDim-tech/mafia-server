// server/services/checkWinCondition.js
import { emitSystemMessage } from "../utils/chatUtils.js";

export const checkWinCondition = async (io, client, room, roomData) => {
  if (!roomData || !Array.isArray(roomData.players)) return false;

  const mafia = roomData.players.filter(p => p.role === 'Мафия' && p.alive);
  const civilians = roomData.players.filter(p => p.role !== 'Мафия' && p.alive);

  let message = null;
  let winner = null;

  if (mafia.length === 0) {
    message = 'Мирные победили!';
    winner = 'civilians';
  } else if (mafia.length >= civilians.length) {
    message = 'Мафия победила!';
    winner = 'mafia';
  }

 if (message && roomData.phase !== 'lobby') {
  roomData.phase = 'gameOver';
  roomData.gameOverTimeoutActive = true; // <--- Флаг активного таймера!
  await client.set(`room:${room}`, JSON.stringify(roomData));
  await emitSystemMessage(io, client, room, message);

  io.to(room).emit('phaseChanged', {
    phase: 'gameOver',
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
    // Проверяем, не ушла ли комната в новую игру:
    const fresh = await client.get(`room:${room}`);
    if (!fresh) return;
    const state = JSON.parse(fresh);

    // Если ещё gameOver и флаг активен — удаляем
    if (state.phase === 'gameOver' && state.gameOverTimeoutActive) {
      await client.del(`room:${room}`);
      await client.del(`chat:${room}`);
      io.to(room).emit('roomClosed');
    }
  }, 60_000);

  return true;
}
  return false;
};
