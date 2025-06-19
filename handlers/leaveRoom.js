
export async function handleLeaveRoom(socket, io, client) {
  const { room, playerId } = socket.data || {};
  if (!room || !playerId) return;

  const raw = await client.get(`room:${room}`);
  if (!raw) return;
  const roomData = JSON.parse(raw);

  roomData.players = roomData.players.filter(p => p.playerId !== playerId);

  if (roomData.players.length === 0) {
    await client.del(`room:${room}`);
    console.log(`Комната ${room} удалена (все вышли)`);
  } else {
    await client.set(`room:${room}`, JSON.stringify(roomData));
    io.to(room).emit('roomData', { players: roomData.players });
  }

  socket.leave(room);
  socket.emit('leftRoom'); // <-- вот это важно
}
