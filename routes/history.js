import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { HistoryService } from '../services/HistoryService.js';

export function createHistoryRoutes() {
    const router = express.Router();

    router.get('/:id/history', authenticateToken, async (req, res) => {
        try {
            const history = await HistoryService.getProjectHistory(req.params.id, req.user.id);
            res.json(history);
        } catch (e) {
            if (e.message === "No tienes permiso") {
                res.status(403).json({ error: "No tienes permiso" });
            } else {
                res.status(500).json({ error: "Error al cargar historial" });
            }
        }
    });

    router.get('/:id/history/:historyId', authenticateToken, async (req, res) => {
        try {
            const version = await HistoryService.getHistoryVersion(req.params.id, req.params.historyId, req.user.id);
            res.json(version);
        } catch (e) {
            if (e.message === "No tienes permiso") {
                res.status(403).json({ error: "No tienes permiso" });
            } else if (e.message === "Versión no encontrada") {
                res.status(404).json({ error: "Versión no encontrada" });
            } else {
                res.status(500).json({ error: "Error al cargar versión" });
            }
        }
    });

    router.post('/:id/history/:historyId/restore', authenticateToken, async (req, res) => {
        try {
            await HistoryService.restoreVersion(req.params.id, req.params.historyId, req.user.id, req.user.username);
            res.json({ message: "Versión restaurada" });
        } catch (e) {
            if (e.message === "No tienes permiso") {
                res.status(403).json({ error: "No tienes permiso" });
            } else if (e.message === "Versión no encontrada") {
                res.status(404).json({ error: "Versión no encontrada" });
            } else {
                res.status(500).json({ error: "Error al restaurar versión" });
            }
        }
    });

    router.delete('/:id/history/:historyId', authenticateToken, async (req, res) => {
        try {
            await HistoryService.deleteVersion(req.params.id, req.params.historyId, req.user.id, req.user.username);
            res.json({ message: "Versión eliminada" });
        } catch (e) {
            if (e.message === "No tienes permiso") {
                res.status(403).json({ error: "No tienes permiso" });
            } else if (e.message === "Versión no encontrada") {
                res.status(404).json({ error: "Versión no encontrada" });
            } else {
                res.status(500).json({ error: "Error al eliminar versión" });
            }
        }
    });

    return router;
}
