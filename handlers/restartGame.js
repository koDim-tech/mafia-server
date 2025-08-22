// server/handlers/restartGame.js
import { sendRoomState } from "../utils/sendRoomState.js";

export async function handleRestartGame(socket, io, client) {
  const { room } = socket.data;
  if (!room) return;

  const raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : null;
  if (!roomData) return;

  // Сброс на lobby, но все остаются в комнате
  roomData.phase = "lobby";
  roomData.gameOverTimeoutActive = false;
  roomData.gameStarted = false;

  // Сброс статусов игроков
  roomData.players.forEach(p => {
    p.role  = null;
    p.alive = true;
    p.ready = false;
  });

  // 💧 Полный сброс состояний дня/ночи и служебных флагов
  roomData.dayVotes          = {};
  roomData.nightVotes        = {};
  roomData.victimId          = null;
  roomData.doctorChoice      = null;
  roomData.doctorVoted       = false;
  roomData.lastKilled        = null;
  roomData.lastSaved         = null;
  roomData.lastDoctorSavedId = null;

  // (опционально) очистка истории чата
  await client.del(`chat:${room}`);

  await client.set(`room:${room}`, JSON.stringify(roomData));

  // Рассылаем обновлённое состояние
  sendRoomState(io, room, roomData);
  io.to(room).emit("gameRestarted"); // клиент может дополнительно обнулять локальные стейты/UI
}
