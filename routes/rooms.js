import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { RoomService } from '../services/RoomService.js';

export function createRoomRoutes() {
    const router = express.Router();

    router.get('/', authenticateToken, async (req, res) => {
        try {
            const rooms = await RoomService.getAllRooms();
            res.json(rooms);
        } catch (e) {
            res.status(500).json({ error: "Error" });
        }
    });

    router.post('/', authenticateToken, async (req, res) => {
        const { room_name, description, actual_project_id } = req.body;
        if (!room_name) return res.status(400).json({ error: "Nombre obligatorio" });
        try {
            await RoomService.createRoom(room_name, description, actual_project_id, req.user.username);
            res.status(201).json({ message: "Sala creada" });
        } catch (e) {
            res.status(400).json({ error: "Error o duplicado" });
        }
    });

    router.put('/:name/project', authenticateToken, async (req, res) => {
        const { project_id } = req.body;
        try {
            await RoomService.updateRoomProject(req.params.name, project_id, req.user.username);
            res.json({ message: "Proyecto vinculado" });
        } catch (e) {
            if (e.message === "Room not found") {
                res.status(404).json({ error: "Room not found" });
            } else if (e.message === "Proyecto no encontrado") {
                res.status(404).json({ error: "Proyecto no encontrado" });
            } else {
                res.status(500).json({ error: "Error" });
            }
        }
    });

    router.get('/:name/content', authenticateToken, async (req, res) => {
        try {
            const content = await RoomService.getRoomContent(req.params.name, req.user.username);
            res.json({ content });
        } catch (e) {
            res.status(500).json({ error: "Error al cargar contenido" });
        }
    });

    return router;
}
