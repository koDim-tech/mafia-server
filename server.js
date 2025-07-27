import express from 'express';
import http from 'http';
import { registerSocketHandlers } from './sockets/index.js';
import { clearAllRooms } from './services/clearAllRooms.js';

const app = express();
const server = http.createServer(app);
clearAllRooms()
registerSocketHandlers(server);

/* server.listen(3000, () => console.log('Server running on http://localhost:3000')); */
server.listen(3000, '0.0.0.0', () => console.log('Server running...'));
