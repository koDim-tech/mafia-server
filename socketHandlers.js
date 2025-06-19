// === socketHandlers.js ===
const { emitSystemMessage, emitToMafiaOnly } = require('./utils/chatUtils');
const { assignRoles } = require('./gameLogic');

/* async function handleJoinRoom(socket, io, client, { name, room, playerId }) {
  let raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : { players: [], gameStarted: false, phase: null };

  // Ищем игрока по playerId
  let existing = roomData.players.find(p => p.playerId === playerId);
  let isHost = false;

  // Если игра началась и игрок не найден — это новый игрок, не пускаем
  if (roomData.gameStarted && !existing) {
    socket.emit('gameAlreadyStarted');
    return;
  }

  // Если игрок заходит впервые
  if (!existing) {
    isHost = roomData.players.length === 0;
    roomData.players.push({ id: socket.id, name, playerId, isHost, alive: true });
  } else {
    // Игрок возвращается — обновим socket.id
    existing.id = socket.id;
    existing.name = name;
    isHost = existing.isHost;
  }

  // Сохраняем комнату
  await client.set(`room:${room}`, JSON.stringify(roomData));

  // Привязка socket и комната
  socket.join(room);
  socket.data = { room, playerId };

  // Отправка данных игроку
  socket.emit('roomJoined', {
    players: roomData.players,
    gameStarted: roomData.gameStarted
  });

  // Рассылка обновлённого состава комнаты
  io.to(room).emit('roomData', { players: roomData.players });

  // Отдаём историю чата
  const historyKey = `chat:${room}`;
  const storedMessages = await client.lRange(historyKey, 0, -1);
  const messages = storedMessages.map(m => JSON.parse(m));
  socket.emit('chatHistory', messages);

  // Системное сообщение о входе
  await emitSystemMessage(io, client, room, `${name} присоединился к комнате.`);

  // Добро пожаловать + информация о роли
  socket.emit('welcome', { playerId, isHost });

  // Если игра идёт — отправляем статус
  if (roomData.gameStarted) {
    const player = roomData.players.find(p => p.playerId === playerId);

    if (player?.role) {
      socket.emit('yourRole', player.role);
    }

    socket.emit('phaseChange', roomData.phase);

    if (player.alive === false) {
      socket.emit('playerKilled', playerId);
    }
  }
} */



/* async function handleStartGame(socket, io, client) {
  const { room, playerId } = socket.data;
  let raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : null;
  if (!roomData) return;

  const player = roomData.players.find(p => p.playerId === playerId);
  if (!player || !player.isHost) return;

  const roles = assignRoles(roomData.players);
  roomData.players = roomData.players.map((p, i) => ({ ...p, role: roles[i] }));
  roomData.phase = 'Ночь';
  roomData.gameStarted = true;

  await client.set(`room:${room}`, JSON.stringify(roomData));

  roomData.players.forEach(p => io.to(p.id).emit('yourRole', p.role));
  io.to(room).emit('phaseChange', roomData.phase);
  io.to(room).emit('startGame');
  await emitSystemMessage(io, client, room, 'Город засыпает...');
} */

/* async function handleNightVote(socket, io, client, { targetId }) {
  const { room, playerId } = socket.data || {};
  if (!room || !playerId) return;
  let raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : null;
  if (!roomData || roomData.phase !== 'Ночь') return;

  roomData.nightVotes = roomData.nightVotes || {};
  roomData.nightVotes[playerId] = targetId;
  const voter = roomData.players.find(p => p.playerId === playerId);
  const target = roomData.players.find(p => p.playerId === targetId);
  if (voter && target) {
    await emitToMafiaOnly(io, client, room, `Мафия ${voter.name} проголосовал за ${target.name}`, roomData.players);
  }
  await client.set(`room:${room}`, JSON.stringify(roomData));

  const mafiaPlayers = roomData.players.filter(p => p.role === 'Мафия');
  const votedCount = Object.keys(roomData.nightVotes).length;
  if (votedCount >= mafiaPlayers.length) {
    const counts = {};
    Object.values(roomData.nightVotes).forEach(id => counts[id] = (counts[id] || 0) + 1);
    const victimId = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    
    roomData.players = roomData.players.map(p =>
      p.playerId === victimId ? { ...p, alive: false } : p
    );
    delete roomData.nightVotes;
    roomData.phase = 'День';
    await client.set(`room:${room}`, JSON.stringify(roomData));
    io.to(room).emit('playerKilled', victimId);
    const gameEnded = await checkWinCondition(io, client, room, roomData);
    if (gameEnded) return;
    io.to(room).emit('phaseChange', roomData.phase);
    await emitSystemMessage(io, client, room, 'Город просыпается, на асфальте виднеются лужи крови...');
  }
} */

