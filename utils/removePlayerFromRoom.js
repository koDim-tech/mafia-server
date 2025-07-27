import { checkWinCondition } from '../services/checkWinCondition.js';

export async function removePlayerFromRoom({ room, playerId, client, io }) {
  const raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : null;
  if (!roomData) return { removed: false };

  // Находим игрока
  const leaver = roomData.players.find(p => p.playerId === playerId);

  // Удаляем игрока из списка
  roomData.players = roomData.players.filter(p => p.playerId !== playerId);

  // Если есть mafia/civilians массивы — чистим
  if (roomData.mafia && Array.isArray(roomData.mafia)) {
    roomData.mafia = roomData.mafia.filter(id => id !== playerId);
  }
  if (roomData.civilians) {
    roomData.civilians = roomData.civilians.filter(id => id !== playerId);
  }

  // === ВАЖНО ===
  // Только если игра идет (phase !== 'lobby'), проверяем победу!
  if (roomData.phase !== 'lobby') {
    // Твой старый паттерн: передаём io, client, room, roomData
    const win = await checkWinCondition(io, client, room, roomData);
    if (win) {
      // checkWinCondition уже сам удалит комнату и пошлет события
      return { removed: true, last: false, gameEnded: true };
    }
  }

  // Если игроков не осталось — удаляем комнату (всегда!)
  if (roomData.players.length === 0) {
    await client.del(`room:${room}`);
    await client.del(`chat:${room}`);
    return { removed: true, last: true };
  } else {
    await client.set(`room:${room}`, JSON.stringify(roomData));
    // Системное сообщение
    if (leaver) {
      io.to(room).emit('systemMessage', { text: `${leaver.name} покиннул комнату` });
    }
    // Только обновляем roomData, никаких gameOver!
    io.to(room).emit('roomData', { players: roomData.players, phase: roomData.phase });
    return { removed: true, last: false };
  }
}
