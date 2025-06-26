import { Server } from "socket.io";
import client from "../redisClient.js";

import { handleJoinRoom } from "../handlers/joinRoom.js";
import { handleStartGame } from "../handlers/startGame.js";
import { handleNightVote } from "../handlers/nightVote.js";
import { handleDayVote } from "../handlers/dayVote.js";
import { handleEndGame } from "../handlers/endGame.js";
import { handleDisconnect } from "../handlers/disconnect.js";
import { handleLeaveRoom } from "../handlers/leaveRoom.js";
import { handlePlayerMessage } from "../handlers/playerMessage.js";
import { handleSetReady } from "../handlers/setReady.js";
import { handleRestartGame } from "../handlers/restartGame.js";
import { handleGetLobbies } from "../handlers/getLobbies.js";

export function registerSocketHandlers(server) {
  const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
  });

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    socket.on("joinRoom", (payload) =>
      handleJoinRoom(socket, io, client, payload)
    );
    socket.on("startGame", () => handleStartGame(socket, io, client));
    socket.on("nightVote", (payload) =>
      handleNightVote(socket, io, client, payload)
    );
    socket.on("dayVote", (payload) =>
      handleDayVote(socket, io, client, payload)
    );
    socket.on("endGame", () => handleEndGame(socket, io, client));
    socket.on("leaveRoom", () => handleLeaveRoom(socket, io, client));
    socket.on("playerMessage", (payload) =>
      handlePlayerMessage(socket, io, client, payload)
    );
    socket.on("disconnect", () => handleDisconnect(socket, io, client));
    socket.on("setReady", (payload) =>
      handleSetReady(socket, io, client, payload)
    );
    socket.on("restartGame", () => handleRestartGame(socket, io, client));
    socket.on("getLobbies", () => handleGetLobbies(socket, io, client));
  });

  console.log("Socket.io handlers registered");
}
