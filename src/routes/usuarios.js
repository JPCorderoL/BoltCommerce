// src/routes/usuarios.js
// Administracion de usuarios: listado, asignacion de roles y activacion/desactivacion.

const express = require('express');
const { transaccion, idRol, ROL_ADMIN } = require('../db');
const { requirePermiso } = require('../middleware/auth');
const { registrar } = require('../services/auditoria');
const { idEntero } = require('../utils');

module.exports = function rutasUsuarios(db) {
  const router = express.Router();

  const rolesDe = (usuarioId) =>
    db
      .prepare('SELECT r.id, r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = ? ORDER BY r.nombre')
      .all(usuarioId);

  // Cuantos administradores activos quedan sin contar al usuario indicado.
  const otrosAdminsActivos = (exceptoId) =>
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM usuarios u JOIN usuario_roles ur ON ur.usuario_id = u.id
         WHERE ur.rol_id = ? AND u.activo = 1 AND u.id <> ?`
      )
      .get(idRol(db, ROL_ADMIN), exceptoId).n;

  const buscarUsuario = (req, res) => {
    const id = idEntero(req.params.id);
    const usuario = id && db.prepare('SELECT id, email, activo FROM usuarios WHERE id = ?').get(id);
    if (!usuario) res.status(404).json({ error: 'Usuario no encontrado.' });
    return usuario;
  };

  router.get('/', requirePermiso(db, 'usuarios.ver'), (req, res) => {
    const filas = db
      .prepare('SELECT id, nombre, email, activo, bloqueado_hasta, creado_en, ultimo_acceso FROM usuarios ORDER BY id')
      .all();
    const ahora = Date.now();
    res.json({
      usuarios: filas.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        activo: Boolean(u.activo),
        bloqueado: u.bloqueado_hasta > ahora,
        creado_en: u.creado_en,
        ultimo_acceso: u.ultimo_acceso,
        roles: rolesDe(u.id),
      })),
    });
  });

  router.put('/:id/roles', requirePermiso(db, 'usuarios.gestionar'), (req, res) => {
    const usuario = buscarUsuario(req, res);
    if (!usuario) return;

    const solicitados = Array.isArray(req.body?.roles) ? req.body.roles.map(idEntero) : [];
    if (solicitados.length === 0 || solicitados.includes(null)) {
      return res.status(400).json({ error: 'Debe asignar al menos un rol válido.' });
    }
    const ids = [...new Set(solicitados)];
    const nuevos = db
      .prepare(`SELECT id, nombre FROM roles WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY nombre`)
      .all(...ids);
    if (nuevos.length !== ids.length) return res.status(400).json({ error: 'Uno de los roles no existe.' });

    const anteriores = rolesDe(usuario.id);
    const adminId = idRol(db, ROL_ADMIN);
    const pierdeAdmin = anteriores.some((r) => r.id === adminId) && !ids.includes(adminId);
    if (pierdeAdmin && usuario.id === req.usuario.id) {
      return res.status(409).json({ error: 'No puede quitarse a sí mismo el rol Administrador.' });
    }
    if (pierdeAdmin && otrosAdminsActivos(usuario.id) === 0) {
      return res.status(409).json({ error: 'Debe existir al menos un administrador activo.' });
    }

    transaccion(db, () => {
      db.prepare('DELETE FROM usuario_roles WHERE usuario_id = ?').run(usuario.id);
      const insertar = db.prepare('INSERT INTO usuario_roles (usuario_id, rol_id) VALUES (?, ?)');
      for (const id of ids) insertar.run(usuario.id, id);
    });

    const nombres = (lista) => lista.map((r) => r.nombre).join(', ') || '(ninguno)';
    registrar(db, req, 'ASIGNAR_ROLES', `${usuario.email}: [${nombres(anteriores)}] → [${nombres(nuevos)}]`);
    res.json({ roles: nuevos });
  });

  router.patch('/:id/estado', requirePermiso(db, 'usuarios.gestionar'), (req, res) => {
    const usuario = buscarUsuario(req, res);
    if (!usuario) return;
    if (typeof req.body?.activo !== 'boolean') {
      return res.status(400).json({ error: 'El campo "activo" debe ser true o false.' });
    }

    const activo = req.body.activo;
    if (!activo) {
      if (usuario.id === req.usuario.id) {
        return res.status(409).json({ error: 'No puede desactivar su propia cuenta.' });
      }
      const esAdmin = rolesDe(usuario.id).some((r) => r.nombre === ROL_ADMIN);
      if (esAdmin && otrosAdminsActivos(usuario.id) === 0) {
        return res.status(409).json({ error: 'Debe existir al menos un administrador activo.' });
      }
    }

    transaccion(db, () => {
      if (activo) {
        // Activar tambien sirve para desbloquear una cuenta bloqueada por intentos fallidos.
        db.prepare('UPDATE usuarios SET activo = 1, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?').run(
          usuario.id
        );
      } else {
        db.prepare('UPDATE usuarios SET activo = 0 WHERE id = ?').run(usuario.id);
        db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(usuario.id);
      }
    });

    registrar(db, req, activo ? 'ACTIVAR_USUARIO' : 'DESACTIVAR_USUARIO', usuario.email);
    res.json({ activo });
  });

  return router;
};
