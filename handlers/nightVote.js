import { PHASE_DISCUSSION_MS } from "../gameSettings.js";
import { checkWinCondition } from "../services/checkWinCondition.js";
import { emitSystemMessage, sleep } from "../utils/chatUtils.js";

export async function handleNightVote(socket, io, client, { targetId }) {
  const { room, playerId } = socket.data;
  if (!room || !playerId) return;

  const roomKey = `room:${room}`;
  let retry = 0;
  while (retry < 5) {
    retry++;
    await client.watch(roomKey);

    const raw = await client.get(roomKey);
    let roomData = raw ? JSON.parse(raw) : null;
    if (!roomData || roomData.phase !== "night") {
      await client.unwatch();
      return;
    }

    const voter = roomData.players.find((p) => p.playerId === playerId);
    if (!voter || voter.role !== "Мафия" || !voter.alive) {
      await client.unwatch();
      return;
    }

    roomData.nightVotes = roomData.nightVotes || {};
    if (roomData.nightVotes[playerId]) {
      await client.unwatch();
      socket.emit("errorMessage", { text: "Вы уже голосовали!" });
      return;
    }
    roomData.nightVotes[playerId] = targetId;

    const livingMafia = roomData.players.filter(
      (p) => p.role === "Мафия" && p.alive
    );
    const allVoted = livingMafia.every((m) => roomData.nightVotes[m.playerId]);

    const tx = client.multi();

    // -- объявляем заранее
    let victim = null;
    let victimId = null;

    if (allVoted) {
      const votes = Object.values(roomData.nightVotes);
      const voteResult = votes.reduce((acc, curr) => {
        acc[curr] = (acc[curr] || 0) + 1;
        return acc;
      }, {});
      victimId = Object.entries(voteResult).sort((a, b) => b[1] - a[1])[0][0];
      victim = roomData.players.find((p) => p.playerId === victimId);

      if (victim && victim.alive) {
        victim.alive = false;
        roomData.lastKilled = victim.name;
      }

      const win = await checkWinCondition(io, client, room, roomData);
      if (win) {
        await client.unwatch();
        return;
      }

      roomData.phase = "day";
      roomData.nightVotes = {};
    }

    tx.set(roomKey, JSON.stringify(roomData));
    const execRes = await tx.exec();
    if (execRes) {
      if (allVoted) {
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
      } else {
        socket.emit("voteReceived", { phase: "night", votedFor: targetId });
      }
      return;
    }
  }
  socket.emit("errorMessage", { text: "Ошибка голосования, попробуйте ещё раз" });
}

