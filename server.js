import express from 'express';
import ExpressWs from 'express-ws';
import cors from 'cors';
import bodyParser from 'body-parser';
import md5 from 'blueimp-md5';
import jwt from 'jsonwebtoken';
import db from './db.js';      // Importamos la conexión a la base de datos

const { app } = ExpressWs(express());
const port = 3000;
const SECRET_KEY = "syncode_secret";

app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

// Enpoints autenticación

//1. Sign up
app.post('/api/auth/register', async (req, res) => {
    const { username, password, avatar } = req.body;
    try {
        const passwordHash = md5(password); // Encriptación MD5
        const [result] = await db.execute(
            'INSERT INTO users (username, password_hash, avatar_url) VALUES (?, ?, ?)',
            [username, passwordHash, avatar]
        );
        res.status(201).json({ message: "Usuario creado con éxito" });
    } catch (error) {
        res.status(400).json({ error: "El usuario ya existe o hay un error en los datos" });
    }
});

//2. Login
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const passwordHash = md5(password);
        const [rows] = await db.execute(
            'SELECT * FROM users WHERE username = ? AND password_hash = ?',
            [username, passwordHash]
        );

        if (rows.length > 0) {
            const user = rows[0];
            // Crear Token JWT
            const token = jwt.sign(
                { id: user.id, username: user.username }, 
                SECRET_KEY, 
                { expiresIn: '24h' } // Expira en 24 horas
            );
            res.json({ token, username: user.username, avatar: user.avatar_url });
        } else {
            res.status(401).json({ error: "Credenciales incorrectas" });
        }
    } catch (error) {
        res.status(500).json({ error: "Error en el servidor" });
    }
});

// WebSocket

// Estructura: { roomId: [ { ws, id, username } ] }
const rooms = {}; 
let nextUserId = 1;

app.ws('/room/:id', (ws, req) => {
    const roomId = req.params.id;
    const userId = nextUserId++;
    
    // Inicializar sala si no existe
    if (!rooms[roomId]) rooms[roomId] = [];
    
    const userContext = { ws, id: userId, username: 'Anonymous' };
    rooms[roomId].push(userContext);

    console.log(`User ${userId} joined room ${roomId}`);

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
            console.error("Error processing JSON:", e);
        }
    });

    ws.on('close', () => {
        // Eliminar usuario de la sala
        rooms[roomId] = rooms[roomId].filter(u => u.ws !== ws);
        console.log(`User ${userId} left room ${roomId}`);
        
        // Notificar logout
        broadcastToRoom(roomId, {
            type: 'user-disconnected',
            id: userId
        });

        if (rooms[roomId].length === 0) delete rooms[roomId];
    });
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
    console.log(`Backend ready in http://localhost:${port}`);
});