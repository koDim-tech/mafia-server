// services/deadlineTicker.js
import { fetchExpiredDeadlines, removeDeadline, tryProcessDeadline } from "./voteDeadlines.js";
import { withRedisTransaction } from "../utils/withRedisTransaction.js";
import { PHASES, ROLES } from "../constants.js";
import { countVotes } from "../utils/votes.js";
import { checkWinCondition } from "../services/checkWinCondition.js";
import { emitSystemMessage } from "../utils/chatUtils.js";
import { setNightMafiaTimers, setNightDoctorTimers, setDayTimers, persistDeadline } from "./timers.js";

// ... твой startDeadlineTicker(...)
export function startDeadlineTicker(io, client) {
  setInterval(async () => {
    const now = Date.now();
    let expired = [];
    try { expired = await fetchExpiredDeadlines(client, now); } catch { return; }

    for (const member of expired) {
      const parts = member.split("|");
      if (parts.length < 3) { await removeDeadline(client, member); continue; }
      const [roomId, kind, endsAtStr] = parts;
      const endsAt = Number(endsAtStr) || 0;

      const locked = await tryProcessDeadline(client, member);
      if (!locked) continue;

      const roomKey = `room:${roomId}`;
      await withRedisTransaction(client, roomKey, async (roomData) => {
        if (!roomData) return [roomData];

        const done = [roomData, async () => { await removeDeadline(client, member); }];

        // ① Универсальные АНОНСЫ (announce:<baseKind>:<sec>)
        if (kind.startsWith("announce:")) {
          const msgDone = await tryEmitAnnounce(io, client, roomId, roomData, kind, endsAt);
          return done; // при любом исходе анонс удаляем
        }

        // ② Предстарт закончился → переходим к мафии
        if (kind === "preGame" &&
            roomData.phase === PHASES.PRE_GAME &&
            roomData.timers?.preGame?.endsAt === endsAt &&
            now >= endsAt) {
          await advanceAfterPreGameTimeout(io, client, roomId, roomData);
          return done;
        }

        // ③ Ночь: мафия
        if (kind === "nightMafiaVote" && roomData.phase === PHASES.NIGHT_MAFIA &&
            roomData.timers?.nightMafiaVote?.endsAt === endsAt && now >= endsAt) {
          await advanceAfterNightMafiaTimeout(io, client, roomId, roomData);
          return done;
        }

        // ④ Ночь: доктор
        if (kind === "nightDoctorVote" && roomData.phase === PHASES.NIGHT_DOCTOR &&
            roomData.timers?.nightDoctorVote?.endsAt === endsAt && now >= endsAt) {
          await advanceAfterNightDoctorTimeout(io, client, roomId, roomData);
          return done;
        }

        // ⑤ День: обсуждение → голосование
        if (kind === "dayDiscussionEnd" && roomData.phase === PHASES.DAY &&
            roomData.timers?.dayDiscussion?.endsAt === endsAt && now >= endsAt) {
          if (roomData.dayStage !== "voting") {
            roomData.dayStage = "voting";
            await emitSystemMessage(io, client, roomId, "Обсуждение завершено. Начинается голосование.");
            io.to(roomId).emit("phaseChanged", {
              phase: roomData.phase,
              timers: roomData.timers,
              dayStage: roomData.dayStage,
              players: pubPlayers(roomData),
            });
          }
          return done;
        }

        // ⑥ День: окончание голосования
        if (kind === "dayVote" && roomData.phase === PHASES.DAY &&
            roomData.timers?.dayVote?.endsAt === endsAt && now >= endsAt) {
          await advanceAfterDayVoteTimeout(io, client, roomId, roomData);
          return done;
        }

        // неактуально — убрать
        return done;
      });
    }
  }, 1000);
}

/** Универсальная обработка announce:<baseKind>:<sec> */
async function tryEmitAnnounce(io, client, roomId, roomData, kind, announceEndsAt) {
  // kind = "announce:dayVote:5"
  const [, baseKind, secStr] = kind.split(":");
  const s = Number(secStr) || 0;
  const t = roomData.timers || {};

  // Проверка актуальности (фаза/стадия + совпадение endsAt - s)
  const is = (timerKey, { phase, dayStage }) => {
    const timer = t[timerKey];
    if (!timer) return false;
    if (timer.endsAt - s * 1000 !== announceEndsAt) return false;
    if (phase && roomData.phase !== phase) return false;
    if (typeof dayStage !== "undefined" && roomData.dayStage !== dayStage) return false;
    return true;
  };

  let ok = false;
  let text = "";

  switch (baseKind) {
    case "preGame":
      ok = is("preGame", { phase: PHASES.PRE_GAME });
      text = `Игра начнётся через ${s} сек.`;
      break;

    case "nightMafiaVote":
      ok = is("nightMafiaVote", { phase: PHASES.NIGHT_MAFIA });
      text = `Ход мафии завершится через ${s} сек.`;
      break;

    case "nightDoctorVote":
      ok = is("nightDoctorVote", { phase: PHASES.NIGHT_DOCTOR });
      text = `Ход доктора завершится через ${s} сек.`;
      break;

    case "dayDiscussion":
      ok = is("dayDiscussion", { phase: PHASES.DAY, dayStage: "discussion" });
      text = `Обсуждение завершится через ${s} сек.`;
      break;

    case "dayVote":
      ok = is("dayVote", { phase: PHASES.DAY, dayStage: "voting" });
      text = `Голосование завершится через ${s} сек.`;
      break;

    case "toLobby":
    ok =
      is("toLobby", { phase: PHASES.POST_GAME }) ||
      is("toLobby", { phase: PHASES.GAME_OVER }); // если ещё не переключился на POST_GAME
      text = `Возврат в лобби через ${s} сек.`;
      break;

    default:
      ok = false;
  }

  if (ok && s > 0) {
    await emitSystemMessage(io, client, roomId, text);
    return true;
  }
  return false;
}

