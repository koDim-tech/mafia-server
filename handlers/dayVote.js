import { PHASE_DISCUSSION_MS } from "../gameSettings.js";
import { emitSystemMessage, sleep } from "../utils/chatUtils.js";
import { getLivingPlayers, getPlayer } from "../utils/players.js";
import { withRedisTransaction } from "../utils/withRedisTransaction.js";
import { countVotes } from "../utils/votes.js";
import { ROLES, ROLES_DISTRIBUTION,PHASES } from '../constants.js';
import { checkWinCondition } from "../services/checkWinCondition.js";


export async function handleDayVote(socket, io, client, { targetId }) {
  const { room, playerId } = socket.data;
  if (!room || !playerId) return;

  const roomKey = `room:${room}`;

  await withRedisTransaction(client, roomKey, async (roomData) => {
    if (!roomData || roomData.phase !== PHASES.DAY) return [roomData];

    const voter = getPlayer(roomData.players, playerId);
    if (!voter || !voter.alive) return [roomData];

    roomData.dayVotes = roomData.dayVotes || {};
    if (roomData.dayVotes[playerId]) {
      return [roomData, async () => {
        socket.emit("errorMessage", { text: "Вы уже голосовали!" });
      }];
    }
    roomData.dayVotes[playerId] = targetId;

    // Сообщение о голосе (после коммита)
    const target = roomData.players.find((p) => p.playerId === targetId);
    let afterCommitMsg = null;
    if (target) {
      afterCommitMsg = async () => {
        await emitSystemMessage(
          io,
          client,
          room,
          `*${voter.name}* проголосовал за *${target.name}*`
        );
      };
    }

    const livingPlayers = getLivingPlayers(roomData.players);
    const allVoted = livingPlayers.every((pl) => roomData.dayVotes[pl.playerId]);

    let victim = null;
    let win = null;

    if (allVoted) {
      const { victimId: votedVictimId } = countVotes(roomData.dayVotes, { allowTie: false });
      victim = votedVictimId && roomData.players.find((p) => p.playerId === votedVictimId);

      if (victim && victim.alive) {
        victim.alive = false;
        roomData.lastKilled = victim.name;
      }

      win = await checkWinCondition(io, client, room, roomData);
      if (win) {
        // ВНИМАНИЕ: больше ничего не делаем — только сообщение о голосе!
        const afterCommitWin = async () => {
          if (afterCommitMsg) await afterCommitMsg();
        };
        return [roomData, afterCommitWin];
      }

      // Только если не победа:
      roomData.phase = PHASES.NIGHT;
      roomData.dayVotes = {};
    }

    const afterCommit = async () => {
      if (afterCommitMsg) await afterCommitMsg();

      if (!allVoted) {
        socket.emit("voteReceived", { phase: "day", votedFor: targetId });
        return;
      }

      // --- Если после afterCommitMsg фаза уже стала gameOver — ничего не делаем!
      if (roomData.phase === "gameOver" || roomData.phase === PHASES.END) return;

      if (victim && victim.alive === false) {
        await emitSystemMessage(
          io,
          client,
          room,
          `Голосование завершено. ${victim.name} был изгнан из города!`
        );
      }
      await emitSystemMessage(
        io,
        client,
        room,
        "Город засыпает. Наступает ночь..."
      );

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