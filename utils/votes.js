// src/utils/votes.js

/**
 * Подсчитывает голоса и возвращает результат голосования.
 * Можно расширять для поддержки ничьих, иммунитетов и др.
 * @param {Object} votes - { [playerId]: targetId }
 * @param {Object} [options] - { allowTie: true/false }
 * @returns { victimId, votes, isTie }
 */
export function countVotes(votes, options = {}) {
  const tally = {};
  for (const targetId of Object.values(votes)) {
    if (!targetId) continue;
    tally[targetId] = (tally[targetId] || 0) + 1;
  }
  const entries = Object.entries(tally);
  if (!entries.length) return { victimId: null, votes: tally, isTie: false };
  // Сортировка по убыванию количества голосов
  entries.sort((a, b) => b[1] - a[1]);
  const [first, second] = entries;
  const isTie = second && first[1] === second[1];
  if (isTie && !options.allowTie) return { victimId: null, votes: tally, isTie: true };
  return { victimId: first[0], votes: tally, isTie: false };
}

export function emitVoteStatus(socket, phase, voted, targetId = null) {
  socket.emit("voteStatus", { phase, voted, targetId });
}