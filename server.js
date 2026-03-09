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
const ROOM_DELETE_TIMEOUT = 1 * 60 * 1000; // 5 minutos de gracia para salas vacías

app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

// --- ESTRUCTURAS DE DATOS EN MEMORIA ---
const rooms = {};        // { roomName: [ { ws, id, username } ] }
const roomTimeouts = {}; // { roomName: timeoutObject }

// --- MIDDLEWARES ---

// Middleware para logs de sistema
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
    next();
});

// Middleware para validar el JWT en rutas API
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: "No token provided" });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: "Token invalid or expired" });
        req.user = user;
        next();
    });
};

// --- ENDPOINTS DE AUTENTICACIÓN ---

app.post('/api/auth/register', async (req, res) => {
    const { username, password, avatar } = req.body;
    try {
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = md5(password + salt);
        const storedPassword = `${salt}$${passwordHash}`;
        
        await db.execute(
            'INSERT INTO users (username, password_hash, avatar_url) VALUES (?, ?, ?)',
            [username, storedPassword, avatar]
        );
        res.status(201).json({ message: "Usuario creado con éxito" });
    } catch (error) {
        res.status(400).json({ error: "El usuario ya existe o hay un error en los datos" });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length > 0) {
            const user = rows[0];
            const [salt, storedHash] = user.password_hash.split('$');
            const loginHash = md5(password + salt);

            if (loginHash === storedHash) {
                const token = jwt.sign(
                    { id: user.id, username: user.username }, 
                    SECRET_KEY, 
                    { expiresIn: '24h' }
                );
                return res.json({ token, username: user.username, avatar: user.avatar_url });
            }
        }
        res.status(401).json({ error: "Credenciales incorrectas" });
    } catch (error) {
        res.status(500).json({ error: "Error en el servidor" });
    }
});

// --- ENDPOINTS DE GESTIÓN DE SALAS ---

app.get('/api/rooms', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM rooms ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener salas" });
    }
});

app.post('/api/rooms', authenticateToken, async (req, res) => {
    const { room_name, description } = req.body;
    if (!room_name) return res.status(400).json({ error: "El nombre es obligatorio" });

    try {
        await db.execute(
            'INSERT INTO rooms (room_name, description) VALUES (?, ?)',
            [room_name, description || "No description provided"]
        );
        res.status(201).json({ message: "Sala creada con éxito" });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') res.status(400).json({ error: "Ya existe esa sala" });
        else res.status(500).json({ error: "Error al crear sala" });
    }
});

// --- LÓGICA DE WEBSOCKETS (TIEMPO REAL) ---

app.ws('/room/:id', (ws, req) => {
    const token = req.query.token;
    const roomName = req.params.id;

    if (!token) return ws.close(4001, "Token requerido");

    // Convertimos la lógica en una función autoejecutable asíncrona para usar await
    (async () => {
        try {
            const decoded = jwt.verify(token, SECRET_KEY);
            const userId = decoded.id;
            const username = decoded.username;

            // --- VALIDACIÓN CONTRA BASE DE DATOS ---
            const [roomExists] = await db.execute(
                'SELECT id FROM rooms WHERE room_name = ?', 
                [roomName]
            );

            if (roomExists.length === 0) {
                console.warn(`[WS] Rejection: User ${username} tried to join non-existent room: ${roomName}`);
                return ws.close(4004, "La sala no existe en la base de datos");
            }
            // ----------------------------------------------

            // 1. CANCELAR BORRADO SI HABÍA UN TIMEOUT ACTIVO
            if (roomTimeouts[roomName]) {
                console.log(`[CLEANUP] Deletion cancelled for room: ${roomName}`);
                clearTimeout(roomTimeouts[roomName]);
                delete roomTimeouts[roomName];
            }

            if (!rooms[roomName]) rooms[roomName] = [];
            
            // Anti-duplicados
            if (rooms[roomName].some(u => u.id === userId)) {
                return ws.close(4003, "Sesión duplicada");
            }
            
            const userContext = { ws, id: userId, username: username };
            rooms[roomName].push(userContext);

            console.log(`[WS] ${username} joined ${roomName}. Online: ${rooms[roomName].length}`);

            ws.send(JSON.stringify({ type: 'set-id', id: userId }));
            broadcastToRoom(roomName, { type: 'user-connected', id: userId }, userId);

            ws.on('message', (msgStr) => {
                try {
                    const msg = JSON.parse(msgStr);
                    if (msg.targetId) {
                        const target = rooms[roomName].find(u => u.id === msg.targetId);
                        if (target?.ws.readyState === 1) target.ws.send(JSON.stringify({ ...msg, authorId: userId }));
                    } else {
                        broadcastToRoom(roomName, { ...msg, authorId: userId }, userId);
                    }
                } catch (e) { console.error("WS Error:", e.message); }
            });

            ws.on('close', () => {
                if (rooms[roomName]) {
                    rooms[roomName] = rooms[roomName].filter(u => u.ws !== ws);
                    broadcastToRoom(roomName, { type: 'user-disconnected', id: userId });

                    // 2. SISTEMA DE BORRADO AUTOMÁTICO TRAS INACTIVIDAD
                    if (rooms[roomName].length === 0) {
                        console.log(`[CLEANUP] Room ${roomName} empty. Scheduled deletion in ${ROOM_DELETE_TIMEOUT/60000}m.`);
                        
                        roomTimeouts[roomName] = setTimeout(async () => {
                            try {
                                await db.execute('DELETE FROM rooms WHERE room_name = ?', [roomName]);
                                delete rooms[roomName];
                                delete roomTimeouts[roomName];
                                console.log(`[DB] Room "${roomName}" removed due to inactivity.`);
                            } catch (err) {
                                console.error(`[ERROR] Auto-delete failed for ${roomName}:`, err.message);
                            }
                        }, ROOM_DELETE_TIMEOUT);
                    }
                }
            });

        } catch (e) {
            console.error("[WS] Auth Error:", e.message);
            ws.close(4002, "Token inválido");
        }
    })();
});

// Función auxiliar para broadcast
function broadcastToRoom(roomId, data, excludeId = null) {
    if (!rooms[roomId]) return;
    const msg = JSON.stringify(data);
    rooms[roomId].forEach(u => {
        if (u.id !== excludeId && u.ws.readyState === 1) u.ws.send(msg);
    });
}

app.listen(port, () => {
    console.log(`[SERVER] SynCode Backend running on http://localhost:${port}`);
});