import { PHASES } from "../constants.js";
import { PHASE_DISCUSSION_MS } from "../gameSettings.js";
import { checkWinCondition } from "../services/checkWinCondition.js";
import { emitSystemMessage, sleep } from "../utils/chatUtils.js";
import { getLivingMafia, getPlayer } from "../utils/players.js";
import { withRedisTransaction } from "../utils/withRedisTransaction.js";
import { countVotes } from "../utils/votes.js";

export async function handleNightVote(socket, io, client, { targetId }) {
  const { room, playerId } = socket.data;
  if (!room || !playerId) return;

  const roomKey = `room:${room}`;

  await withRedisTransaction(client, roomKey, async (roomData) => {
    if (!roomData || roomData.phase !== PHASES.NIGHT) return [roomData];

    const voter = getPlayer(roomData.players, playerId);
    if (!voter || voter.role !== "Мафия" || !voter.alive) return [roomData];

    roomData.nightVotes = roomData.nightVotes || {};
    if (roomData.nightVotes[playerId]) return [roomData, async () => {
      socket.emit("errorMessage", { text: "Вы уже голосовали!" });
    }];

    roomData.nightVotes[playerId] = targetId;

    const livingMafia = getLivingMafia(roomData.players);
    const allVoted = livingMafia.every((m) => roomData.nightVotes[m.playerId]);

    let victim = null;
    let victimId = null;
    let win = null;

   if (allVoted) {
  const { victimId, votes, isTie } = countVotes(roomData.nightVotes, { allowTie: false });
  victim = victimId && roomData.players.find((p) => p.playerId === victimId);

  if (victim && victim.alive) {
    victim.alive = false;
    roomData.lastKilled = victim.name;
  }

  win = await checkWinCondition(io, client, room, roomData);
  if (win) {
    return [roomData];
  }

  roomData.phase = PHASES.DAY;
  roomData.nightVotes = {};
}

    const afterCommit = async () => {
      if (!allVoted) {
        socket.emit("voteReceived", { phase: "night", votedFor: targetId });
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
        await emitSystemMessage(io, client, room, `Наступает утро... На асфальте виднеются следы крови...`);
        await emitSystemMessage(io, client, room, `К сожалению, игрок ${victim.name} был убит этой ночью!`);
        await sleep(2000);
      }
      await emitSystemMessage(io, client, room, 'Самое время обсудить итоги этой ночи... Время');
      await sleep(PHASE_DISCUSSION_MS);
    };

    return [roomData, afterCommit];
  });
}
