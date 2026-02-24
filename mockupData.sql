USE syncode_db;

-- 1. Insertar Usuarios
INSERT INTO users (username, password_hash, avatar_url) VALUES
('marti', 'ccee5504c9d889922b101124e9e43b71', 'https://api.dicebear.com/7.x/avataaars/svg?seed=4'),
('user1', 'hash_pass_1', 'https://api.dicebear.com/7.x/avataaars/svg?seed=1'),
('user2', 'hash_pass_2', 'https://api.dicebear.com/7.x/avataaars/svg?seed=2'),
('user3', 'hash_pass_3', 'https://api.dicebear.com/7.x/avataaars/svg?seed=3');

-- 2. Insertar Salas (Rooms)
INSERT INTO rooms (room_name, description) VALUES
('room_alpha', 'Espacio para desarrollo Backend en Node.js'),
('room_beta', 'Diseño de interfaces con React y Tailwind'),
('room_gamma', 'Laboratorio de algoritmos y estructuras de datos');

-- 3. Insertar Proyectos
INSERT INTO projects (project_name, owner_id, last_content) VALUES
('api_rest_v1', 1, 'const express = require("express");\nconst app = express();'),
('portfolio_frontend', 2, 'import React from "react";\nexport const App = () => <h1>Hello</h1>;'),
('data_processor', 1, 'def process_data(data):\n    return [d.upper() for d in data]');

-- 4. Historial de Código (Snapshots)
INSERT INTO code_history (project_id, user_id, content_snapshot, version_label) VALUES
(1, 1, 'const express = require("express");', 'Initial commit'),
(1, 3, 'const express = require("express");\nconst app = express();', 'Added express instance'),
(2, 2, 'import React from "react";', 'Setup project');

-- 5. Mensajes de Chat
INSERT INTO messages (room_id, user_id, content) VALUES
(1, 1, 'Hola user3, ¿puedes revisar el endpoint de login?'),
(1, 3, 'Claro user1, lo miro en un momento.'),
(2, 2, 'He actualizado el componente del Header.');