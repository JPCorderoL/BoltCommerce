// src/routes/catalogo.js
// CRUD minimo para los modulos de negocio (propiedades y disenos). Existen para
// demostrar la restriccion de funcionalidades segun el perfil del usuario.

const express = require('express');
const { requirePermiso } = require('../middleware/auth');
const { registrar } = require('../services/auditoria');
const { texto, idEntero } = require('../utils');

// config: { tabla, entidad, permisoVer, permisoGestionar, campos: [{ nombre, tipo: 'texto'|'numero', etiqueta }] }
module.exports = function crearCatalogo(db, config) {
  const { tabla, entidad, permisoVer, permisoGestionar, campos } = config;
  const router = express.Router();

  router.get('/', requirePermiso(db, permisoVer), (req, res) => {
    const elementos = db
      .prepare(`SELECT t.*, u.nombre AS autor FROM ${tabla} t LEFT JOIN usuarios u ON u.id = t.creado_por ORDER BY t.id DESC`)
      .all();
    res.json({ elementos });
  });

  router.post('/', requirePermiso(db, permisoGestionar), (req, res) => {
    const valores = [];
    for (const campo of campos) {
      const crudo = req.body?.[campo.nombre];
      if (campo.tipo === 'numero') {
        const n = Number(crudo);
        if (crudo === '' || crudo == null || !Number.isFinite(n) || n <= 0) {
          return res.status(400).json({ error: `${campo.etiqueta} debe ser un número mayor que cero.` });
        }
        valores.push(n);
      } else {
        const t = texto(crudo);
        if (t.length < 2 || t.length > 120) {
          return res.status(400).json({ error: `${campo.etiqueta} debe tener entre 2 y 120 caracteres.` });
        }
        valores.push(t);
      }
    }

    const columnas = campos.map((c) => c.nombre);
    const { lastInsertRowid } = db
      .prepare(`INSERT INTO ${tabla} (${columnas.join(', ')}, creado_por) VALUES (${columnas.map(() => '?').join(', ')}, ?)`)
      .run(...valores, req.usuario.id);
    registrar(db, req, `CREAR_${entidad}`, `#${lastInsertRowid} ${valores[0]}`);
    res.status(201).json({ id: Number(lastInsertRowid) });
  });

  router.delete('/:id', requirePermiso(db, permisoGestionar), (req, res) => {
    const id = idEntero(req.params.id);
    const fila = id && db.prepare(`SELECT id FROM ${tabla} WHERE id = ?`).get(id);
    if (!fila) return res.status(404).json({ error: 'Registro no encontrado.' });
    db.prepare(`DELETE FROM ${tabla} WHERE id = ?`).run(id);
    registrar(db, req, `ELIMINAR_${entidad}`, `#${id}`);
    res.json({ ok: true });
  });

  return router;
};
