USE syncode_db;

-- =============================================================
-- Credenciales de prueba (formato: salt$MD5(password + salt))
--   marti    → contraseña: hola1234
--   user    → contraseña: user
--   user2    → contraseña: user2
-- =============================================================

-- 1. Usuarios
INSERT INTO users (username, password_hash, avatar_url) VALUES
('marti',  '23c08b2a38a1b208f758a8f628d3005b$8c309a28bcfb82c888252ec06b965cd5', 'https://api.dicebear.com/7.x/avataaars/svg?seed=4'),
('user',   '4ddb292969490c31063a1a6b59504527$465321671f7b401c13941dddac81a4ea', 'https://api.dicebear.com/7.x/avataaars/svg?seed=1'),
('user2',  '9469dff8a2bf6459495e366b3cfc7882$60b0be5ce7df2de9835721f3d6c2641e', 'https://api.dicebear.com/7.x/avataaars/svg?seed=3');

-- 2. Proyectos
INSERT INTO projects (project_name, owner_id) VALUES
('api_rest_v1',        1),
('portfolio_frontend', 2),
('data_processor',     1),
('chat_app',           3);

-- 3. Salas (algunas vinculadas a proyectos)
INSERT INTO rooms (room_name, description, actual_project_id) VALUES
('room_alpha', 'Espacio para desarrollo Backend en Node.js',       1),
('room_beta',  'Diseño de interfaces con React y Tailwind',        2),
('room_gamma', 'Laboratorio de algoritmos y estructuras de datos', NULL);

-- 4. Historial de código
INSERT INTO code_history (project_id, user_id, content_snapshot, version_label) VALUES
(1, 1,
 'import express from "express";\n\nconst app = express();\nconst PORT = 3000;\n\napp.listen(PORT, () => console.log(`Server running on port ${PORT}`));',
 'Initial commit'),

(1, 1,
 'import express from "express";\nimport cors from "cors";\n\nconst app = express();\napp.use(cors());\napp.use(express.json());\n\napp.get("/api/health", (req, res) => res.json({ status: "ok" }));\n\nconst PORT = 3000;\napp.listen(PORT, () => console.log(`Server running on port ${PORT}`));',
 'Added CORS and health endpoint'),

(1, 3,
 'import express from "express";\nimport cors from "cors";\n\nconst app = express();\napp.use(cors());\napp.use(express.json());\n\napp.get("/api/health", (req, res) => res.json({ status: "ok" }));\napp.get("/api/users", (req, res) => res.json([]));\n\nconst PORT = 3000;\napp.listen(PORT, () => console.log(`Server running on port ${PORT}`));',
 'Added users route'),

(2, 2,
 'import React from "react";\n\nexport const App = () => {\n  return <h1>Hello World</h1>;\n};',
 'Project setup'),

(2, 2,
 'import React from "react";\nimport { Navbar } from "./components/Navbar";\n\nexport const App = () => {\n  return (\n    <div>\n      <Navbar />\n      <main><h1>Hello World</h1></main>\n    </div>\n  );\n};',
 'Added Navbar component'),

(3, 1,
 'def process_data(data):\n    return [item.strip().upper() for item in data if item]',
 'Initial implementation'),

(4, 3,
 'const socket = new WebSocket("ws://localhost:3000/room/chat_app");\n\nsocket.onmessage = (event) => {\n  const msg = JSON.parse(event.data);\n  console.log(msg);\n};',
 'WebSocket client draft');
