// server/utils/withRedisTransaction.js
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

export async function withRedisTransaction(
  client,
  key,
  handler,
  { retries = 8, baseDelayMs = 6 } = {}
) {
  // Попытка изоляции: 1) executeIsolated  2) duplicate()  3) как есть (последний шанс)
  const useIsolated = async (fn) => {
    if (typeof client.executeIsolated === "function") {
      return client.executeIsolated(fn);
    }
    if (typeof client.duplicate === "function") {
      const iso = client.duplicate();
      if (typeof iso.connect === "function") await iso.connect();
      try {
        return await fn(iso);
      } finally {
        try {
          if (typeof iso.quit === "function") await iso.quit();
          else if (typeof iso.disconnect === "function") iso.disconnect();
        } catch {}
      }
    }
    
    return fn(client);
  };

  return useIsolated(async (conn) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      await conn.watch(key);

      const raw = await conn.get(key);
      let current = null;
      try { current = raw ? JSON.parse(raw) : null; } catch { current = null; }

      // handler может вернуть: next  ИЛИ  [next, afterCommit]
      const ret = await handler(current);
      const [next, afterCommit] = Array.isArray(ret) ? ret : [ret];

      // next === undefined → ничего не писать (NOOP), но afterCommit допустим
      if (next === undefined) {
        await conn.unwatch();
        if (typeof afterCommit === "function") await afterCommit(current);
        return current;
      }

      const multi = conn.multi();
      if (next === null) multi.del(key);
      else multi.set(key, JSON.stringify(next));

      try {
        const execRes = await multi.exec(); // при конфликте вернётся null (и у redis@4, и у ioredis)
        if (execRes === null) {
          await conn.unwatch();
          const wait = baseDelayMs * (attempt + 1) + Math.floor(Math.random() * 5);
          await sleep(wait);
          continue; // retry
        }
        await conn.unwatch();
        if (typeof afterCommit === "function") await afterCommit(next);
        return next;
      } catch (err) {
        await conn.unwatch();
        const isWatchErr = err?.name === "WatchError" || /WATCH/i.test(err?.message || "");
        if (isWatchErr && attempt < retries) {
          const wait = baseDelayMs * (attempt + 1) + Math.floor(Math.random() * 5);
          await sleep(wait);
          continue; // retry
        }
        throw err;
      }
    }
    throw new Error(`withRedisTransaction: too many conflicts for key ${key}`);
  });
}
