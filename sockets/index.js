import { Server } from "socket.io";
import client from "../redisClient.js";

import { handleCreateRoom }    from "../handlers/createRoom.js";
import { handleJoinRoom }      from "../handlers/joinRoom.js";
import { handleStartGame }     from "../handlers/startGame.js";
import { handleNightVote }     from "../handlers/nightVote.js";
import { handleDayVote }       from "../handlers/dayVote.js";
import { handleEndGame }       from "../handlers/endGame.js";
import { handleLeaveRoom }     from "../handlers/leaveRoom.js";
import { handlePlayerMessage } from "../handlers/playerMessage.js";
import { handleSetReady }      from "../handlers/setReady.js";
import { handleRestartGame }   from "../handlers/restartGame.js";
import { handleGetLobbies }    from "../handlers/getLobbies.js";
import { handleDisconnect }    from "../handlers/disconnect.js";

export function registerSocketHandlers(server) {
  const io = new Server(server, {
    cors: { origin: "*", methods: ["GET","POST"], credentials: true },
  });

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // safe теперь внутри, видит сокет
    const safe = (handler) => async (payload) => {
      try {
        await handler(socket, io, client, payload);
      } catch (err) {
        console.error(`Error in handler ${handler.name}:`, err);
        socket.emit("errorMessage", { text: "Внутренняя ошибка сервера." });
      }
    };

    socket.on("createRoom",     safe(handleCreateRoom));
    socket.on("joinRoom",       safe(handleJoinRoom));
    socket.on("startGame",      safe((s, i, c) => handleStartGame(s, i, c)));
    socket.on("nightVote",      safe(handleNightVote));
    socket.on("dayVote",        safe(handleDayVote));
    socket.on("endGame",        safe((s, i, c) => handleEndGame(s, i, c)));
    socket.on("leaveRoom",      safe((s, i, c) => handleLeaveRoom(s, i, c)));
    socket.on("playerMessage",  safe(handlePlayerMessage));
    socket.on("setReady",       safe(handleSetReady));
    socket.on("restartGame",    safe((s, i, c) => handleRestartGame(s, i, c)));
    socket.on("getLobbies",     safe((s, i, c) => handleGetLobbies(s, i, c)));

    socket.on("disconnect", async () => {
      try {
        await handleDisconnect(socket, io, client);
      } catch (err) {
        console.error("Error in disconnect handler:", err);
      }
    });
  });

  console.log("Socket.io handlers registered");
}
