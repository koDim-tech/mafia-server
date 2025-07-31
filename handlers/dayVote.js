import { checkWinCondition } from "../services/checkWinCondition.js";
import { emitSystemMessage } from "../utils/chatUtils.js";

export async function handleDayVote(socket, io, client, { targetId }) {
  const { room, playerId } = socket.data;
  if (!room || !playerId) return;

  const roomKey = `room:${room}`;
  let retry = 0;
  while (retry < 5) { // 5 попыток на случай гонки
    retry++;

    // 1. WATCH
    await client.watch(roomKey);

    // 2. Получаем roomData
    const raw = await client.get(roomKey);
    let roomData = raw ? JSON.parse(raw) : null;
    if (!roomData || roomData.phase !== "day") {
      await client.unwatch();
      return;
    }

    const voter = roomData.players.find((p) => p.playerId === playerId);
    if (!voter || !voter.alive) {
      await client.unwatch();
      return;
    }

    roomData.dayVotes = roomData.dayVotes || {};

    if (roomData.dayVotes[playerId]) {
      await client.unwatch();
      socket.emit("errorMessage", { text: "Вы уже голосовали!" });
      return;
    }

    // Сохраняем голос
    roomData.dayVotes[playerId] = targetId;

    // Сообщение в чат
    const target = roomData.players.find((p) => p.playerId === targetId);
    if (target) {
      await emitSystemMessage(io, client, room, `*${voter.name}* проголосовал за *${target.name}*`);
    }

    // Проверяем только живых!
    const livingPlayers = roomData.players.filter((p) => p.alive);
    const allVoted = livingPlayers.every((pl) => roomData.dayVotes[pl.playerId]);

    // 3. MULTI (транзакция)
    const tx = client.multi();

    if (allVoted) {
      // Подсчёт результатов
      const votes = Object.values(roomData.dayVotes);
      const voteResult = votes.reduce((acc, curr) => {
        acc[curr] = (acc[curr] || 0) + 1;
        return acc;
      }, {});
      let victimId = Object.entries(voteResult).sort((a, b) => b[1] - a[1])[0][0];
      let victim = roomData.players.find((p) => p.playerId === victimId);

      if (victim && victim.alive) {
        victim.alive = false;
        roomData.lastKilled = victim.name;
        await emitSystemMessage(io, client, room, `${victim.name} был изгнан из города!`);
      }

      // --- Проверка победы ---
      const win = await checkWinCondition(io, client, room, roomData);
      if (win) {
        await client.unwatch();
        return; // победа сама обновит комнату
      }

      // Меняем фазу на "night"
      roomData.phase = "night";
      roomData.dayVotes = {};
    }

    // Сохраняем roomData (через MULTI)
    tx.set(roomKey, JSON.stringify(roomData));
    const execRes = await tx.exec(); // если за время транзакции что-то изменилось — null

    if (execRes) {
      // Успех!
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
      } else {
        socket.emit("voteReceived", { phase: "day", votedFor: targetId });
      }
      return;
    }
    // Если execRes === null — был конфликт, повторяем с начала
  }
  // Если не вышло за 5 попыток
  socket.emit("errorMessage", { text: "Ошибка голосования, попробуйте ещё раз" });
}
