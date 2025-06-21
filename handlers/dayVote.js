import { checkWinCondition } from "../services/checkWinCondition.js";
import { emitSystemMessage } from "../utils/chatUtils.js";

export async function handleDayVote(socket, io, client, { targetId }) {
  const { room, playerId } = socket.data;
  if (!room || !playerId) return;

  const raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : null;

  if (!roomData || roomData.phase !== "День") return;

  // Текущий игрок
  const voter = roomData.players.find((p) => p.playerId === playerId);
  if (!voter || !voter.alive) return;

  roomData.dayVotes = roomData.dayVotes || {};

  // === ЗАЩИТА: уже голосовал (по playerId) ===
  if (roomData.dayVotes[playerId]) {
    socket.emit("errorMessage", { text: "Вы уже голосовали!" });
    return;
  }

  // Сохраняем голос
  roomData.dayVotes[playerId] = targetId;

  // === ВЫВОД В ЧАТ КАЖДОГО ГОЛОСА ===
  const target = roomData.players.find((p) => p.playerId === targetId);
  if (target) {
    await emitSystemMessage(io, client, room, `*${voter.name}* проголосовал за *${target.name}*`);
  }

  // Проверяем только живых!
  const livingPlayers = roomData.players.filter((p) => p.alive);
  const allVoted = livingPlayers.every((pl) => roomData.dayVotes[pl.playerId]);

  if (allVoted) {
    // Подсчёт результатов
    const votes = Object.values(roomData.dayVotes);
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
      await emitSystemMessage(io, client, room, `${victim.name} был изгнан из города!`);
    }

    // --- Проверка победы ---
    const win = await checkWinCondition(io, client, room, roomData);
    if (win) return; // Если победа, ничего больше не делаем

    // Меняем фазу на "Ночь"
    roomData.phase = "Ночь";
    roomData.dayVotes = {};

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
    // Подтверждение игроку что голос учтен
    socket.emit("voteReceived", { phase: "День", votedFor: targetId });
    // --- Обновляем roomData после каждого голоса ---
    await client.set(`room:${room}`, JSON.stringify(roomData));
  }
}
