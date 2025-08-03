import { PHASE_DISCUSSION_MS } from "../gameSettings.js";
import { checkWinCondition } from "../services/checkWinCondition.js";
import { emitSystemMessage, sleep } from "../utils/chatUtils.js";
import { getLivingPlayers, getPlayer } from "../utils/players.js";
import { PHASES } from "../constants.js";
import { withRedisTransaction } from "../utils/withRedisTransaction.js";
import { countVotes } from "../utils/votes.js";


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

    // Системное сообщение о голосе
    const target = roomData.players.find((p) => p.playerId === targetId);
    let afterCommitMsg = null;
    if (target) {
      // Передаём функцию для afterCommit, чтобы она не ждала внутри транзакции
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
    let victimId = null;
    let win = null;

   if (allVoted) {
  const { victimId, votes, isTie } = countVotes(roomData.dayVotes, { allowTie: false });
  victim = victimId && roomData.players.find((p) => p.playerId === victimId);

  if (victim && victim.alive) {
    victim.alive = false;
    roomData.lastKilled = victim.name;
  }

  win = await checkWinCondition(io, client, room, roomData);
  if (win) {
    return [roomData, afterCommitMsg];
  }

  // Переход в ночь
  roomData.phase = PHASES.NIGHT;
  roomData.dayVotes = {};
}


    // afterCommit: всё, что не влияет на roomData
    const afterCommit = async () => {
      // Сначала сообщение о голосе (если оно было)
      if (afterCommitMsg) await afterCommitMsg();

      if (!allVoted) {
        socket.emit("voteReceived", { phase: "day", votedFor: targetId });
        return;
      }

      io.to(room).emit("phaseChanged", {
        phase: roomData.phase,
        players: roomData.players.map((p) => ({
          name: p.name,
          playerId: p.playerId,
          isHost: p.isHost,
          alive: p.alive,
        })),
      });

      if (victim && victim.alive === false) {
        await emitSystemMessage(
          io,
          client,
          room,
          `Голосование завершено. ${victim.name} был изгнан из города!`
        );
        await sleep(1000);
      }
      await emitSystemMessage(
        io,
        client,
        room,
        "Город засыпает. Наступает ночь..."
      );
      await sleep(PHASE_DISCUSSION_MS);
    };

    return [roomData, afterCommit];
  });
}