// ── уже существующие обработчики (оставь как есть) ──
async function advanceAfterPreGameTimeout(io, client, room, roomData) {
  roomData.phase = PHASES.NIGHT_MAFIA;
  setNightMafiaTimers(roomData);
  await emitSystemMessage(io, client, room, "Игра началась. Город засыпает. Просыпается мафия.");
  io.to(room).emit("phaseChanged", { phase: roomData.phase, timers: roomData.timers, players: pubPlayers(roomData) });
  await persistDeadline(client, room, roomData);
}

async function advanceAfterNightMafiaTimeout(io, client, room, roomData) {
  const { victimId } = countVotes(roomData.nightVotes || {}, { allowTie: false });
  roomData.victimId = victimId || null;
  roomData.nightVotes = {};

  const hasAliveDoctor = roomData.players.some(p => p.role === ROLES.DOCTOR && p.alive);

  if (hasAliveDoctor) {
    roomData.phase = PHASES.NIGHT_DOCTOR;
    setNightDoctorTimers(roomData);
    await emitSystemMessage(io, client, room, "Время мафии истекло. Просыпается доктор.");
    io.to(room).emit("phaseChanged", { phase: roomData.phase, timers: roomData.timers, players: pubPlayers(roomData) });
    await persistDeadline(client, room, roomData);
    return;
  }

  if (roomData.victimId) {
    const vic = roomData.players.find(p => p.playerId === roomData.victimId);
    if (vic && vic.alive) vic.alive = false;
  }

  const win = await checkWinCondition(io, client, room, roomData);
  if (win) return;

  roomData.phase = PHASES.DAY;
  setDayTimers(roomData);
  await emitSystemMessage(io, client, room, "Время мафии истекло. Наступает день.");
  io.to(room).emit("phaseChanged", { phase: roomData.phase, timers: roomData.timers, dayStage: roomData.dayStage, players: pubPlayers(roomData) });
  await persistDeadline(client, room, roomData);
}

async function advanceAfterNightDoctorTimeout(io, client, room, roomData) {
  const victimId = roomData.victimId || null;
  const target   = roomData.doctorChoice || null;

  if (victimId) {
    const vic = roomData.players.find(p => p.playerId === victimId);
    if (vic && vic.alive && !(target && target === victimId)) {
      vic.alive = false;
      roomData.lastKilled = vic.name;
    }
  }
  roomData.victimId = null;
  roomData.doctorChoice = null;
  roomData.doctorVoted = false;

  const win = await checkWinCondition(io, client, room, roomData);
  if (win) return;

  roomData.phase = PHASES.DAY;
  setDayTimers(roomData);
  await emitSystemMessage(io, client, room, "Время доктора истекло. Наступает день.");
  io.to(room).emit("phaseChanged", { phase: roomData.phase, timers: roomData.timers, dayStage: roomData.dayStage, players: pubPlayers(roomData) });
  await persistDeadline(client, room, roomData);
}

async function advanceAfterDayVoteTimeout(io, client, room, roomData) {
  const { victimId } = countVotes(roomData.dayVotes || {}, { allowTie: false });
  let victim = null;
  if (victimId) {
    victim = roomData.players.find(p => p.playerId === victimId);
    if (victim && victim.alive) {
      victim.alive = false;
      roomData.lastKilled = victim.name;
    }
  }
  roomData.dayVotes = {};

  const win = await checkWinCondition(io, client, room, roomData);
  if (win) return;

  roomData.phase = PHASES.NIGHT_MAFIA;
  setNightMafiaTimers(roomData);
  await emitSystemMessage(io, client, room, "Время голосования истекло." + (victim ? ` Изгнан: ${victim.name}.` : " Никто не изгнан."));
  await emitSystemMessage(io, client, room, "Город засыпает. Наступает ночь...");
  io.to(room).emit("phaseChanged", { phase: roomData.phase, timers: roomData.timers, players: pubPlayers(roomData) });
  await persistDeadline(client, room, roomData);
}

function pubPlayers(roomData) {
  return roomData.players.map(p => ({ name: p.name, playerId: p.playerId, isHost: p.isHost, alive: p.alive }));
}
