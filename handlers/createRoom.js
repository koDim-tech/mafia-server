
export async function handleCreateRoom(socket, io, client, {
  name,          
  maxPlayers,     
  private: isPrivate,
  password,
}) {
  try {
    const roomId = (name || "room") + "-" + Math.random().toString(36).slice(2, 7);
    const exists = await client.get(`room:${roomId}`);
    if (exists) {
      socket.emit("roomCreateError", { message: "Такая комната уже существует" });
      return;
    }
    const roomData = {
      name,
      maxPlayers,
      private: !!isPrivate,
      password: isPrivate ? password : undefined, 
      players: [],
      phase: "lobby",
      gameStarted: false,
    };
    await client.set(`room:${roomId}`, JSON.stringify(roomData));
    socket.emit("roomCreated", { roomId });
  } catch (e) {
    socket.emit("roomCreateError", { message: "Не удалось создать комнату" });
  }
}
