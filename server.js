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
                const token = jwt.sign({ id: user.id, username: user.username, avatar: user.avatar_url }, SECRET_KEY, { expiresIn: '24h' });
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

app.put('/api/rooms/:name/project', authenticateToken, async (req, res) => {
    const { project_id } = req.body;
    try {
        const [roomData] = await db.execute('SELECT actual_project_id FROM rooms WHERE room_name = ?', [req.params.name]);
        if (roomData.length === 0) return res.status(404).json({ error: "Room not found" });

        // Verify project exists (anyone can link it)
        const [projectData] = await db.execute('SELECT id FROM projects WHERE id = ?', [project_id]);
        if (projectData.length === 0) {
            return res.status(404).json({ error: "Proyecto no encontrado" });
        }

        await db.execute('UPDATE rooms SET actual_project_id = ? WHERE room_name = ?', [project_id, req.params.name]);
        log('ROOM', `Room "${req.params.name}" linked to project ${project_id} by ${req.user.username}`);
        res.json({ message: "Proyecto vinculado" });
    } catch (e) {
        log('ERROR', `Room update failed: ${e.message}`);
        res.status(500).json({ error: "Error" });
    }
});

app.get('/api/rooms/:name/content', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT ch.content_snapshot
            FROM rooms r
            JOIN projects p ON r.actual_project_id = p.id
            LEFT JOIN code_history ch ON p.id = ch.project_id
            WHERE r.room_name = ?
            ORDER BY ch.saved_at DESC
            LIMIT 1`, [req.params.name]);

        log('ROOM', `Content requested for room: ${req.params.name} by ${req.user.username}`);
        res.json({ content: rows.length > 0 ? rows[0].content_snapshot : "" });
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

app.get('/api/projects/:id/info', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT id, project_name FROM projects WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: "Project not found" });
        }
        res.json(rows[0]);
    } catch (e) {
        log('ERROR', `Project info fetch failed: ${e.message}`);
        res.status(500).json({ error: "Error" });
    }
});

app.post('/api/projects', authenticateToken, async (req, res) => {
    const { project_name } = req.body;
    try {
        const [result] = await db.execute('INSERT INTO projects (project_name, owner_id) VALUES (?, ?)',
            [project_name, req.user.id]);
        log('PROJECT', `New project created: ${project_name} (ID: ${result.insertId})`);
        res.status(201).json({ id: result.insertId });
    } catch (e) {
        log('ERROR', `Project creation: ${e.message}`);
        res.status(500).json({ error: "Error al crear proyecto" });
    }
});

app.post('/api/projects/save-current', authenticateToken, async (req, res) => {
    const { room_name, content, version_label } = req.body;
    try {
        const [roomData] = await db.execute('SELECT actual_project_id FROM rooms WHERE room_name = ?', [room_name]);
        if (roomData.length === 0 || !roomData[0].actual_project_id) return res.status(400).json({ error: "No vinculado" });

        const projectId = roomData[0].actual_project_id;

        // Verify project exists (anyone can save)
        const [projectData] = await db.execute('SELECT id FROM projects WHERE id = ?', [projectId]);
        if (projectData.length === 0) {
            return res.status(404).json({ error: "Proyecto no encontrado" });
        }

        // Insert into code_history
        await db.execute(
            'INSERT INTO code_history (project_id, user_id, content_snapshot, version_label) VALUES (?, ?, ?, ?)',
            [projectId, req.user.id, content, version_label || null]
        );

        // Update project's updated_at timestamp
        await db.execute('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [projectId]);

        log('PROJECT', `Saved content for room "${room_name}" by ${req.user.username}`);
        res.json({ message: "Guardado" });
    } catch (e) {
        log('ERROR', `Save failed: ${e.message}`);
        res.status(500).json({ error: "Error" });
    }
});

app.delete('/api/projects/:id', authenticateToken, async (req, res) => {
    try {
        await db.execute('DELETE FROM projects WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
        res.json({ message: "Project and all history deleted" });
    } catch (e) { res.status(500).json({ error: "Error deleting project" }); }
});

// --- CODE HISTORY ENDPOINTS ---
app.get('/api/projects/:id/history', authenticateToken, async (req, res) => {
    try {
        // Verify ownership
        const [projectData] = await db.execute('SELECT owner_id FROM projects WHERE id = ?', [req.params.id]);
        if (projectData.length === 0 || projectData[0].owner_id !== req.user.id) {
            return res.status(403).json({ error: "No tienes permiso" });
        }

        const [history] = await db.execute(
            `SELECT ch.id, ch.user_id, ch.content_snapshot, ch.version_label, ch.saved_at, u.username
             FROM code_history ch
             JOIN users u ON ch.user_id = u.id
             WHERE ch.project_id = ?
             ORDER BY ch.saved_at DESC`,
            [req.params.id]
        );

        log('HISTORY', `History fetched for project ${req.params.id} by ${req.user.username}`);
        res.json(history);
    } catch (e) {
        log('ERROR', `History fetch failed: ${e.message}`);
        res.status(500).json({ error: "Error al cargar historial" });
    }
});

app.get('/api/projects/:id/history/:historyId', authenticateToken, async (req, res) => {
    try {
        // Verify ownership
        const [projectData] = await db.execute('SELECT owner_id FROM projects WHERE id = ?', [req.params.id]);
        if (projectData.length === 0 || projectData[0].owner_id !== req.user.id) {
            return res.status(403).json({ error: "No tienes permiso" });
        }

        const [versionData] = await db.execute(
            `SELECT id, user_id, content_snapshot, version_label, saved_at
             FROM code_history
             WHERE id = ? AND project_id = ?`,
            [req.params.historyId, req.params.id]
        );

        if (versionData.length === 0) {
            return res.status(404).json({ error: "Versión no encontrada" });
        }

        log('HISTORY', `Version ${req.params.historyId} fetched by ${req.user.username}`);
        res.json(versionData[0]);
    } catch (e) {
        log('ERROR', `Version fetch failed: ${e.message}`);
        res.status(500).json({ error: "Error al cargar versión" });
    }
});

app.post('/api/projects/:id/history/:historyId/restore', authenticateToken, async (req, res) => {
    try {
        // Verify ownership
        const [projectData] = await db.execute('SELECT owner_id FROM projects WHERE id = ?', [req.params.id]);
        if (projectData.length === 0 || projectData[0].owner_id !== req.user.id) {
            return res.status(403).json({ error: "No tienes permiso" });
        }

        // Get the content from the specified version
        const [versionData] = await db.execute(
            'SELECT content_snapshot FROM code_history WHERE id = ? AND project_id = ?',
            [req.params.historyId, req.params.id]
        );

        if (versionData.length === 0) {
            return res.status(404).json({ error: "Versión no encontrada" });
        }

        // Create a new history entry with the restored content
        await db.execute(
            'INSERT INTO code_history (project_id, user_id, content_snapshot, version_label) VALUES (?, ?, ?, ?)',
            [req.params.id, req.user.id, versionData[0].content_snapshot, `Restored from version ${req.params.historyId}`]
        );

        // Update project's updated_at timestamp
        await db.execute('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);

        log('HISTORY', `Version ${req.params.historyId} restored for project ${req.params.id} by ${req.user.username}`);
        res.json({ message: "Versión restaurada" });
    } catch (e) {
        log('ERROR', `Restore failed: ${e.message}`);
        res.status(500).json({ error: "Error al restaurar versión" });
    }
});

app.delete('/api/projects/:id/history/:historyId', authenticateToken, async (req, res) => {
    try {
        // Verify ownership
        const [projectData] = await db.execute('SELECT owner_id FROM projects WHERE id = ?', [req.params.id]);
        if (projectData.length === 0 || projectData[0].owner_id !== req.user.id) {
            return res.status(403).json({ error: "No tienes permiso" });
        }

        const [result] = await db.execute(
            'DELETE FROM code_history WHERE id = ? AND project_id = ?',
            [req.params.historyId, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Versión no encontrada" });
        }

        log('HISTORY', `Version ${req.params.historyId} deleted from project ${req.params.id} by ${req.user.username}`);
        res.json({ message: "Versión eliminada" });
    } catch (e) {
        log('ERROR', `Delete failed: ${e.message}`);
        res.status(500).json({ error: "Error al eliminar versión" });
    }
});


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
            broadcastToRoom(roomName, { type: 'user-connected', id: decoded.id, username: decoded.username, avatar: decoded.avatar }, decoded.id);

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