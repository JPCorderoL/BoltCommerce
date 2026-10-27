// src/routes/auditoria.js
// Consulta de la bitacora de auditoria (solo lectura).

const express = require('express');
const { requirePermiso } = require('../middleware/auth');

module.exports = function rutasAuditoria(db) {
  const router = express.Router();

  router.get('/', requirePermiso(db, 'auditoria.ver'), (req, res) => {
    const limite = Math.min(Math.max(Number.parseInt(req.query.limite, 10) || 200, 1), 1000);
    const registros = db
      .prepare(
        `SELECT a.id, a.fecha, a.usuario_id, a.email, u.nombre, a.accion, a.detalle, a.ip
         FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
         ORDER BY a.id DESC LIMIT ?`
      )
      .all(limite);
    res.json({ registros });
  });

  return router;
};
