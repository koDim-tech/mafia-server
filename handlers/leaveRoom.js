import { removePlayerFromRoom } from '../utils/removePlayerFromRoom.js';

export async function handleLeaveRoom(socket, io, client) {
  const { room, playerId } = socket.data;
  if (!room || !playerId) return;

  await removePlayerFromRoom({ room, playerId, client, io });
  socket.leave(room);
}
