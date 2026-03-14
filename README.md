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