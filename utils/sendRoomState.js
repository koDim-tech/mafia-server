// utils/sendRoomState.js
export function sendRoomState(io, room, roomData) {
  io.to(room).emit("roomData", {
    players: roomData.players.map((p) => ({
      name: p.name,
      playerId: p.playerId,
      isHost: p.isHost,
      alive: p.alive,
      ready: !!p.ready,
      // можно добавить другие поля, если надо
    })),
    phase: roomData.phase || 'lobby'
  });
}
