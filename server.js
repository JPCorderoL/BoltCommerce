// server.js
// Punto de entrada. Carga .env (si existe), abre la base de datos y levanta la app.

try {
  process.loadEnvFile();
} catch {
  // Sin .env se usan los valores por defecto.
}

const path = require('path');
const { abrirBaseDatos } = require('./src/db');
const { crearApp } = require('./src/app');

const PORT = process.env.PORT || 3000;

const db = abrirBaseDatos(process.env.DB_PATH || path.join(__dirname, 'data', 'app.db'), {
  adminNombre: process.env.ADMIN_NOMBRE,
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
  demo: process.env.SEED_DEMO !== 'false',
});

crearApp(db).listen(PORT, () => {
  console.log(`BoltCommerce escuchando en http://localhost:${PORT}`);
});
