import { checkWinCondition } from "../services/checkWinCondition.js";
import { emitSystemMessage } from "../utils/chatUtils.js";

export async function handleNightVote(socket, io, client, { targetId }) {
  const { room, playerId } = socket.data;
  if (!room || !playerId) return;

  const raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : null;
  if (!roomData || roomData.phase !== "Ночь") return;

  const voter = roomData.players.find((p) => p.playerId === playerId);
  if (!voter || voter.role !== "Мафия" || !voter.alive) return;

  roomData.nightVotes = roomData.nightVotes || {};

  // ЗАЩИТА: уже голосовал
  if (roomData.nightVotes[playerId]) {
    socket.emit("errorMessage", { text: "Вы уже голосовали!" });
    return;
  }

  roomData.nightVotes[playerId] = targetId;

  // Проверяем, все ли живые мафии проголосовали
  const livingMafia = roomData.players.filter(
    (p) => p.role === "Мафия" && p.alive
  );
  const allVoted = livingMafia.every((m) => roomData.nightVotes[m.playerId]);

  if (allVoted) {
    // Подсчёт результатов
    const votes = Object.values(roomData.nightVotes);
    const voteResult = votes.reduce((acc, curr) => {
      acc[curr] = (acc[curr] || 0) + 1;
      return acc;
    }, {});

    // Находим жертву по большинству голосов
    let victimId = Object.entries(voteResult).sort((a, b) => b[1] - a[1])[0][0];
    let victim = roomData.players.find((p) => p.playerId === victimId);

    if (victim && victim.alive) {
      victim.alive = false;
      roomData.lastKilled = victim.name;
      await emitSystemMessage(io, client, room, `${victim.name} был убит ночью!`);
    }

    // Проверка победы!
    const win = await checkWinCondition(io, client, room, roomData);
    if (win) return;

    // Меняем фазу на "День"
    roomData.phase = "День";
    roomData.nightVotes = {};

    await client.set(`room:${room}`, JSON.stringify(roomData));

    io.to(room).emit("phaseChanged", {
      phase: roomData.phase,
      players: roomData.players.map((p) => ({
        name: p.name,
        playerId: p.playerId,
        isHost: p.isHost,
        alive: p.alive,
      })),
    });
  } else {
    socket.emit("voteReceived", { phase: "Ночь", votedFor: targetId });
  }
}
