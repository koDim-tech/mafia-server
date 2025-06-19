export async function handlePlayerMessage(socket, io, client, { text }) {

  const { room, playerId } = socket.data || {};
  if (!room || !text || !playerId) return;

  const raw = await client.get(`room:${room}`);
  const roomData = raw ? JSON.parse(raw) : null;
  if (!roomData || roomData.phase !== 'День') {
    console.log('Сообщение не доставлено — не день или нет комнаты');
    return;
  }

  const sender = roomData.players.find(p => p.playerId === playerId);
  if (!sender || !sender.name || sender.alive === false) return;

 const message = { sender: sender.name, text, type: 'player' };
  
  io.to(room).emit('playerMessage', message);

  const historyKey = `chat:${room}`;
  await client.rPush(historyKey, JSON.stringify(message));
}