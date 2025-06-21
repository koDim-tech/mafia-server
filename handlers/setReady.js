// handlers/setReady.js
import { sendRoomState } from '../utils/sendRoomState.js';

export async function handleSetReady(socket, io, client, { ready }) {
  const { room, playerId } = socket.data;
  if (!room || !playerId) return;

  const raw = await client.get(`room:${room}`);
  let roomData = raw ? JSON.parse(raw) : null;
  if (!roomData) return;

  const player = roomData.players.find(p => p.playerId === playerId);
  if (!player) return;
  player.ready = !!ready;

  await client.set(`room:${room}`, JSON.stringify(roomData));
  sendRoomState(io, room, roomData);
}
