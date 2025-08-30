// services/voteDeadlines.js
const DEADLINES_ZSET = "deadlines:zset";

/** Сохраняем дедлайн (member: `${room}|${kind}|${endsAt}`) */
export async function registerDeadline(client, roomId, kind, endsAt) {
  const member = `${roomId}|${kind}|${endsAt}`;
  await client.zAdd(DEADLINES_ZSET, [{ score: endsAt, value: member }]);
}

/** Достаём просроченные дедлайны */
export async function fetchExpiredDeadlines(client, now) {
  const members = await client.zRangeByScore(DEADLINES_ZSET, 0, now);
  return members;
}

/** Мягкая блокировка, чтобы два процесса не обработали один дедлайн */
async function acquireLock(client, member, ttlMs = 10000) {
  const lockKey = `lock:deadline:${member}`;
  const ok = await client.set(lockKey, "1", { NX: true, PX: ttlMs });
  return !!ok;
}

export async function removeDeadline(client, member) {
  await client.zRem(DEADLINES_ZSET, member);
}

/** Попробовать начать обработку конкретного member */
export async function tryProcessDeadline(client, member) {
  const got = await acquireLock(client, member, 10000);
  return got;
}
