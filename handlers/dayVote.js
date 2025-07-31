import { PHASE_DISCUSSION_MS } from "../gameSettings.js";
import { checkWinCondition } from "../services/checkWinCondition.js";
import { emitSystemMessage, sleep } from "../utils/chatUtils.js";

export async function handleDayVote(socket, io, client, { targetId }) {
  const { room, playerId } = socket.data;
  if (!room || !playerId) return;

  const roomKey = `room:${room}`;
  let retry = 0;
  while (retry < 5) {
    retry++;
    await client.watch(roomKey);

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

    // Подготовка голосов
    roomData.dayVotes = roomData.dayVotes || {};
    if (roomData.dayVotes[playerId]) {
      await client.unwatch();
      socket.emit("errorMessage", { text: "Вы уже голосовали!" });
      return;
    }
    roomData.dayVotes[playerId] = targetId;

    // Системное сообщение о голосе
    const target = roomData.players.find((p) => p.playerId === targetId);
    if (target) {
      await emitSystemMessage(
        io,
        client,
        room,
        `*${voter.name}* проголосовал за *${target.name}*`
      );
    }

    // Проверяем, все ли живые проголосовали
    const livingPlayers = roomData.players.filter((p) => p.alive);
    const allVoted = livingPlayers.every((pl) => roomData.dayVotes[pl.playerId]);

    const tx = client.multi();

    // Заранее объявляем victim, victimId
    let victim = null;
    let victimId = null;

    if (allVoted) {
      // Подсчёт результатов
      const votes = Object.values(roomData.dayVotes);
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

      // Проверка победы
      const win = await checkWinCondition(io, client, room, roomData);
      if (win) {
        await client.unwatch();
        return;
      }

      // Переход в ночь
      roomData.phase = "night";
      roomData.dayVotes = {};
    }

    tx.set(roomKey, JSON.stringify(roomData));
    const execRes = await tx.exec();
    if (execRes) {
      if (allVoted) {
        // 1) UI-уведомление о новой фазе
        io.to(room).emit("phaseChanged", {
          phase: roomData.phase,
          players: roomData.players.map((p) => ({
            name: p.name,
            playerId: p.playerId,
            isHost: p.isHost,
            alive: p.alive,
          })),
        });

        // 2) Затем системные сообщения и пауза
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
      } else {
        socket.emit("voteReceived", { phase: "day", votedFor: targetId });
      }
      return;
    }
    // если execRes === null — повторяем попытку
  }

  // после 5 неудачных попыток
  socket.emit("errorMessage", {
    text: "Ошибка голосования, попробуйте ещё раз",
  });
}
