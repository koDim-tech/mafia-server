export const checkWinCondition = async (io, client, room, roomData) => {
  const mafia = roomData.players.filter(p => p.role === 'Мафия');
  const civilians = roomData.players.filter(p => p.role !== 'Мафия');

  let message = null;
  let winner = null;

  if (mafia.length === 0) {
    message = 'Мирные победили!';
    winner = 'civilians';
  } else if (mafia.length >= civilians.length) {
    message = 'Мафия победила!';
    winner = 'mafia';
  }

  if (message) {
    await emitSystemMessage(io, client, room, message);
    io.to(room).emit('gameEnded', { winner });

    // Запускаем таймер очистки через 1 минуту
    setTimeout(async () => {
      await client.del(`room:${room}`);
      await client.del(`chat:${room}`);
      io.to(room).emit('roomClosed');
    }, 60_000); // 60 секунд
    return true;
  }

  return false;
};