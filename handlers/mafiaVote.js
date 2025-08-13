import { PHASES, ROLES } from "../constants.js";
import { emitSystemMessage, sleep } from "../utils/chatUtils.js";
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
    const allMafiaVoted = livingMafia.every((m) => roomData.nightVotes[m.playerId]);
    let victimId = null;
    let win = null;

    if (allMafiaVoted) {
      const { victimId: votedVictimId } = countVotes(roomData.nightVotes, { allowTie: false });
      victimId = votedVictimId;
      roomData.victimId = victimId; // сохраняем id жертвы для доктора!

      // Проверяем победу до смены фазы!
      win = await checkWinCondition(io, client, room, roomData);
      if (win) {
        // Игра завершена — больше ничего не делаем, не меняем phase!
        // Можно отправить кастомное сообщение, если хочешь, но phaseChanged/gameEnded уже были отправлены.
        return [roomData, async () => {}];
      }
      roomData.phase = PHASES.NIGHT_DOCTOR;
      roomData.nightVotes = {};
    }

    const afterCommit = async () => {
      if (!allMafiaVoted) {
        socket.emit("voteReceived", { phase: PHASES.NIGHT_MAFIA, votedFor: targetId });
        return;
      }
      // Если после проверки победы игра завершена — ничего не делаем!
      if (roomData.phase === "gameOver" || roomData.phase === PHASES.END) return;

      await emitSystemMessage(io, client, room, "Мафия сделала свой выбор.", { delay: 2000 });
      await emitSystemMessage(io, client, room, "Просыпается доктор. Он должен выбрать, кого спасти этой ночью.", { delay: 2000 });

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

