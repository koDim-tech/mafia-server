import { PHASES, ROLES } from "../constants.js";
import { emitSystemMessage, sleep } from "../utils/chatUtils.js";
import { getLivingMafia, getPlayer } from "../utils/players.js";
import { withRedisTransaction } from "../utils/withRedisTransaction.js";
import { countVotes } from "../utils/votes.js";
import { checkWinCondition } from "../services/checkWinCondition.js";



import { PHASES, ROLES } from "../constants.js";
import { emitSystemMessage } from "../utils/chatUtils.js";
import { getLivingMafia, getPlayer } from "../utils/players.js";
import { withRedisTransaction } from "../utils/withRedisTransaction.js";
import { countVotes } from "../utils/votes.js";
import { checkWinCondition } from "../services/checkWinCondition.js";

export async function handleMafiaVote(socket, io, client, { targetId }) {
  console.log("Mafia vote request from", socket.id);
  const { room, playerId } = socket.data;
  if (!room || !playerId) return;

  const roomKey = `room:${room}`;

  await withRedisTransaction(client, roomKey, async (roomData) => {
    if (!roomData || roomData.phase !== PHASES.NIGHT_MAFIA) return [roomData];

    const voter = getPlayer(roomData.players, playerId);
    if (!voter || !voter.alive || voter.role !== ROLES.MAFIA) return [roomData];

    roomData.nightVotes = roomData.nightVotes || {};
    if (roomData.nightVotes[playerId]) {
      return [roomData, async () => {
        socket.emit("errorMessage", { text: "Вы уже голосовали!" });
      }];
    }
    roomData.nightVotes[playerId] = targetId;

    const livingMafia = getLivingMafia(roomData.players);
    const allMafiaVoted = livingMafia.every(m => roomData.nightVotes[m.playerId]);

    if (!allMafiaVoted) {
      return [roomData, async () => {
        socket.emit("voteReceived", { phase: PHASES.NIGHT_MAFIA, votedFor: targetId });
      }];
    }

    // --- Все мафии проголосовали ---
    const { victimId } = countVotes(roomData.nightVotes, { allowTie: false });
    roomData.victimId = victimId;     // понадобится доктору
    roomData.nightVotes = {};         // очистка для следующей подсцены

    const hasAliveDoctor = roomData.players.some(p => p.role === ROLES.DOCTOR && p.alive);

    if (hasAliveDoctor) {
      // Переходим к фазе доктора
      roomData.phase = PHASES.NIGHT_DOCTOR;

      const afterCommit = async () => {
        await emitSystemMessage(io, client, room, "Мафия сделала свой выбор.", { delay: 1000 });
        await emitSystemMessage(io, client, room, "Просыпается доктор. Он должен выбрать, кого спасти этой ночью.", { delay: 1000 });

        io.to(room).emit("phaseChanged", {
          phase: roomData.phase,
          players: roomData.players.map(p => ({
            name: p.name,
            playerId: p.playerId,
            isHost: p.isHost,
            alive: p.alive,
          })),
        });
      };

      return [roomData, afterCommit];
    }

    // Доктора нет: сразу применяем убийство и утро
    if (roomData.victimId) {
      const victim = roomData.players.find(p => p.playerId === roomData.victimId);
      if (victim && victim.alive) victim.alive = false;
    }

    // Теперь можно проверить победу (после фактической смерти)
    const win = await checkWinCondition(io, client, room, roomData);
    if (win) {
      // игра завершена внутри checkWinCondition (ожидаемо выставит END/события)
      return [roomData, async () => {}];
    }

    roomData.phase = PHASES.DAY;

    const afterCommit = async () => {
      await emitSystemMessage(io, client, room, "Мафия сделала свой выбор.", { delay: 800 });
      await emitSystemMessage(io, client, room, "Наступает день. Город просыпается.", { delay: 1000 });

      io.to(room).emit("phaseChanged", {
        phase: roomData.phase,
        players: roomData.players.map(p => ({
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



