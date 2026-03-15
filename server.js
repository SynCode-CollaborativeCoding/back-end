import express from 'express';
import ExpressWs from 'express-ws';
import cors from 'cors';
import bodyParser from 'body-parser';

import config from './config.js';
import { Logger } from './utils/logger.js';
import { loggerMiddleware } from './middleware/http.js';
import { createAuthRoutes } from './routes/auth.js';
import { createRoomRoutes } from './routes/rooms.js';
import { createProjectRoutes } from './routes/projects.js';
import { createHistoryRoutes } from './routes/history.js';
import { WebSocketService } from './services/WebSocketService.js';

// Initialize Express and WebSocket
const { app } = ExpressWs(express());

// Middleware
app.use(cors({ origin: '*' }));
app.use(bodyParser.json());
app.use(loggerMiddleware);

// Initialize WebSocket service
const wsService = new WebSocketService();

// Routes
app.use('/api/auth', createAuthRoutes());
app.use('/api/rooms', createRoomRoutes());
app.use('/api/projects', createProjectRoutes());
app.use('/api/projects', createHistoryRoutes());

// WebSocket endpoint
app.ws('/room/:id', (ws, req) => {
    const token = req.query.token;
    const roomName = req.params.id;
    wsService.handleConnection(ws, token, roomName);
});

// Start server
app.listen(config.port, () => Logger.log('SERVER', `Ready at http://localhost:${config.port}`));
