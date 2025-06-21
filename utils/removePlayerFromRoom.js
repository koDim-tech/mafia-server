import { checkWinCondition } from '../services/checkWinCondition.js'; // Или твой путь

export async function removePlayerFromRoom({ room, playerId, client, io }) {
  const raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : null;
  if (!roomData) return { removed: false };

  // Находим игрока (для systemMessage)
  const leaver = roomData.players.find(p => p.playerId === playerId);

  // Удаляем игрока из списка
  roomData.players = roomData.players.filter(p => p.playerId !== playerId);

  // Если есть массив mafia/civilians — удаляем и оттуда
  if (roomData.mafia && Array.isArray(roomData.mafia)) {
    roomData.mafia = roomData.mafia.filter(id => id !== playerId);
  } else if (roomData.mafia === playerId) {
    roomData.mafia = null;
  }
  if (roomData.civilians) {
    roomData.civilians = roomData.civilians.filter(id => id !== playerId);
  }

  // === ВОТ СЮДА вставляешь проверку условия победы ===
  // Если фаза не "Лобби", проверить победу после удаления игрока!
  if (roomData.phase !== 'Лобби') {
    const win = checkWinCondition(roomData);
    if (win) {
      io.to(room).emit('gameEnded', { winner: win });
      await client.del(`room:${room}`);
      return { removed: true, last: false, gameEnded: true };
    }
  }
  // === КОНЕЦ вставки ===

  // Если игроков не осталось — удаляем комнату
  if (roomData.players.length === 0) {
    await client.del(`room:${room}`);
    return { removed: true, last: true };
  } else {
    await client.set(`room:${room}`, JSON.stringify(roomData));
    // Системное сообщение
    if (leaver) {
      io.to(room).emit('systemMessage', { text: `${leaver.name} покинул комнату` });
    }
    io.to(room).emit('roomData', { players: roomData.players, phase: roomData.phase });
    return { removed: true, last: false };
  }
}
