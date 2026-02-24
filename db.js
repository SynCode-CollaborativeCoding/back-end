import mysql from 'mysql2/promise';
import fs from 'fs/promises';

const db = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'syncode_db'
});

console.log("Conectado a MySQL");

// Importar database.sql si no existen las tabla "users"
const [tables] = await db.query("SHOW TABLES LIKE 'users'");
if (tables.length === 0) {
    console.log("Inicializando base de datos...");
    const sql = await fs.readFile('./database.sql', 'utf-8');
    await db.query(sql);
    console.log("Base de datos inicializada");
} else {
    console.log("Base de datos ya inicializada");
}
export default db;