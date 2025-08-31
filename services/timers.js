// services/timers.js
import {
  NIGHT_MAFIA_VOTE_MS,
  NIGHT_DOCTOR_VOTE_MS,
  DAY_DISCUSSION_MS,
  DAY_VOTE_MS,
  PRE_GAME_MS,
  POST_GAME_TO_LOBBY_MS
} from "../gameSettings.js";
import { registerDeadline } from "./voteDeadlines.js";

export function nowMs() { return Date.now(); }

// ✅ дефолтные секунды для "анонсов"
export const DEFAULT_ANNOUNCE_SEC = Object.freeze({
  preGame:        [10],
  nightMafiaVote: [10],
  nightDoctorVote:[10],
  dayDiscussion:  [10],
  dayVote:        [10],
  toLobby:        [10, 3, 2, 1],
});

// общий генератор записей-объявлений
function addAnnouncements(list, baseKind, endsAt, secondsArr = []) {
  for (const s of secondsArr) {
    const at = endsAt - s * 1000;
    if (s > 0 && at > 0) { // можно без проверки nowMs, пусть тикер сам разрулит
      list.push({ kind: `announce:${baseKind}:${s}`, endsAt: at });
    }
  }
}

/** Предстартовый отсчёт */
export function setPreGameTimers(roomData, opts = {}) {
  const now = nowMs();
  const endsAt = now + PRE_GAME_MS;
  const announceSec = opts.announceSec ?? DEFAULT_ANNOUNCE_SEC.preGame;

  roomData.timers = {
    preGame: { startsAt: now, endsAt, durationMs: PRE_GAME_MS },
  };

  const dl = [{ kind: "preGame", endsAt }];
  addAnnouncements(dl, "preGame", endsAt, announceSec);

  roomData._deadline = dl;
}

/** Ночь: ход мафии */
export function setNightMafiaTimers(roomData, opts = {}) {
  const now = nowMs();
  const endsAt = now + NIGHT_MAFIA_VOTE_MS;
  const announceSec = opts.announceSec ?? DEFAULT_ANNOUNCE_SEC.nightMafiaVote;

  roomData.timers = {
    nightMafiaVote: { startsAt: now, endsAt, durationMs: NIGHT_MAFIA_VOTE_MS },
  };

  const dl = [{ kind: "nightMafiaVote", endsAt }];
  addAnnouncements(dl, "nightMafiaVote", endsAt, announceSec);

  roomData._deadline = dl;
}

/** Ночь: ход доктора */
export function setNightDoctorTimers(roomData, opts = {}) {
  const now = nowMs();
  const endsAt = now + NIGHT_DOCTOR_VOTE_MS;
  const announceSec = opts.announceSec ?? DEFAULT_ANNOUNCE_SEC.nightDoctorVote;

  roomData.timers = {
    nightDoctorVote: { startsAt: now, endsAt, durationMs: NIGHT_DOCTOR_VOTE_MS },
  };

  const dl = [{ kind: "nightDoctorVote", endsAt }];
  addAnnouncements(dl, "nightDoctorVote", endsAt, announceSec);

  roomData._deadline = dl;
}

/** День: обсуждение → голосование */
export function setDayTimers(roomData, opts = {}) {
  const now = nowMs();
  const discussEnd = now + DAY_DISCUSSION_MS;
  const voteEnd    = discussEnd + DAY_VOTE_MS;

  const annDiscuss = opts.announceDiscussionSec ?? DEFAULT_ANNOUNCE_SEC.dayDiscussion;
  const annVote    = opts.announceVoteSec       ?? DEFAULT_ANNOUNCE_SEC.dayVote;

  roomData.timers = {
    dayDiscussion: { startsAt: now,        endsAt: discussEnd, durationMs: DAY_DISCUSSION_MS },
    dayVote:       { startsAt: discussEnd, endsAt: voteEnd,    durationMs: DAY_VOTE_MS },
  };
  roomData.dayStage = "discussion";

  const dl = [
    { kind: "dayDiscussionEnd", endsAt: discussEnd },
    { kind: "dayVote",          endsAt: voteEnd    },
  ];
  addAnnouncements(dl, "dayDiscussion", discussEnd, annDiscuss);
  addAnnouncements(dl, "dayVote",       voteEnd,    annVote);

  roomData._deadline = dl;
}

export function setPostGameToLobbyTimers(roomData, opts = {}) {
  const now = nowMs();
  const endsAt = now + POST_GAME_TO_LOBBY_MS;
  const announceSec = opts.announceSec ?? DEFAULT_ANNOUNCE_SEC.toLobby;

  
roomData.timers = {
  toLobby: { startsAt: now, endsAt, durationMs: POST_GAME_TO_LOBBY_MS },
};
  roomData.phase = "gameOver"; // явная фаза

  const dl = [{ kind: "toLobby", endsAt }];
  addAnnouncements(dl, "toLobby", endsAt, announceSec);

  roomData._deadline = dl;
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
