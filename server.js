import express from 'express';
import ExpressWs from 'express-ws';
import cors from 'cors';
import bodyParser from 'body-parser';
import md5 from 'blueimp-md5';
import jwt from 'jsonwebtoken';
import db from './db.js';      // Importamos la conexión a la base de datos
import dotenv from 'dotenv';
import crypto from 'node:crypto';

clearUsers(); // DEBUG: Limpiar usuarios al iniciar el servidor (para pruebas)
dotenv.config();

const { app } = ExpressWs(express());
const port = 3000;
const SECRET_KEY = process.env.SECRET_KEY;
console.log(`[SERVER] Starting backend with SECRET_KEY: ${SECRET_KEY ? '***' : 'NOT SET'}`);
app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

// Middleware para logs de requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Enpoints autenticación

//1. Sign up
app.post('/api/auth/register', async (req, res) => {
    const { username, password, avatar } = req.body;
    console.log(`[REGISTER] Attempting registration for user: ${username}`);
    try {
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = md5(password + salt); // Encriptación MD5 con salt
        const storedPassword = `${salt}$${passwordHash}`; // Guardamos salt y hash juntos
        const [result] = await db.execute(
            'INSERT INTO users (username, password_hash, avatar_url) VALUES (?, ?, ?)',
            [username, storedPassword, avatar]
        );
        console.log(`[REGISTER] User created successfully: ${username}`);
        res.status(201).json({ message: "Usuario creado con éxito" });
    } catch (error) {
        console.error(`[REGISTER] Error registering user ${username}:`, error.message);
        res.status(400).json({ error: "El usuario ya existe o hay un error en los datos" });
    }
});

//2. Login
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    console.log(`[LOGIN] Attempting login for user: ${username}`);
    
    try {
        const [rows] = await db.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );

        if (rows.length > 0) {
            const user = rows[0];
            const [salt, storedHash] = user.password_hash.split('$');
            const loginHash = md5(password + salt);

            if (loginHash === storedHash) {
                // Crear Token JWT
                const token = jwt.sign(
                    { id: user.id, username: user.username }, 
                    SECRET_KEY, 
                    { expiresIn: '24h' }
                );
                
                console.log(`[LOGIN] User logged in successfully: ${username}`);
                return res.json({ token, username: user.username, avatar: user.avatar_url });
            }
        }

        console.warn(`[LOGIN] Failed login attempt for user: ${username}`);
        res.status(401).json({ error: "Credenciales incorrectas" });

    } catch (error) {
        console.error(`[LOGIN] Server error:`, error.message);
        res.status(500).json({ error: "Error en el servidor" });
    }
});

// WebSocket

// Estructura: { roomId: [ { ws, id, username } ] }
const rooms = {}; 
let nextUserId = 1;

app.ws('/room/:id', (ws, req) => {
    const token = req.query.token;
    const roomId = req.params.id;

    if (!token) {
        console.warn(`[WS] Connection rejected for room ${roomId}: No token provided`);
        ws.close(4001, "Token de autenticación requerido");
        return;
    }
    
    try {
        const decoded = jwt.verify(token, SECRET_KEY);

        const userId = decoded.id;
        const username = decoded.username;

        // Anti-duplicados
        if (rooms[roomId]) {
            const isAlreadyOnRoom = rooms[roomId].some(u => u.id === userId);
            if (isAlreadyOnRoom) {
                console.warn(`[WS] Rejected: User ${username} already in room ${roomId}`);
                ws.close(4003, "Ya tienes una sesión abierta en esta sala");
                return;
            }
        }
        
        // Inicializar sala si no existe
        if (!rooms[roomId]) rooms[roomId] = [];
        
        const userContext = { ws, id: userId, username: username };
        rooms[roomId].push(userContext);

        console.log(`[WS] User ${username} (${userId}) verified and joined room ${roomId}`);

        // Enviar ID propio al usuario
        ws.send(JSON.stringify({
            type: 'set-id',
            id: userId
        }));

        // Notificar a los demás
        broadcastToRoom(roomId, {
            type: 'user-connected',
            id: userId
        }, userId);

        ws.on('message', (msgStr) => {
            try {
                const msg = JSON.parse(msgStr);
                
                // Actualizar username si el cliente lo envía
                if (msg.type === 'login') userContext.username = msg.username;

                // History
                if (msg.targetId) {
                    // Envío privado (Peer-to-peer)
                    const target = rooms[roomId].find(u => u.id === msg.targetId);
                    if (target && target.ws.readyState === 1) {
                        target.ws.send(JSON.stringify({ ...msg, authorId: userId }));
                    }
                } else {
                    // Broadcast a toda la sala
                    broadcastToRoom(roomId, { ...msg, authorId: userId }, userId);
                }
            } catch (e) {
                console.error(`[WS] Error processing JSON from user ${userId}:`, e.message);
            }
        });

        ws.on('close', () => {
            // Eliminar usuario de la sala
            rooms[roomId] = rooms[roomId].filter(u => u.ws !== ws);
            console.log(`[WS] User ${userId} (${userContext.username}) left room ${roomId}. Remaining users: ${rooms[roomId].length}`);
            
            // Notificar logout
            broadcastToRoom(roomId, {
                type: 'user-disconnected',
                id: userId
            });

            if (rooms[roomId].length === 0) {
                delete rooms[roomId];
                console.log(`[WS] Room ${roomId} deleted (no users remaining)`);
            }
        });
    } catch (e) {
        console.error(`[WS] Connection rejected for room ${roomId}: Invalid token. Error:`, e.message);
        ws.close(4002, "Token inválido");
    }
});

// Función broadcast para reenviar a todos en la sala menos al autor
function broadcastToRoom(roomId, data, excludeId = null) {
    if (!rooms[roomId]) return;
    const msg = JSON.stringify(data);
    rooms[roomId].forEach(user => {
        if (user.id !== excludeId && user.ws.readyState === 1) {
            user.ws.send(msg);
        }
    });
}

app.listen(port, () => {
    console.log(`[SERVER] Backend ready in http://localhost:${port}`);
});

// DEBUG Functions
// remove all users from database (for testing)
export async function clearUsers() {
    try {
        await db.execute('DELETE FROM users');
        console.log("[DEBUG] All users cleared from database");
    } catch (error) {
        console.error("[DEBUG] Error clearing users:", error.message);
    }
}