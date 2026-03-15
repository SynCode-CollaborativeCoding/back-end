import { Logger } from '../utils/logger.js';
import db from '../db.js';

export class RoomService {
    static async getAllRooms() {
        try {
            const [rows] = await db.execute('SELECT * FROM rooms ORDER BY created_at DESC');
            return rows;
        } catch (e) {
            Logger.log('ERROR', `Get rooms failed: ${e.message}`);
            throw e;
        }
    }

    static async createRoom(roomName, description, projectId, username) {
        try {
            await db.execute(
                'INSERT INTO rooms (room_name, description, actual_project_id) VALUES (?, ?, ?)',
                [roomName, description || "No description", projectId || null]
            );
            Logger.log('ROOM', `Created: "${roomName}" by ${username}`);
            return { success: true, message: "Sala creada" };
        } catch (e) {
            Logger.log('ERROR', `Room creation failed: ${e.message}`);
            throw e;
        }
    }

    static async updateRoomProject(roomName, projectId, username) {
        try {
            const [roomData] = await db.execute('SELECT actual_project_id FROM rooms WHERE room_name = ?', [roomName]);
            if (roomData.length === 0) {
                throw new Error("Room not found");
            }

            const [projectData] = await db.execute('SELECT id FROM projects WHERE id = ?', [projectId]);
            if (projectData.length === 0) {
                throw new Error("Proyecto no encontrado");
            }

            await db.execute('UPDATE rooms SET actual_project_id = ? WHERE room_name = ?', [projectId, roomName]);
            Logger.log('ROOM', `Room "${roomName}" linked to project ${projectId} by ${username}`);
            return { success: true, message: "Proyecto vinculado" };
        } catch (e) {
            Logger.log('ERROR', `Room update failed: ${e.message}`);
            throw e;
        }
    }

    static async getRoomContent(roomName, username) {
        try {
            const [rows] = await db.execute(`
                SELECT ch.content_snapshot
                FROM rooms r
                JOIN projects p ON r.actual_project_id = p.id
                LEFT JOIN code_history ch ON p.id = ch.project_id
                WHERE r.room_name = ?
                ORDER BY ch.saved_at DESC
                LIMIT 1`, [roomName]);

            Logger.log('ROOM', `Content requested for room: ${roomName} by ${username}`);
            return rows.length > 0 ? rows[0].content_snapshot : "";
        } catch (e) {
            Logger.log('ERROR', `Room content fetch failed: ${e.message}`);
            throw e;
        }
    }

    static async deleteRoom(roomName) {
        try {
            await db.execute('DELETE FROM rooms WHERE room_name = ?', [roomName]);
            Logger.log('ROOM', `Room "${roomName}" permanently deleted due to inactivity`);
        } catch (e) {
            Logger.log('ERROR', `Failed to delete room "${roomName}": ${e.message}`);
            throw e;
        }
    }
}
