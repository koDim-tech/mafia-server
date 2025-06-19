export async function handleDisconnect(socket, io, client) {
  const { room, playerId } = socket.data || {};
  if (!room) return;
  let raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : null;
  if (!roomData) return;
  const p = roomData.players.find(p => p.playerId === playerId);
  if (p) p.id = null;
  await client.set(`room:${room}`, JSON.stringify(roomData));
  io.to(room).emit('roomData', { players: roomData.players });
}