// services/timers.js
import { NIGHT_MAFIA_VOTE_MS, NIGHT_DOCTOR_VOTE_MS, DAY_DISCUSSION_MS, DAY_VOTE_MS, PRE_GAME_MS } from "../gameSettings.js";
import { registerDeadline } from "./voteDeadlines.js";

export function nowMs() { return Date.now(); }

export function setPreGameTimers(roomData) {
  const now = nowMs();
  roomData.timers = {
    preGame: { startsAt: now, endsAt: now + PRE_GAME_MS, durationMs: PRE_GAME_MS },
  };
  roomData._deadline = [{ kind: "preGame", endsAt: roomData.timers.preGame.endsAt }];
}


export function setNightMafiaTimers(roomData) {
  const now = nowMs();
  roomData.timers = {
    nightMafiaVote: { startsAt: now, endsAt: now + NIGHT_MAFIA_VOTE_MS, durationMs: NIGHT_MAFIA_VOTE_MS },
  };
  roomData._deadline = [{ kind: "nightMafiaVote", endsAt: roomData.timers.nightMafiaVote.endsAt }];
}

export function setNightDoctorTimers(roomData) {
  const now = nowMs();
  roomData.timers = {
    nightDoctorVote: { startsAt: now, endsAt: now + NIGHT_DOCTOR_VOTE_MS, durationMs: NIGHT_DOCTOR_VOTE_MS },
  };
  roomData._deadline = [{ kind: "nightDoctorVote", endsAt: roomData.timers.nightDoctorVote.endsAt }];
}

export function setDayTimers(roomData) {
  const now = nowMs();
  const discussEnd = now + DAY_DISCUSSION_MS;
  const voteEnd    = discussEnd + DAY_VOTE_MS;

  roomData.timers = {
    dayDiscussion: { startsAt: now,        endsAt: discussEnd, durationMs: DAY_DISCUSSION_MS },
    dayVote:       { startsAt: discussEnd, endsAt: voteEnd,    durationMs: DAY_VOTE_MS },
  };
  // фиксируем стадию дня
  roomData.dayStage = "discussion";
  // регистрируем оба дедлайна: конец обсуждения и конец голосования
  roomData._deadline = [
    { kind: "dayDiscussionEnd", endsAt: discussEnd },
    { kind: "dayVote",          endsAt: voteEnd    },
  ];
}

/** Вызвать ПОСЛЕ сохранения roomData в Redis */
export async function persistDeadline(client, roomId, roomData) {
  if (!roomData?._deadline) return;
  const list = Array.isArray(roomData._deadline) ? roomData._deadline : [roomData._deadline];
  for (const { kind, endsAt } of list) {
    await registerDeadline(client, roomId, kind, endsAt);
  }
  delete roomData._deadline;
}
