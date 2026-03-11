import express from 'express';
import ExpressWs from 'express-ws';
import cors from 'cors';
import bodyParser from 'body-parser';
import md5 from 'blueimp-md5';
import jwt from 'jsonwebtoken';
import db from './db.js';
import dotenv from 'dotenv';
import crypto from 'node:crypto';

dotenv.config();

const { app } = ExpressWs(express());
const port = 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'default_secret_key';
const ROOM_DELETE_TIMEOUT = 1 * 60 * 1000; // 1 minute

app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

// --- HELPER: LOGGING ---
const log = (category, message) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] [${category}] ${message}`);
};

// --- ESTRUCTURAS DE DATOS EN MEMORIA ---
const rooms = {};        // { roomName: [ { ws, id, username } ] }
const roomTimeouts = {}; // { roomName: timeoutObject }

// --- MIDDLEWARES ---
app.use((req, res, next) => {
    log('HTTP', `${req.method} ${req.path}`);
    next();
});

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "No token provided" });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            log('AUTH', `Invalid token attempt on ${req.path}`);
            return res.status(403).json({ error: "Token invalid or expired" });
        }
        req.user = user;
        next();
    });
};

// --- AUTH ENDPOINTS ---
app.post('/api/auth/register', async (req, res) => {
    const { username, password, avatar } = req.body;
    try {
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = md5(password + salt);
        const storedPassword = `${salt}$${passwordHash}`;
        await db.execute('INSERT INTO users (username, password_hash, avatar_url) VALUES (?, ?, ?)', [username, storedPassword, avatar]);
        
        log('AUTH', `User registered: ${username}`);
        res.status(201).json({ message: "Éxito" });
    } catch (e) { 
        log('ERROR', `Registration failed for ${username}: ${e.message}`);
        res.status(400).json({ error: "Error en registro" }); 
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length > 0) {
            const user = rows[0];
            const [salt, storedHash] = user.password_hash.split('$');
            if (md5(password + salt) === storedHash) {
                const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '24h' });
                log('AUTH', `Login success: ${username}`);
                return res.json({ token, username: user.username, avatar: user.avatar_url });
            }
        }
        log('AUTH', `Login failed: Invalid credentials for ${username}`);
        res.status(401).json({ error: "Credenciales incorrectas" });
    } catch (e) { 
        log('ERROR', `Login server error: ${e.message}`);
        res.status(500).json({ error: "Error de servidor" }); 
    }
});

// --- ROOMS ENDPOINTS ---
app.get('/api/rooms', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM rooms ORDER BY created_at DESC');
        res.json(rows);
    } catch (e) { res.status(500).json({ error: "Error" }); }
});

app.get('/api/rooms/:name/content', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT p.last_content 
            FROM rooms r 
            JOIN projects p ON r.actual_project_id = p.id 
            WHERE r.room_name = ?`, [req.params.name]);
        
        log('ROOM', `Content requested for room: ${req.params.name} by ${req.user.username}`);
        res.json({ content: rows.length > 0 ? rows[0].last_content : "" });
    } catch (e) { res.status(500).json({ error: "Error al cargar contenido" }); }
});

app.post('/api/rooms', authenticateToken, async (req, res) => {
    const { room_name, description, actual_project_id } = req.body;
    if (!room_name) return res.status(400).json({ error: "Nombre obligatorio" });
    try {
        await db.execute('INSERT INTO rooms (room_name, description, actual_project_id) VALUES (?, ?, ?)', 
            [room_name, description || "No description", actual_project_id || null]);
        rooms[room_name] = [];
        
        log('ROOM', `Created: "${room_name}" by ${req.user.username}`);
        res.status(201).json({ message: "Sala creada" });
    } catch (e) { 
        log('ERROR', `Room creation failed: ${e.message}`);
        res.status(400).json({ error: "Error o duplicado" }); 
    }
});

// --- PROJECTS ENDPOINTS ---
app.get('/api/projects', authenticateToken, async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at DESC', [req.user.id]);
    res.json(rows);
});

app.post('/api/projects', authenticateToken, async (req, res) => {
    const { project_name } = req.body;
    try {
        const [result] = await db.execute('INSERT INTO projects (project_name, owner_id, last_content) VALUES (?, ?, ?)', 
            [project_name, req.user.id, ""]);
        log('PROJECT', `New project created: ${project_name} (ID: ${result.insertId})`);
        res.status(201).json({ id: result.insertId });
    } catch (e) { 
        log('ERROR', `Project creation: ${e.message}`);
        res.status(500).json({ error: "Error al crear proyecto" }); 
    }
});

