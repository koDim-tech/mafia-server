// handlers/getLobbies.js
export async function handleGetLobbies(socket, io, client) {
    /*  console.log("getLobbies запрос от", socket.id); */
  try {
    const keys = await client.keys('room:*');
    const lobbies = [];
    for (let key of keys) {
      let raw;
      try {
        raw = await client.get(key);
      } catch { continue; }
      if (!raw) continue;

      let data;
      try {
        data = JSON.parse(raw);
      } catch { continue; }

      
      if (data.phase !== "lobby") continue;
      if (!data.players || data.players.length === 0) continue;

      lobbies.push({
        id: key.replace("room:", ""),
        name: data.name || key.replace("room:", ""),
        players: data.players.length,
        maxPlayers: data.maxPlayers || 10,
        phase: data.phase || "lobby",
        private: data.private || false
      });
    }
    socket.emit("lobbies", lobbies);
  } catch (err) {
    console.error("[getLobbies] Ошибка:", err);
    socket.emit("lobbies", []);
  }
}
