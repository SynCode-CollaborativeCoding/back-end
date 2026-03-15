import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { ProjectService } from '../services/ProjectService.js';
import { HistoryService } from '../services/HistoryService.js';

export function createProjectRoutes() {
    const router = express.Router();

    router.get('/', authenticateToken, async (req, res) => {
        try {
            const projects = await ProjectService.getUserProjects(req.user.id);
            res.json(projects);
        } catch (e) {
            res.status(500).json({ error: "Error" });
        }
    });

    router.post('/', authenticateToken, async (req, res) => {
        const { project_name } = req.body;
        try {
            const result = await ProjectService.createProject(project_name, req.user.id);
            res.status(201).json(result);
        } catch (e) {
            res.status(500).json({ error: "Error al crear proyecto" });
        }
    });

    router.get('/:id/info', authenticateToken, async (req, res) => {
        try {
            const project = await ProjectService.getProjectInfo(req.params.id);
            res.json(project);
        } catch (e) {
            if (e.message === "Project not found") {
                res.status(404).json({ error: "Project not found" });
            } else {
                res.status(500).json({ error: "Error" });
            }
        }
    });

    router.delete('/:id', authenticateToken, async (req, res) => {
        try {
            const result = await ProjectService.deleteProject(req.params.id, req.user.id);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: "Error deleting project" });
        }
    });

    router.post('/save-current', authenticateToken, async (req, res) => {
        const { room_name, content, version_label } = req.body;
        try {
            await HistoryService.saveContent(room_name, content, version_label, req.user.id, req.user.username);
            res.json({ message: "Guardado" });
        } catch (e) {
            if (e.message === "No vinculado") {
                res.status(400).json({ error: "No vinculado" });
            } else if (e.message === "Proyecto no encontrado") {
                res.status(404).json({ error: "Proyecto no encontrado" });
            } else {
                res.status(500).json({ error: "Error" });
            }
        }
    });

    return router;
}
