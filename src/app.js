// src/app.js
// Construye la app Express. Recibe la base de datos para poder usar una
// base temporal en las pruebas automatizadas.

const path = require('path');
const express = require('express');
const { cargarSesion } = require('./middleware/auth');
const crearCatalogo = require('./routes/catalogo');

function cabecerasSeguridad(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'");
  next();
}

function crearApp(db) {
  const app = express();
  app.disable('x-powered-by');

  app.use(cabecerasSeguridad);
  app.use(express.json({ limit: '50kb' }));
  app.use(cargarSesion(db));

  app.use('/api/auth', require('./routes/auth')(db));
  app.use('/api/usuarios', require('./routes/usuarios')(db));
  app.use('/api/roles', require('./routes/roles')(db));
  app.use('/api/auditoria', require('./routes/auditoria')(db));
  app.use(
    '/api/propiedades',
    crearCatalogo(db, {
      tabla: 'propiedades',
      entidad: 'PROPIEDAD',
      permisoVer: 'propiedades.ver',
      permisoGestionar: 'propiedades.gestionar',
      campos: [
        { nombre: 'titulo', tipo: 'texto', etiqueta: 'El título' },
        { nombre: 'tipo', tipo: 'texto', etiqueta: 'El tipo' },
        { nombre: 'ubicacion', tipo: 'texto', etiqueta: 'La ubicación' },
        { nombre: 'precio', tipo: 'numero', etiqueta: 'El precio' },
      ],
    })
  );
  app.use(
    '/api/disenos',
    crearCatalogo(db, {
      tabla: 'disenos',
      entidad: 'DISENO',
      permisoVer: 'disenos.ver',
      permisoGestionar: 'disenos.gestionar',
      campos: [
        { nombre: 'nombre', tipo: 'texto', etiqueta: 'El nombre' },
        { nombre: 'estilo', tipo: 'texto', etiqueta: 'El estilo' },
        { nombre: 'area_m2', tipo: 'numero', etiqueta: 'El área' },
      ],
    })
  );
  app.use('/api', (req, res) => res.status(404).json({ error: 'Recurso no encontrado.' }));

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
    console.error('[app] Error no controlado:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });

  return app;
}

module.exports = { crearApp };
