import { Logger } from '../utils/logger.js';
import db from '../db.js';

export class HistoryService {
    static async getProjectHistory(projectId, userId) {
        try {
            const [projectData] = await db.execute('SELECT owner_id FROM projects WHERE id = ?', [projectId]);
            if (projectData.length === 0 || projectData[0].owner_id !== userId) {
                throw new Error("No tienes permiso");
            }

            const [history] = await db.execute(`
                SELECT ch.id, ch.user_id, ch.content_snapshot, ch.version_label, ch.saved_at, u.username
                FROM code_history ch
                JOIN users u ON ch.user_id = u.id
                WHERE ch.project_id = ?
                ORDER BY ch.saved_at DESC`,
                [projectId]
            );

            Logger.log('HISTORY', `History fetched for project ${projectId}`);
            return history;
        } catch (e) {
            Logger.log('ERROR', `History fetch failed: ${e.message}`);
            throw e;
        }
    }

    static async getHistoryVersion(projectId, historyId, userId) {
        try {
            const [projectData] = await db.execute('SELECT owner_id FROM projects WHERE id = ?', [projectId]);
            if (projectData.length === 0 || projectData[0].owner_id !== userId) {
                throw new Error("No tienes permiso");
            }

            const [versionData] = await db.execute(`
                SELECT id, user_id, content_snapshot, version_label, saved_at
                FROM code_history
                WHERE id = ? AND project_id = ?`,
                [historyId, projectId]
            );

            if (versionData.length === 0) {
                throw new Error("Versión no encontrada");
            }

            Logger.log('HISTORY', `Version ${historyId} fetched`);
            return versionData[0];
        } catch (e) {
            Logger.log('ERROR', `Version fetch failed: ${e.message}`);
            throw e;
        }
    }

    static async saveContent(roomName, content, versionLabel, userId, username) {
        try {
            const [roomData] = await db.execute('SELECT actual_project_id FROM rooms WHERE room_name = ?', [roomName]);
            if (roomData.length === 0 || !roomData[0].actual_project_id) {
                throw new Error("No vinculado");
            }

            const projectId = roomData[0].actual_project_id;

            const [projectData] = await db.execute('SELECT id FROM projects WHERE id = ?', [projectId]);
            if (projectData.length === 0) {
                throw new Error("Proyecto no encontrado");
            }

            await db.execute(
                'INSERT INTO code_history (project_id, user_id, content_snapshot, version_label) VALUES (?, ?, ?, ?)',
                [projectId, userId, content, versionLabel || null]
            );

            await db.execute('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [projectId]);

            Logger.log('PROJECT', `Saved content for room "${roomName}" by ${username}`);
            return { success: true, message: "Guardado" };
        } catch (e) {
            Logger.log('ERROR', `Save failed: ${e.message}`);
            throw e;
        }
    }

    static async restoreVersion(projectId, historyId, userId, username) {
        try {
            const [projectData] = await db.execute('SELECT owner_id FROM projects WHERE id = ?', [projectId]);
            if (projectData.length === 0 || projectData[0].owner_id !== userId) {
                throw new Error("No tienes permiso");
            }

            const [versionData] = await db.execute(
                'SELECT content_snapshot FROM code_history WHERE id = ? AND project_id = ?',
                [historyId, projectId]
            );

            if (versionData.length === 0) {
                throw new Error("Versión no encontrada");
            }

            await db.execute(
                'INSERT INTO code_history (project_id, user_id, content_snapshot, version_label) VALUES (?, ?, ?, ?)',
                [projectId, userId, versionData[0].content_snapshot, `Restored from version ${historyId}`]
            );

            await db.execute('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [projectId]);

            Logger.log('HISTORY', `Version ${historyId} restored for project ${projectId} by ${username}`);
            return { success: true, message: "Versión restaurada" };
        } catch (e) {
            Logger.log('ERROR', `Restore failed: ${e.message}`);
            throw e;
        }
    }

    static async deleteVersion(projectId, historyId, userId, username) {
        try {
            const [projectData] = await db.execute('SELECT owner_id FROM projects WHERE id = ?', [projectId]);
            if (projectData.length === 0 || projectData[0].owner_id !== userId) {
                throw new Error("No tienes permiso");
            }

            const [result] = await db.execute(
                'DELETE FROM code_history WHERE id = ? AND project_id = ?',
                [historyId, projectId]
            );

            if (result.affectedRows === 0) {
                throw new Error("Versión no encontrada");
            }

            Logger.log('HISTORY', `Version ${historyId} deleted from project ${projectId} by ${username}`);
            return { success: true, message: "Versión eliminada" };
        } catch (e) {
            Logger.log('ERROR', `Delete failed: ${e.message}`);
            throw e;
        }
    }
}
