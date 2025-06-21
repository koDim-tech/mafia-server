import { assignRoles } from '../gameLogic.js';
import { emitSystemMessage } from '../utils/chatUtils.js';

export async function handleStartGame(socket, io, client) {
  console.log('Запрос на старт игры от', socket.id);
  const { room } = socket.data;
  if (!room) return;

  let raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : null;
  console.log('СОСТАВ roomData.players:', JSON.stringify(roomData.players, null, 2));

  console.log('Старт игры:', roomData.players.length, 'игроков');
  console.log('Фаза:', roomData?.phase);
  if (!roomData || roomData.phase !== 'lobby') return;

  // Минимум игроков
  if (roomData.players.length < 4) {
    socket.emit('errorMessage', { text: 'Недостаточно игроков для старта (минимум 4)' });
    return;
  }

  // Назначение ролей
  const players = [...roomData.players];
  const mafiaCount = Math.max(1, Math.floor(players.length / 4));
  const shuffled = players.sort(() => Math.random() - 0.5);

  shuffled.forEach((player, idx) => {
    player.role = idx < mafiaCount ? 'Мафия' : 'Мирный';
    player.alive = true;
  });

  // Сохраняем роли, очищаем старые голоса, сбрасываем фазу на "Ночь"
  roomData.players = shuffled;
  roomData.phase = 'Ночь';
  roomData.dayVotes = {};
  roomData.nightVotes = {};
  roomData.lastKilled = null;
  roomData.messages = []; // Если есть чат — можно очищать

  await client.set(`room:${room}`, JSON.stringify(roomData));

  // Личный emit — роль каждому игроку (по socket.id)
  for (const player of roomData.players) {
    io.to(player.id).emit('roleAssigned', { role: player.role });
  }

  // Системное сообщение
  await emitSystemMessage(io, client, room, 'Игра началась! Роли назначены.');


  console.log('SEND phaseChanged:', {
  phase: roomData.phase,
  players: roomData.players.map(p => ({
    name: p.name,
    playerId: p.playerId,
    id: p.id,
    isHost: p.isHost,
    alive: p.alive,
    role: p.role,
  }))
});



  // Групповой emit — ВСЕ публичные данные (!!! теперь с playerId !!!)
  io.to(room).emit('phaseChanged', {
    phase: roomData.phase,
    players: roomData.players.map(p => ({
      name: p.name,
      playerId: p.playerId,   // ОБЯЗАТЕЛЬНО!
      isHost: p.isHost,
      alive: p.alive,
      // role: p.role // добавлять только если ты хочешь чтобы все знали роли
    }))
  });
}
