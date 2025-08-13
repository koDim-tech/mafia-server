import { ROLES } from '../constants.js';
import { checkWinCondition } from '../services/checkWinCondition.js';

export async function removePlayerFromRoom({ room, playerId, client, io }) {
  const raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : null;
  if (!roomData) return { removed: false };

  // Найти игрока
  const player = roomData.players.find(p => p.playerId === playerId);

  // --- Если сейчас идет игра (не лобби) — просто делаем игрока мертвым (зрителем)
  if (roomData.phase !== 'lobby' && player) {
    if (player.alive) {
      player.alive = false;
      await client.set(`room:${room}`, JSON.stringify(roomData));
      io.to(room).emit('roomData', { players: roomData.players, phase: roomData.phase });
      // После смерти — сразу проверяем победу (если вдруг мафия победила по количеству)
      const aliveMafia = roomData.players.filter(p => p.role === ROLES.MAFIA && p.alive);
      const aliveCiv = roomData.players.filter(p => p.role !== ROLES.MAFIA && p.alive);
      if (aliveMafia.length === 0 || aliveMafia.length >= aliveCiv.length) {
        await checkWinCondition(io, client, room, roomData);
      }
    }
    // Не удаляем из массива!
    return { removed: true, last: false };
  }

  // --- Если лобби, или игрока уже нет — удаляем как раньше
  roomData.players = roomData.players.filter(p => p.playerId !== playerId);

  // Если есть mafia/civilians массивы — чистим
  if (roomData.mafia && Array.isArray(roomData.mafia)) {
    roomData.mafia = roomData.mafia.filter(id => id !== playerId);
  }
  if (roomData.civilians) {
    roomData.civilians = roomData.civilians.filter(id => id !== playerId);
  }

  // Если игроков не осталось — удаляем комнату (всегда!)
  if (roomData.players.length === 0) {
    await client.del(`room:${room}`);
    await client.del(`chat:${room}`);
    return { removed: true, last: true };
  } else {
    await client.set(`room:${room}`, JSON.stringify(roomData));
    // Системное сообщение
    if (player) {
      io.to(room).emit('systemMessage', { text: `${player.name} покинул комнату` });
    }
    io.to(room).emit('roomData', { players: roomData.players, phase: roomData.phase });
    return { removed: true, last: false };
  }
}
