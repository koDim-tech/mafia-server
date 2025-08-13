import { PHASES, ROLES } from "../constants.js";
import { emitSystemMessage, sleep } from "../utils/chatUtils.js";
import { getLivingMafia, getPlayer } from "../utils/players.js";
import { withRedisTransaction } from "../utils/withRedisTransaction.js";
import { countVotes } from "../utils/votes.js";

import { PHASE_DISCUSSION_MS } from "../gameSettings.js";
import { checkWinCondition } from "../services/checkWinCondition.js";


export async function handleDoctorVote(socket, io, client, { targetId }) {
  const { room, playerId } = socket.data;
  if (!room || !playerId) return;

  const roomKey = `room:${room}`;

  await withRedisTransaction(client, roomKey, async (roomData) => {
    if (!roomData || roomData.phase !== PHASES.NIGHT_DOCTOR) return [roomData];

    const voter = getPlayer(roomData.players, playerId);
    if (!voter || !voter.alive || voter.role !== ROLES.DOCTOR) return [roomData];

    // Сохраняем выбор доктора
    roomData.doctorChoice = targetId;

    // --- Проверяем исход ночи ---
    let victim = roomData.victimId && roomData.players.find((p) => p.playerId === roomData.victimId);
    let doctorSaved = false;
    if (
      victim &&
      victim.alive &&
      roomData.doctorChoice === roomData.victimId
    ) {
      doctorSaved = true; // жертва спасена
      // victim.alive не меняем
    } else if (victim && victim.alive) {
      victim.alive = false;
      roomData.lastKilled = victim.name;
    }

    // Проверка победы (это может установить phase = gameOver)
    let win = await checkWinCondition(io, client, room, roomData);
    if (win) {
      // Победа, ничего больше не делаем!
      return [roomData, async () => {}];
    }

    // Если нет победителя, переводим в день
    roomData.phase = PHASES.DAY;

    // Чистим временные поля ночи
    roomData.victimId = null;
    roomData.doctorChoice = null;

    const afterCommit = async () => {
      // Всё, что ниже, выполняется только если нет победителя!
      if (victim && victim.alive === false && !doctorSaved) {
        await emitSystemMessage(io, client, room, `Наступает утро... На асфальте виднеются следы крови...`, { delay: 1000 });
        await emitSystemMessage(io, client, room, `К сожалению, игрок ${victim.name} был убит этой ночью!`, { delay: 2000 });
      }
      if (doctorSaved && victim) {
        await emitSystemMessage(io, client, room, `Наступает утро... К счастью, сегодня никто не умер.`, { delay: 1000 });
        await emitSystemMessage(io, client, room, `Доктор этой ночью спас ${victim.name}!`, { delay: 2000 });
      }
      await emitSystemMessage(io, client, room, "Самое время обсудить итоги этой ночи...");

      io.to(room).emit("phaseChanged", {
        phase: roomData.phase,
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