/* async function handleDayVote(socket, io, client, { targetId }) {
  const { room, playerId } = socket.data || {};
  if (!room || !playerId) return;
  let raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : null;
  if (!roomData || roomData.phase !== 'День') return;

  roomData.dayVotes = roomData.dayVotes || {};
  roomData.dayVotes[playerId] = targetId;
  const voter = roomData.players.find(p => p.playerId === playerId);
  const target = roomData.players.find(p => p.playerId === targetId);
  if (voter && target) {
    await emitSystemMessage(io, client, room, `${voter.name} проголосовал за ${target.name}`);
  }
  await client.set(`room:${room}`, JSON.stringify(roomData));

  const aliveCount = roomData.players.length;
  const votedCount = Object.keys(roomData.dayVotes).length;
  if (votedCount >= aliveCount) {
    const counts = {};
    Object.values(roomData.dayVotes).forEach(id => {
      counts[id] = (counts[id] || 0) + 1;
    });

    const entries = Object.entries(counts);
    const max = Math.max(...entries.map(e => e[1]));
    const mostVoted = entries.filter(([_, count]) => count === max);

    delete roomData.dayVotes;

    if (mostVoted.length > 1) {
      await emitSystemMessage(io, client, room, 'Ничья — никто не был казнен.');
      roomData.phase = 'Ночь';
      await client.set(`room:${room}`, JSON.stringify(roomData));
      io.to(room).emit('phaseChange', 'Ночь');
      await emitSystemMessage(io, client, room, 'Город засыпает...');
      return;
    }

    const eliminatedId = mostVoted[0][0];
    roomData.players = roomData.players.filter(p => p.playerId !== eliminatedId);
    await client.set(`room:${room}`, JSON.stringify(roomData));
    io.to(room).emit('playerEliminated', eliminatedId);

    const gameEnded = await checkWinCondition(io, client, room, roomData);
    if (gameEnded) return;

    roomData.phase = 'Ночь';
    await client.set(`room:${room}`, JSON.stringify(roomData));
    io.to(room).emit('phaseChange', 'Ночь');
    await emitSystemMessage(io, client, room, 'Город засыпает...');
  }
} */

/* async function handleEndGame(socket, io, client) {
  const { room } = socket.data || {};
  if (!room) return;
  io.to(room).emit('gameEnded');
  await client.del(`room:${room}`);
  console.log(`Комната ${room} удалена из Redis`);
} */

/* async function handleDisconnect(socket, io, client) {
  const { room, playerId } = socket.data || {};
  if (!room) return;
  let raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : null;
  if (!roomData) return;
  const p = roomData.players.find(p => p.playerId === playerId);
  if (p) p.id = null;
  await client.set(`room:${room}`, JSON.stringify(roomData));
  io.to(room).emit('roomData', { players: roomData.players });
} */

async function handleLeaveRoom(socket, io, client) {
  const { room, playerId } = socket.data || {};
  if (!room || !playerId) return;

  const raw = await client.get(`room:${room}`);
  if (!raw) return;
  const roomData = JSON.parse(raw);

  roomData.players = roomData.players.filter(p => p.playerId !== playerId);

  if (roomData.players.length === 0) {
    await client.del(`room:${room}`);
    console.log(`Комната ${room} удалена (все вышли)`);
  } else {
    await client.set(`room:${room}`, JSON.stringify(roomData));
    io.to(room).emit('roomData', { players: roomData.players });
  }

  socket.leave(room);
  socket.emit('leftRoom'); // <-- вот это важно
}

/* const checkWinCondition = async (io, client, room, roomData) => {
  const mafia = roomData.players.filter(p => p.role === 'Мафия');
  const civilians = roomData.players.filter(p => p.role !== 'Мафия');

  let message = null;
  let winner = null;

  if (mafia.length === 0) {
    message = 'Мирные победили!';
    winner = 'civilians';
  } else if (mafia.length >= civilians.length) {
    message = 'Мафия победила!';
    winner = 'mafia';
  }

  if (message) {
    await emitSystemMessage(io, client, room, message);
    io.to(room).emit('gameEnded', { winner });

    // Запускаем таймер очистки через 1 минуту
    setTimeout(async () => {
      await client.del(`room:${room}`);
      await client.del(`chat:${room}`);
      io.to(room).emit('roomClosed');
    }, 60_000); // 60 секунд
    return true;
  }

  return false;
}; */



/* async function handlePlayerMessage(socket, io, client, { text }) {

  const { room, playerId } = socket.data || {};
  if (!room || !text || !playerId) return;

  const raw = await client.get(`room:${room}`);
  const roomData = raw ? JSON.parse(raw) : null;
  if (!roomData || roomData.phase !== 'День') {
    console.log('Сообщение не доставлено — не день или нет комнаты');
    return;
  }

  const sender = roomData.players.find(p => p.playerId === playerId);
  if (!sender || !sender.name || sender.alive === false) return;

 const message = { sender: sender.name, text, type: 'player' };
  
  io.to(room).emit('playerMessage', message);

  const historyKey = `chat:${room}`;
  await client.rPush(historyKey, JSON.stringify(message));
} */







module.exports = {
  handleJoinRoom,
  handleStartGame,
  handleNightVote,
  handleDayVote,
  handleEndGame,
  handleDisconnect,
  handleLeaveRoom,
  handlePlayerMessage
};