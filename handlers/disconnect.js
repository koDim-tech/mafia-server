import { removePlayerFromRoom } from '../utils/removePlayerFromRoom.js';

// Объявление disconnectTimers если еще не было
const disconnectTimers = global.disconnectTimers || new Map();
global.disconnectTimers = disconnectTimers;

export async function handleDisconnect(socket, io, client) {
  const { room, playerId } = socket.data;
  if (!room || !playerId) return;

  // Таймер на 1 минуту (60 000 миллисекунд)
  const timer = setTimeout(async () => {
    // После таймера проверяем, что игрок всё ещё отсутствует (можно добавить доп. проверку)
    await removePlayerFromRoom({ room, playerId, client, io });
    disconnectTimers.delete(playerId);
    socket.leave(room);
  }, 60_000);

  disconnectTimers.set(playerId, timer);
}
