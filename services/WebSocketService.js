import jwt from 'jsonwebtoken';
import { Logger } from '../utils/logger.js';
import { RoomService } from './RoomService.js';
import config from '../config.js';
import db from '../db.js';

export class WebSocketService {
    constructor() {
        this.rooms = {};        // { roomName: [ { ws, id, username } ] }
        this.roomTimeouts = {}; // { roomName: timeoutObject }
    }

    async handleConnection(ws, token, roomName) {
        if (!token) {
            Logger.log('WS', `Connection rejected: No token for room ${roomName}`);
            return ws.close(4001);
        }

        try {
            const decoded = jwt.verify(token, config.secretKey);
            const [roomExists] = await db.execute('SELECT id FROM rooms WHERE room_name = ?', [roomName]);

            if (roomExists.length === 0) {
                Logger.log('WS', `Connection rejected: Room "${roomName}" does not exist in DB`);
                return ws.close(4004);
            }

            // Cancel cleanup timeout if someone joins
            if (this.roomTimeouts[roomName]) {
                Logger.log('ROOM', `Cleanup cancelled for "${roomName}" (User re-entering)`);
                clearTimeout(this.roomTimeouts[roomName]);
                delete this.roomTimeouts[roomName];
            }

            // Ensure room exists in memory
            if (!this.rooms[roomName]) {
                Logger.log('ROOM', `Reinitializing room "${roomName}" in memory`);
                this.rooms[roomName] = [];
            }

            // Prevent duplicate sessions for same user in same room
            if (this.rooms[roomName].some(u => u.id === decoded.id)) {
                Logger.log('WS', `User ${decoded.username} already in room ${roomName}. Rejecting duplicate connection.`);
                return ws.close(4003);
            }

            const userContext = { ws, id: decoded.id, username: decoded.username, avatar: decoded.avatar };
            this.rooms[roomName].push(userContext);

            Logger.log('WS', `User "${decoded.username}" (ID: ${decoded.id}) connected to room "${roomName}". Users in room now: ${this.rooms[roomName].length}`);

            // Send user their ID
            ws.send(JSON.stringify({ type: 'set-id', id: decoded.id }));

            // Send existing users to the new user
            const existingUsers = this.rooms[roomName]
                .filter(u => u.id !== decoded.id)
                .map(u => ({ id: u.id, username: u.username, avatar: u.avatar }));
            Logger.log('WS', `Sending ${existingUsers.length} existing users to ${decoded.username}`);
            if (existingUsers.length > 0) {
                ws.send(JSON.stringify({ type: 'existing-users', users: existingUsers }));
            }

            // Notify existing users about new connection
            this.broadcastToRoom(roomName, { type: 'user-connected', id: decoded.id, username: decoded.username, avatar: decoded.avatar }, decoded.id);

            ws.on('message', (msgStr) => this.handleMessage(msgStr, decoded, roomName, ws));
            ws.on('close', () => this.handleDisconnect(decoded, roomName, ws));
        } catch (e) {
            Logger.log('WS', `Auth error for WebSocket: ${e.message}`);
            ws.close(4002);
        }
    }

    handleMessage(msgStr, decoded, roomName, ws) {
        try {
            const msg = JSON.parse(msgStr);

            // Handle code requests
            if (msg.type === 'code-request' && msg.targetId) {
                const target = this.rooms[roomName]?.find(u => u.id === msg.targetId);
                if (target?.ws.readyState === 1) {
                    target.ws.send(JSON.stringify({
                        type: 'send-code-request',
                        targetId: decoded.id,
                        authorId: decoded.id
                    }));
                }
                return;
            }

            // Handle targeted message (WebRTC Signaling / Direct Chat)
            if (msg.targetId) {
                const target = this.rooms[roomName]?.find(u => u.id === msg.targetId);
                if (target?.ws.readyState === 1) {
                    target.ws.send(JSON.stringify({ ...msg, authorId: decoded.id }));
                }
            } else {
                // General broadcast (Code sync, presence)
                this.broadcastToRoom(roomName, { ...msg, authorId: decoded.id }, decoded.id);
            }
        } catch (err) {
            Logger.log('ERROR', `WS Message parse error from ${decoded.username}: ${err.message}`);
        }
    }

    async handleDisconnect(decoded, roomName, ws) {
        if (!this.rooms[roomName]) return;

        const userCountBefore = this.rooms[roomName].length;
        this.rooms[roomName] = this.rooms[roomName].filter(u => u.ws !== ws);
        const userCountAfter = this.rooms[roomName].length;

        Logger.log('WS', `User "${decoded.username}" disconnected from "${roomName}". Users: ${userCountBefore} → ${userCountAfter}`);

        this.broadcastToRoom(roomName, { type: 'user-disconnected', id: decoded.id });

        if (this.rooms[roomName].length === 0) {
            Logger.log('ROOM', `Room "${roomName}" is empty. Scheduling deletion in ${config.roomDeleteTimeout / 1000}s`);

            // Clear any existing timeout first
            if (this.roomTimeouts[roomName]) {
                clearTimeout(this.roomTimeouts[roomName]);
            }

            this.roomTimeouts[roomName] = setTimeout(async () => {
                try {
                    // Double-check that room is still empty before deleting
                    if (this.rooms[roomName] && this.rooms[roomName].length > 0) {
                        Logger.log('ROOM', `Room "${roomName}" is no longer empty, skipping deletion`);
                        delete this.roomTimeouts[roomName];
                        return;
                    }

                    Logger.log('ROOM', `Deleting empty room "${roomName}" from database`);
                    await RoomService.deleteRoom(roomName);
                    delete this.rooms[roomName];
                    delete this.roomTimeouts[roomName];
                } catch (err) {
                    Logger.log('ERROR', `Failed to delete room "${roomName}": ${err.message}`);
                    // Keep the timeout reference in case we want to retry
                }
            }, config.roomDeleteTimeout);
        }
    }

    broadcastToRoom(roomId, data, excludeId = null) {
        if (!this.rooms[roomId]) return;
        const msg = JSON.stringify(data);
        this.rooms[roomId].forEach(u => {
            if (u.id !== excludeId && u.ws.readyState === 1) {
                u.ws.send(msg);
            }
        });
    }
}
