// server/handlers/restartGame.js
import { sendRoomState } from "../utils/sendRoomState.js";

export async function handleRestartGame(socket, io, client) {
  const { room } = socket.data;
  if (!room) return;

  const raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : null;
  if (!roomData) return;

  // Сброс на lobby, но все остаются в комнате!
  roomData.phase = "lobby";
  roomData.gameOverTimeoutActive = false;
  roomData.players.forEach(p => {
    p.role = null;
    p.alive = true;
    p.ready = false;
  });
  roomData.dayVotes = {};
  roomData.nightVotes = {};
  roomData.lastKilled = null;

  await client.del(`chat:${room}`); // очищаем чат!
  await client.set(`room:${room}`, JSON.stringify(roomData));
  sendRoomState(io, room, roomData);

  io.to(room).emit('gameRestarted'); // можно ловить на клиенте для сброса UI
}
