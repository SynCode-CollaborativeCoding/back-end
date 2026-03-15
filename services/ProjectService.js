import { Logger } from '../utils/logger.js';
import db from '../db.js';

export class ProjectService {
    static async getUserProjects(userId) {
        try {
            const [rows] = await db.execute(
                'SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at DESC',
                [userId]
            );
            return rows;
        } catch (e) {
            Logger.log('ERROR', `Get projects failed: ${e.message}`);
            throw e;
        }
    }

    static async getProjectInfo(projectId) {
        try {
            const [rows] = await db.execute(
                'SELECT id, project_name FROM projects WHERE id = ?',
                [projectId]
            );
            if (rows.length === 0) {
                throw new Error("Project not found");
            }
            return rows[0];
        } catch (e) {
            Logger.log('ERROR', `Project info fetch failed: ${e.message}`);
            throw e;
        }
    }

    static async createProject(projectName, userId) {
        try {
            const [result] = await db.execute(
                'INSERT INTO projects (project_name, owner_id) VALUES (?, ?)',
                [projectName, userId]
            );
            Logger.log('PROJECT', `New project created: ${projectName} (ID: ${result.insertId})`);
            return { id: result.insertId };
        } catch (e) {
            Logger.log('ERROR', `Project creation: ${e.message}`);
            throw e;
        }
    }

    static async deleteProject(projectId, userId) {
        try {
            await db.execute('DELETE FROM projects WHERE id = ? AND owner_id = ?', [projectId, userId]);
            return { success: true, message: "Project and all history deleted" };
        } catch (e) {
            Logger.log('ERROR', `Delete project failed: ${e.message}`);
            throw e;
        }
    }
}
