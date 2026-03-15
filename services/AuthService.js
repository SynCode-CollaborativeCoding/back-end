import crypto from 'node:crypto';
import md5 from 'blueimp-md5';
import jwt from 'jsonwebtoken';
import { Logger } from '../utils/logger.js';
import config from '../config.js';
import db from '../db.js';

export class AuthService {
    static async register(username, password, avatar) {
        try {
            const salt = crypto.randomBytes(16).toString('hex');
            const passwordHash = md5(password + salt);
            const storedPassword = `${salt}$${passwordHash}`;
            await db.execute('INSERT INTO users (username, password_hash, avatar_url) VALUES (?, ?, ?)',
                [username, storedPassword, avatar]);

            Logger.log('AUTH', `User registered: ${username}`);
            return { success: true, message: "Éxito" };
        } catch (e) {
            Logger.log('ERROR', `Registration failed for ${username}: ${e.message}`);
            throw e;
        }
    }

    static async login(username, password) {
        try {
            const [rows] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
            if (rows.length > 0) {
                const user = rows[0];
                const [salt, storedHash] = user.password_hash.split('$');
                if (md5(password + salt) === storedHash) {
                    const token = jwt.sign(
                        { id: user.id, username: user.username, avatar: user.avatar_url },
                        config.secretKey,
                        { expiresIn: '24h' }
                    );
                    Logger.log('AUTH', `Login success: ${username}`);
                    return { success: true, token, username: user.username, avatar: user.avatar_url };
                }
            }
            Logger.log('AUTH', `Login failed: Invalid credentials for ${username}`);
            throw new Error("Credenciales incorrectas");
        } catch (e) {
            Logger.log('ERROR', `Login server error: ${e.message}`);
            throw e;
        }
    }
}
