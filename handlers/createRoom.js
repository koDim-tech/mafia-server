export async function handleCreateRoom(socket, io, client, {
  name,
  maxPlayers,
  private: isPrivate,
  password,
}) {
  try {

    const roomId = `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const roomData = {
      name,
      maxPlayers,
      private: !!isPrivate,
      password: isPrivate ? password : undefined,
      players: [],
      phase: "lobby",
      gameStarted: false,
    };

    // Атомарно сохраняем: только если не существует (NX)
    // node-redis V5: опции передаются объектом
    const wasSet = await client.set(`room:${roomId}`, JSON.stringify(roomData), { NX: true });

    if (!wasSet) {
      socket.emit("roomCreateError", { message: "Такая комната уже существует" });
      return;
    }

    // Можно добавить в список активных комнат (если используешь)
    // await client.sadd("activeRooms", roomId);

    socket.emit("roomCreated", { roomId });
  } catch (e) {
    socket.emit("roomCreateError", { message: "Не удалось создать комнату" });
  }
}
