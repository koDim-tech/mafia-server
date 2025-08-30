// src/utils/votingWindow.js
import { DISCUSSION_MS, VOTING_MS } from "../gameSettings.js";

/**
 * Ставит обсуждение → открывает голосование → закрывает, шлёт события клиенту.
 * Хранит состояние в roomData.voteWindow и сохраняет в Redis на каждой стадии.
 *
 * @param {Server} io
 * @param {RedisClient} client
 * @param {string} room
 * @param {object} roomData (живой объект последнего чтения)
 * @param {{
 *   discussionMs?: number,
 *   votingMs?: number,
 *   audience: "day"|"mafia"|"doctor",
 *   onClose?: ( ) => Promise<void>
 * }} cfg
 */
export function scheduleVoting(io, client, room, roomData, cfg) {
  const discussionMs = cfg.discussionMs ?? DISCUSSION_MS;
  const votingMs     = cfg.votingMs ?? VOTING_MS;

  const now = Date.now();
  const openAt = now + discussionMs;
  const endsAt = openAt + votingMs;

  roomData.voteWindow = {
    stage: "discussion", // discussion -> open -> closed
    openAt,
    endsAt,
    audience: cfg.audience, // "day"|"mafia"|"doctor"
  };

  // сохранить и оповестить о начале обсуждения
  client.set(`room:${room}`, JSON.stringify(roomData)).then(() => {
    io.to(room).emit("votingWindow", {
      stage: "discussion",
      openAt,
      endsAt,
      audience: cfg.audience,
    });
  });

  // открыть голосование
  setTimeout(async () => {
    // перечитать свежие данные (могла смениться фаза и т.д.)
    const raw = await client.get(`room:${room}`);
    if (!raw) return;
    const rd = JSON.parse(raw);
    if (!rd.voteWindow) rd.voteWindow = {};
    rd.voteWindow.stage = "open";
    rd.voteWindow.openAt = openAt;
    rd.voteWindow.endsAt = endsAt;
    rd.voteWindow.audience = cfg.audience;

    await client.set(`room:${room}`, JSON.stringify(rd));
    io.to(room).emit("votingWindow", {
      stage: "open",
      openAt,
      endsAt,
      audience: cfg.audience,
    });
  }, discussionMs);

  // закрыть голосование и вызвать onClose
  setTimeout(async () => {
    const raw = await client.get(`room:${room}`);
    if (!raw) return;
    const rd = JSON.parse(raw);
    if (!rd.voteWindow) rd.voteWindow = {};
    rd.voteWindow.stage = "closed";

    await client.set(`room:${room}`, JSON.stringify(rd));
    io.to(room).emit("votingWindow", {
      stage: "closed",
      openAt,
      endsAt,
      audience: cfg.audience,
    });

    if (cfg.onClose) {
      try { await cfg.onClose(); } catch {}
    }
  }, discussionMs + votingMs);
}
