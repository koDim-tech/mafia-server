import express from 'express';
import http from 'http';
import { registerSocketHandlers } from './sockets/index.js';

const app = express();
const server = http.createServer(app);

registerSocketHandlers(server);

server.listen(3000, () => console.log('Server running on http://localhost:3000'));