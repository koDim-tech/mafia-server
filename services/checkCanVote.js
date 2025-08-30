// server/services/checkCanVote.js

import {  PHASES, ROLES } from "../constants.js";

export default function assertVoteWindowOrError(socket, roomData, kind /* 'mafia' | 'doctor' | 'day' */) {
  const now = Date.now();
  const timers = roomData.timers || {};

  let win = null;

   if (roomData.phase === PHASES.LOBBY || roomData.phase === PHASES.PRE_GAME) {
    return sendClosed("Игра ещё не началась");
  }

  if (kind === ROLES.MAFIA){
    const w = timers.nightMafiaVote;
    if (!w) return sendClosed("Голосование ещё не началось");
    if (now < w.startsAt) return sendClosed("Голосование ещё не началось");
    if (now > w.endsAt)   return sendClosed("Голосование уже завершено");
    return true;
  }
  if (kind === ROLES.DOCTOR) {
    const w = timers.nightDoctorVote;
    if (!w) return sendClosed("Выбор ещё не начался");
    if (now < w.startsAt) return sendClosed("Выбор ещё не начался");
    if (now > w.endsAt)   return sendClosed("Время выбора истекло");
    return true;
  }
  if (kind === PHASES.DAY) {
    const vote = timers.dayVote;
    if (!vote) return sendClosed("Голосование ещё не началось");
    if (now < vote.startsAt) return sendClosed("Голосование ещё не началось");
    if (now > vote.endsAt)   return sendClosed("Голосование уже завершено");
    return true;
  }

  function sendClosed(text) {
    socket.emit("errorMessage", { code: "VOTE_CLOSED", text });
    return false;
  }
}
