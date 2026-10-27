// src/services/auditoria.js
// Bitacora de auditoria: toda operacion relevante de seguridad queda registrada
// con usuario, accion, detalle, IP y fecha (trazabilidad).

function registrar(db, req, accion, detalle = '', usuario = req.usuario) {
  db.prepare('INSERT INTO auditoria (usuario_id, email, accion, detalle, ip) VALUES (?, ?, ?, ?, ?)').run(
    usuario?.id ?? null,
    usuario?.email ?? null,
    accion,
    detalle,
    req.ip ?? null
  );
}

module.exports = { registrar };
