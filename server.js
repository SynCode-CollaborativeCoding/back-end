import express from 'express';
import ExpressWs from 'express-ws';
import cors from 'cors';

const { app } = ExpressWs(express());
const port = 3000;

// Diccionario para guardar qué clientes están en qué sala
const rooms = {}; 

app.use(cors({ origin: '*' }));
app.ws('/room/:id', (ws, req) => {
    const roomId = req.params.id;
    console.log(`Usuario conectado a la sala: ${roomId}`);

    // Crear la sala si no existe
    if (!rooms[roomId]) rooms[roomId] = new Set();
    rooms[roomId].add(ws);

    ws.on('message', (msg) => {
        // Reenviar el mensaje a todos los demás en la misma sala
        rooms[roomId].forEach(client => {
            if (client !== ws && client.readyState === 1) {
                client.send(msg);
            }
        });
    });

    ws.on('close', () => {
        rooms[roomId].delete(ws);
        console.log(`Usuario salió de la sala: ${roomId}`);
    });
});

app.listen(port, () => {
    console.log(`Servidor SynCode corriendo en http://localhost:${port}`);
});