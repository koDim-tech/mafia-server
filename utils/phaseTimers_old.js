import { DAY_DISCUSSION_MS, DAY_VOTE_MS, NIGHT_DOCTOR_VOTE_MS, NIGHT_MAFIA_VOTE_MS } from "../gameSettings.js";

// server/utils/phaseTimers.js
export function nowMs() { return Date.now(); }

/**
 * Заполняет roomData.timers объектами вида:
 * { startsAt:number, endsAt:number, durationMs:number }
 */


export function setNightMafiaTimers(roomData) {
    const now = nowMs();
  roomData.timers = {
    nightMafiaVote: {
      startsAt:   now,
      endsAt:     now + NIGHT_MAFIA_VOTE_MS,
      durationMs: NIGHT_MAFIA_VOTE_MS,
    }
  };
}

export function setNightDoctorTimers(roomData) {
    const now = nowMs();
  roomData.timers = {
    nightDoctorVote: {
      startsAt:   now,
      endsAt:     now + NIGHT_DOCTOR_VOTE_MS,
      durationMs: NIGHT_DOCTOR_VOTE_MS,
    }
  };
}

export function setDayTimers(roomData) {
    const now = nowMs();
  const discussionStart = now;
  const discussionEnd   = discussionStart + DAY_DISCUSSION_MS;
  const voteStart       = discussionEnd;
  const voteEnd         = voteStart + DAY_VOTE_MS;

  roomData.timers = {
    dayDiscussion: {
      startsAt:   discussionStart,
      endsAt:     discussionEnd,
      durationMs: DAY_DISCUSSION_MS,
    },
    dayVote: {
      startsAt:   voteStart,
      endsAt:     voteEnd,
      durationMs: DAY_VOTE_MS,
    }
  };
}


export function isWindowOpen(roomData, key, at = Date.now()) {
  const t = roomData?.timers?.[key];
  if (!t) return false;
  return at >= t.startsAt && at <= t.endsAt;
}
