import jwt from 'jsonwebtoken';
import { Logger } from '../utils/logger.js';
import config from '../config.js';

export function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "No token provided" });

    jwt.verify(token, config.secretKey, (err, user) => {
        if (err) {
            Logger.log('AUTH', `Invalid token attempt on ${req.path}`);
            return res.status(403).json({ error: "Token invalid or expired" });
        }
        req.user = user;
        next();
    });
}
