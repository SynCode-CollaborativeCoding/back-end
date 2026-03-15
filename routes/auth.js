import express from 'express';
import { AuthService } from '../services/AuthService.js';

export function createAuthRoutes() {
    const router = express.Router();

    router.post('/register', async (req, res) => {
        const { username, password, avatar } = req.body;
        try {
            await AuthService.register(username, password, avatar);
            res.status(201).json({ message: "Éxito" });
        } catch (e) {
            res.status(400).json({ error: "Error en registro" });
        }
    });

    router.post('/login', async (req, res) => {
        const { username, password } = req.body;
        try {
            const result = await AuthService.login(username, password);
            res.json({ token: result.token, username: result.username, avatar: result.avatar });
        } catch (e) {
            if (e.message.includes("Credenciales")) {
                res.status(401).json({ error: "Credenciales incorrectas" });
            } else {
                res.status(500).json({ error: "Error de servidor" });
            }
        }
    });

    return router;
}