app.post('/api/projects/save-current', authenticateToken, async (req, res) => {
    const { room_name, content } = req.body;
    try {
        const [roomData] = await db.execute('SELECT actual_project_id FROM rooms WHERE room_name = ?', [room_name]);
        if (roomData.length === 0 || !roomData[0].actual_project_id) return res.status(400).json({ error: "No vinculado" });
        
        const [result] = await db.execute('UPDATE projects SET last_content = ? WHERE id = ? AND owner_id = ?', [content, roomData[0].actual_project_id, req.user.id]);
        if (result.affectedRows === 0) {
            log('PROJECT', `Save failed: No permission or project not found for room "${room_name}" by ${req.user.username}`);
            return res.status(403).json({ error: "No tienes permiso para guardar este proyecto" });
        }
        
        log('PROJECT', `Saved content for room "${room_name}" by ${req.user.username}`);
        res.json({ message: "Guardado" });
    } catch (e) { 
        log('ERROR', `Save failed: ${e.message}`);
        res.status(500).json({ error: "Error" }); 
    }
});

// --- WEBSOCKETS (P2P) ---
app.ws('/room/:id', (ws, req) => {
    const token = req.query.token;
    const roomName = req.params.id;
    if (!token) {
        log('WS', `Connection rejected: No token for room ${roomName}`);
        return ws.close(4001);
    }

    (async () => {
        try {
            const decoded = jwt.verify(token, SECRET_KEY);
            const [roomExists] = await db.execute('SELECT id FROM rooms WHERE room_name = ?', [roomName]);
            
            if (roomExists.length === 0) {
                log('WS', `Connection rejected: Room "${roomName}" does not exist in DB`);
                return ws.close(4004);
            }

            // Cancel cleanup if someone joins
            if (roomTimeouts[roomName]) {
                log('ROOM', `Cleanup cancelled for "${roomName}" (User joined)`);
                clearTimeout(roomTimeouts[roomName]);
                delete roomTimeouts[roomName];
            }

            if (!rooms[roomName]) rooms[roomName] = [];
            
            // Prevent duplicate sessions for same user in same room if needed
            if (rooms[roomName].some(u => u.id === decoded.id)) {
                log('WS', `User ${decoded.username} already in room ${roomName}. Closing old connection.`);
                // For this implementation, we close the new attempt.
                return ws.close(4003);
            }
            
            const userContext = { ws, id: decoded.id, username: decoded.username };
            rooms[roomName].push(userContext);

            log('WS', `User "${decoded.username}" (ID: ${decoded.id}) connected to room "${roomName}"`);

            ws.send(JSON.stringify({ type: 'set-id', id: decoded.id }));
            broadcastToRoom(roomName, { type: 'user-connected', id: decoded.id, username: decoded.username }, decoded.id);

            ws.on('message', (msgStr) => {
                try {
                    const msg = JSON.parse(msgStr);
                    // Targeted message (WebRTC Signaling / Direct Chat)
                    if (msg.targetId) {
                        const target = rooms[roomName].find(u => u.id === msg.targetId);
                        if (target?.ws.readyState === 1) {
                            target.ws.send(JSON.stringify({ ...msg, authorId: decoded.id }));
                        }
                    } else {
                        // General broadcast (Code sync, presence)
                        broadcastToRoom(roomName, { ...msg, authorId: decoded.id }, decoded.id);
                    }
                } catch (err) {
                    log('ERROR', `WS Message parse error from ${decoded.username}: ${err.message}`);
                }
            });

            ws.on('close', () => {
                if (rooms[roomName]) {
                    rooms[roomName] = rooms[roomName].filter(u => u.ws !== ws);
                    log('WS', `User "${decoded.username}" disconnected from "${roomName}"`);
                    
                    broadcastToRoom(roomName, { type: 'user-disconnected', id: decoded.id });
                    
                    if (rooms[roomName].length === 0) {
                        log('ROOM', `Room "${roomName}" is empty. Deletion scheduled in ${ROOM_DELETE_TIMEOUT / 1000}s`);
                        roomTimeouts[roomName] = setTimeout(async () => {
                            try {
                                await db.execute('DELETE FROM rooms WHERE room_name = ?', [roomName]);
                                delete rooms[roomName];
                                delete roomTimeouts[roomName];
                                log('ROOM', `Room "${roomName}" permanently deleted due to inactivity`);
                            } catch (err) {
                                log('ERROR', `Failed to delete room "${roomName}": ${err.message}`);
                            }
                        }, ROOM_DELETE_TIMEOUT);
                    }
                }
            });
        } catch (e) { 
            log('WS', `Auth error for WebSocket: ${e.message}`);
            ws.close(4002); 
        }
    })();
});

function broadcastToRoom(roomId, data, excludeId = null) {
    if (!rooms[roomId]) return;
    const msg = JSON.stringify(data);
    rooms[roomId].forEach(u => { 
        if (u.id !== excludeId && u.ws.readyState === 1) {
            u.ws.send(msg); 
        }
    });
}

app.listen(port, () => log('SERVER', `Ready at http://localhost:${port}`));