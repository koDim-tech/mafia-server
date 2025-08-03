import { PHASES } from '../constants.js';
import { assignRoles } from '../gameLogic.js';
import { emitSystemMessage } from '../utils/chatUtils.js';

export async function handleStartGame(socket, io, client) {
  console.log('Запрос на старт игры от', socket.id);
  const { room } = socket.data;
  if (!room) return;

  let raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : null;

  if (!roomData || roomData.phase !== PHASES.LOBBY) {
    console.log('[WARN] Не найдено roomData или неверная фаза для старта', { roomData });
    return;
  }
  if (!Array.isArray(roomData.players) || roomData.players.length === 0) {
    socket.emit('errorMessage', { text: 'Нет игроков для старта' });
    return;
  }

  const allReady = roomData.players.length >= 1 &&
    roomData.players.every(p => p.ready);

  if (!allReady) {
    socket.emit('errorMessage', { text: 'Не все игроки готовы или слишком мало игроков' });
    return;
  }

  const players = [...roomData.players];
  const mafiaCount = Math.max(1, Math.floor(players.length / 4));
  const shuffled = players.sort(() => Math.random() - 0.5);

  shuffled.forEach((player, idx) => {
    player.role = idx < mafiaCount ? 'Мафия' : 'Мирный';
    player.alive = true;
  });

  roomData.players = shuffled;
  roomData.phase = 'night';
  roomData.dayVotes = {};
  roomData.nightVotes = {};
  roomData.lastKilled = null;
  roomData.messages = [];

  await client.set(`room:${room}`, JSON.stringify(roomData));

  // Сразу отправляем роли и фазу (чтобы UI был отзывчивым)
  for (const player of roomData.players) {
    io.to(player.id).emit('roleAssigned', { role: player.role });
  }
  io.to(room).emit('phaseChanged', {
    phase: roomData.phase,
    players: roomData.players.map(p => ({
      name: p.name,
      playerId: p.playerId,
      isHost: p.isHost,
      alive: p.alive,
    }))
  });

  await emitSystemMessage(io, client, room, 'Игра началась! Роли назначены.');
  await emitSystemMessage(io, client, room, 'Первая ночь наступает. Мафия, сделайте свой ход.');
}
