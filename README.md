# SynCode - Backend

Este repositorio contiene la lógica del servidor y la gestión de base de datos para SynCode. A continuación, se detallan los pasos necesarios para instalar y ejecutar el proyecto localmente.

## Requisitos Previos

- **Node.js**
- **MySQL**
- **NPM** (incluido con Node.js)

## Instalación

Clona el repositorio e instala las dependencias:

```bash
npm install
```

## Configuración de Variables de Entorno

Crea un archivo llamado `.env` en la raíz del proyecto y configura las siguientes variables:

```env
SECRET_KEY=una_clave_secreta_aqui
DB_USER=el_usuario_de_mysql
DB_PASSWORD=la_contraseña_de_mysql
```

## Configuración de la Base de Datos

Para inicializar la base de datos con la estructura y datos de prueba necesarios, sigue estos pasos en tu cliente SQL:

1. **Esquema:** Ejecuta el contenido de `database.sql` para crear la base de datos, las tablas y relaciones.
2. **Datos Mock:** Ejecuta el contenido de `mockupData.sql` para cargar los datos de prueba iniciales.

## Ejecución

Para iniciar el servidor, utiliza el siguiente comando:

```bash
node server.js
```

El servidor debería estar corriendo ahora, listo para recibir peticiones.

## Despliegue en Producción

Puedes acceder a la versión desplegada del programa en la siguiente dirección de Azure:

[http://4.232.137.224](http://4.232.137.224)

## Módulos

### Raíz

- **`server.js`** — Punto de entrada de la aplicación. Inicializa Express, registra los middlewares globales (CORS, body-parser, logger), monta las rutas bajo `/api/` y expone el endpoint WebSocket en `/room/:id`.
- **`config.js`** — Configuración centralizada: puerto del servidor, clave secreta JWT y tiempo de espera antes de eliminar una sala vacía.
- **`db.js`** — Gestiona la conexión a la base de datos MySQL. Al arrancar, inicializa el esquema automáticamente si no existe.

### `routes/` — Rutas HTTP

- **`auth.js`** — Endpoints públicos de autenticación: registro (`POST /auth/register`) e inicio de sesión (`POST /auth/login`).
- **`rooms.js`** — Gestión de salas de colaboración: listar, crear, vincular a un proyecto y obtener el último contenido de código.
- **`projects.js`** — CRUD de proyectos del usuario autenticado y guardado manual del código actual como nueva versión.
- **`history.js`** — Gestión del historial de versiones de un proyecto: listar, consultar, restaurar y eliminar snapshots.

### `services/` — Lógica de negocio

- **`AuthService.js`** — Registro y login de usuarios. El password se almacena como `MD5(password + salt)` y el login devuelve un JWT con 24 h de validez.
- **`ProjectService.js`** — Operaciones de base de datos para proyectos: listar, obtener info, crear y eliminar (verificando que el usuario sea el propietario).
- **`RoomService.js`** — Operaciones de base de datos para salas: listar, crear, vincular proyecto, obtener último snapshot de código y eliminar.
- **`HistoryService.js`** — Operaciones de base de datos para el historial de código: guardar snapshots, restaurar versiones anteriores y eliminar entradas.
- **`WebSocketService.js`** — Motor de colaboración en tiempo real. Gestiona el estado en memoria de las salas, sincroniza el código entre usuarios conectados, reenvía señales WebRTC y programa la eliminación automática de salas vacías.

### `middleware/`

- **`auth.js`** — Guard de autenticación JWT. Extrae el token Bearer, lo verifica y adjunta el usuario decodificado a `req.user`. Todas las rutas protegidas lo utilizan.
- **`http.js`** — Logger de peticiones HTTP. Registra el método y la ruta de cada solicitud entrante.

### `utils/`

- **`logger.js`** — Clase `Logger` con un método `log(category, message)` que imprime mensajes con marca de tiempo en formato `[HH:MM:SS] [CATEGORY] message`.