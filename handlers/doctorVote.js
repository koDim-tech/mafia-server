// handlers/doctorVote.js
import { PHASES, ROLES } from "../constants.js";
import { emitSystemMessage } from "../utils/chatUtils.js";
import { getPlayer } from "../utils/players.js";
import { withRedisTransaction } from "../utils/withRedisTransaction.js";
import { checkWinCondition } from "../services/checkWinCondition.js";
import assertVoteWindowOrError from "../services/checkCanVote.js";
import { persistDeadline, setDayTimers } from "../services/timers.js";

export async function handleDoctorVote(socket, io, client, { targetId }) {
  const { room, playerId } = socket.data;
  if (!room || !playerId) return;

  const roomKey = `room:${room}`;

  await withRedisTransaction(client, roomKey, async (roomData) => {
    if (!roomData || roomData.phase !== PHASES.NIGHT_DOCTOR) return [roomData];

    const doctor = getPlayer(roomData.players, playerId);
    if (!doctor || !doctor.alive || doctor.role !== ROLES.DOCTOR) return [roomData];

    if (!assertVoteWindowOrError(socket, roomData, "doctor")) return [roomData];

    // Защита от повторного клика в ту же ночь
    if (roomData.doctorVoted) {
      return [roomData, async () => socket.emit("errorMessage", {code: "ALREADY_VOTED", text: "Вы уже сделали выбор этой ночью." })];
    }

    // --- НОВОЕ: правило «не дважды подряд» ---
    const lastDoctorSavedId = roomData.lastDoctorSavedId || null;
    if (targetId && lastDoctorSavedId && targetId === lastDoctorSavedId) {
      // Не принимаем такой выбор, ночь не завершаем
      return [roomData, async () => socket.emit("errorMessage", { text: "Нельзя спасать одного и того же игрока две ночи подряд. Выберите другого." })];
    }

    // Валидируем цель: спасать можно только живого игрока; иначе трактуем как «никого не спасать»
    const target =
      targetId && roomData.players.find((p) => p.playerId === targetId && p.alive)
        ? targetId
        : null;

    roomData.doctorChoice = target;
    roomData.doctorVoted  = true;

    const victimId = roomData.victimId || null;
    let victim = victimId ? roomData.players.find((p) => p.playerId === victimId) : null;

    let doctorSaved = false;
    let someoneDied = false;

    if (!victimId || !victim || !victim.alive) {
      // Тихая ночь — мафия не выбрала/ничья или жертва неактуальна
      doctorSaved = false;
      someoneDied = false;
    } else if (target && target === victimId) {
      // Спасение состоялось
      doctorSaved = true;
      someoneDied = false;
      roomData.lastSaved  = victim.name;
      roomData.lastKilled = null;
    } else {
      // Жертва не спасена
      victim.alive = false;
      someoneDied  = true;
      roomData.lastKilled = victim.name;
      roomData.lastSaved  = null;
    }

    // --- НОВОЕ: запоминаем, кого доктор спасал этой ночью (для запрета в следующую) ---
    // Важно: правило обычно относится к выбору доктора, а не к факту покушения.
    roomData.lastDoctorSavedId = target; // если target === null, разрешим в следующую ночь спасать любого

    // Проверяем победу после фактической смерти
    const win = await checkWinCondition(io, client, room, roomData);
    if (win) {
      return [roomData, async () => {}];
    }

    // День
    roomData.phase = PHASES.DAY;

    // Чистим ночные временные поля
    roomData.victimId      = null;
    roomData.doctorChoice  = null;
    roomData.doctorVoted   = false; // сброс флага на будущую ночь


    setDayTimers(roomData); 
    await persistDeadline(client, room, roomData);

    const afterCommit = async () => {
      if (!victimId || !victim) {
        await emitSystemMessage(io, client, room, "Наступает утро... Ночь прошла спокойно.");
      } else if (doctorSaved) {
        await emitSystemMessage(io, client, room, "Наступает утро... К счастью, сегодня никто не умер.");
        await emitSystemMessage(io, client, room, `Доктор спас ${victim.name}!`);
      } else if (someoneDied) {
        await emitSystemMessage(io, client, room, "Наступает утро... На асфальте виднеются следы крови...");
        await emitSystemMessage(io, client, room, `К сожалению, ${victim.name} был убит этой ночью.`);
      }

      await emitSystemMessage(io, client, room, "Самое время обсудить итоги этой ночи...");

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
    };

    return [roomData, afterCommit];
  });
}
