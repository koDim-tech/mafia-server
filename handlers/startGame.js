import { PHASES } from "../constants.js";
import { assignRoles } from "../services/assingRoles.js";
import { persistDeadline, setNightMafiaTimers, setPreGameTimers } from "../services/timers.js";
import { emitSystemMessage, sleep } from "../utils/chatUtils.js";



export async function handleStartGame(socket, io, client) {
  console.log("Запрос на старт игры от", socket.id);
  const { room } = socket.data;
  if (!room) return;

  let raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : null;

  if (!roomData || roomData.phase !== PHASES.LOBBY) {
    console.log("[WARN] Не найдено roomData или неверная фаза для старта", { roomData });
    return;
  }
  if (!Array.isArray(roomData.players) || roomData.players.length === 0) {
    socket.emit("errorMessage", { text: "Нет игроков для старта" });
    return;
  }

  const allReady =
    roomData.players.length >= 1 && roomData.players.every((p) => p.ready);

  if (!allReady) {
    socket.emit("errorMessage", {
      text: "Не все игроки готовы или слишком мало игроков",
    });
    return;
  }

  // 1. Назначаем роли и переводим в фазу голосования мафии
  const shuffled = assignRoles(roomData.players);

  roomData.players = shuffled;
  roomData.phase = PHASES.PRE_GAME;
  roomData.dayVotes = {};
  roomData.nightVotes = {};
  roomData.doctorChoice = null;
  roomData.lastKilled = null;
  roomData.messages = [];


  setPreGameTimers(roomData)


  await client.set(`room:${room}`, JSON.stringify(roomData));
  await persistDeadline(client, room, roomData); 

  // 2. Сразу отправляем роли и фазу всем игрокам
  for (const player of roomData.players) {
    io.to(player.id).emit("roleAssigned", { role: player.role });
  }

  io.to(room).emit("phaseChanged", {
    phase: roomData.phase,
    timers: roomData.timers,
    players: roomData.players.map((p) => ({
      name: p.name,
      playerId: p.playerId,
      isHost: p.isHost,
      alive: p.alive,
    })),
  });

  // 3. Теперь сообщения с задержкой (только для атмосферы)
  await emitSystemMessage(io, client, room, "Добро пожаловать в игру! Пожалуйста, ознакомьтесь с вашими ролями.", { delay: 3000 });
 /*  await sleep(4000) */;
  await emitSystemMessage(io, client, room, "Игра началась! Будьте внимательны и осторожны.", { delay: 2000 });
 /*  await sleep(2500); */
  await emitSystemMessage(io, client, room, "Первая ночь наступает. Мафия, сделайте свой ход.", { delay: 2000 });
}
