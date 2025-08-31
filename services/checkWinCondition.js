import { emitSystemMessage } from "../utils/chatUtils.js";
import { ROLES, ROLES_DISTRIBUTION } from '../constants.js';
import { persistDeadline, setPostGameToLobbyTimers } from "./timers.js";
import { POST_GAME_TO_LOBBY_MS } from "../gameSettings.js";

export const checkWinCondition = async (io, client, room, roomData) => {
  if (!roomData || !Array.isArray(roomData.players)) return false;

  const MIN_PLAYERS_FOR_WIN = 3; 
  const livingPlayers = roomData.players.filter(p => p.alive);

  if (livingPlayers.length < MIN_PLAYERS_FOR_WIN) {
    await endGame(io, client, room, roomData, null, 'Игра окончена: недостаточно игроков для продолжения.');
    return true;
  }

  const mafia = roomData.players.filter(p => p.role === ROLES.MAFIA && p.alive);
  const civilians = roomData.players.filter(p => p.role !== ROLES.MAFIA && p.alive);

  if (mafia.length === 0) {
    await endGame(io, client, room, roomData, ROLES.CIVILIAN, 'Мирные победили!');
    return true;
  } else if (mafia.length >= civilians.length) {
    await endGame(io, client, room, roomData, ROLES.MAFIA, 'Мафия победила!');
    return true;
  }
  return false;
};


export async function endGame(io, client, room, roomData, winner, message) {
  // 1) фиксируем исход
  roomData.phase = "gameOver";
  roomData.winner = winner;
  // только один таймер — до лобби
  const now = Date.now();
  roomData.timers = {
    toLobby: { startsAt: now, endsAt: now + POST_GAME_TO_LOBBY_MS, durationMs: POST_GAME_TO_LOBBY_MS },
  };
  await client.set(`room:${room}`, JSON.stringify(roomData));

  if (message) await emitSystemMessage(io, client, room, message);

  // 2) один эвент: phaseChanged + таймеры (чтоб фронт сразу увидел отсчёт)
  io.to(room).emit("phaseChanged", {
    phase: "gameOver",
    winner,
    maxPlayers: roomData.maxPlayers,
    players: roomData.players.map(p => ({
      name: p.name, playerId: p.playerId, isHost: p.isHost, alive: p.alive,
    })),
    timers: roomData.timers, // ⬅️ важное: передаём таймеры прямо тут
  });

  // 3) авто-переход в лобби по таймеру
  setTimeout(async () => {
    const fresh = await client.get(`room:${room}`);
    if (!fresh) return;
    const state = JSON.parse(fresh);
    if (state.phase !== "gameOver") return; // игроки уже стартовали новую игру/вышли

    state.phase = "lobby";
    if (state.timers) delete state.timers.toLobby;

    await client.set(`room:${room}`, JSON.stringify(state));
    io.to(room).emit("phaseChanged", { phase: "lobby" });
  }, POST_GAME_TO_LOBBY_MS);
}
