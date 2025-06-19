

export async function emitSystemMessage(io, client, room, text) {
  const message = { type: 'system', text };
  await client.rPush(`chat:${room}`, JSON.stringify(message));
  io.to(room).emit('systemMessage', message);
}

export async function emitToMafiaOnly(io, client, room, text, players) {
  const message = { type: 'system', text };
  await client.rPush(`chat:${room}`, JSON.stringify(message));

  const mafiaPlayers = players.filter(p => p.role === 'Мафия' && p.alive !== false);
  mafiaPlayers.forEach(player => {
    const socketId = player.socketId;
    if (socketId) {
      io.to(socketId).emit('systemMessage', text);
    }
  });
}



