

export async function handleEndGame(socket, io, client) {
  const { room } = socket.data || {};
  if (!room) return;
  io.to(room).emit('gameEnded');
  await client.del(`room:${room}`);
  console.log(`Комната ${room} удалена из Redis`);
}