
export async function withRedisTransaction(client, key, handler, maxRetries = 5) {
  let retry = 0;
  while (retry < maxRetries) {
    retry++;
    await client.watch(key);
    const raw = await client.get(key);
    let data = raw ? JSON.parse(raw) : null;

    // handler должен вернуть [новыеДанные, afterCommit]
    const [newData, afterCommit] = await handler(data);

    const tx = client.multi();
    tx.set(key, JSON.stringify(newData));
    const execRes = await tx.exec();
    if (execRes) {
      if (afterCommit) await afterCommit(newData); // Например, phaseChanged, system messages
      return newData;
    }
    // иначе retry
  }
  throw new Error("Transaction failed after retries");
}
