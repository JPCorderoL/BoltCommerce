// src/routes/roles.js
// Roles y matriz de permisos: crear roles, editar sus permisos y eliminar roles personalizados.

const express = require('express');
const { transaccion, asignarPermisos, ROL_ADMIN } = require('../db');
const { requirePermiso } = require('../middleware/auth');
const { registrar } = require('../services/auditoria');
const { texto, idEntero } = require('../utils');

module.exports = function rutasRoles(db) {
  const router = express.Router();

  const permisosDe = (rolId) =>
    db
      .prepare('SELECT p.codigo FROM rol_permisos rp JOIN permisos p ON p.id = rp.permiso_id WHERE rp.rol_id = ? ORDER BY p.codigo')
      .all(rolId)
      .map((p) => p.codigo);

  // Devuelve la lista de codigos validada, o null si alguno no existe.
  const validarCodigos = (lista) => {
    if (!Array.isArray(lista)) return null;
    const codigos = [...new Set(lista)];
    const existentes = new Set(db.prepare('SELECT codigo FROM permisos').all().map((p) => p.codigo));
    return codigos.every((c) => existentes.has(c)) ? codigos : null;
  };

  const buscarRol = (req, res) => {
    const id = idEntero(req.params.id);
    const rol = id && db.prepare('SELECT id, nombre, es_sistema FROM roles WHERE id = ?').get(id);
    if (!rol) res.status(404).json({ error: 'Rol no encontrado.' });
    return rol;
  };

  // Lo necesitan tanto quien gestiona roles como quien asigna roles a usuarios.
  router.get('/', requirePermiso(db, 'roles.gestionar', 'usuarios.ver'), (req, res) => {
    const roles = db
      .prepare(
        `SELECT r.id, r.nombre, r.descripcion, r.es_sistema,
                (SELECT COUNT(*) FROM usuario_roles ur WHERE ur.rol_id = r.id) AS usuarios
         FROM roles r ORDER BY r.id`
      )
      .all()
      .map((r) => ({ ...r, es_sistema: Boolean(r.es_sistema), permisos: permisosDe(r.id) }));
    const permisos = db.prepare('SELECT codigo, modulo, descripcion FROM permisos ORDER BY id').all();
    res.json({ roles, permisos });
  });

  router.post('/', requirePermiso(db, 'roles.gestionar'), (req, res) => {
    const nombre = texto(req.body?.nombre);
    const descripcion = texto(req.body?.descripcion).slice(0, 200);
    if (nombre.length < 3 || nombre.length > 40) {
      return res.status(400).json({ error: 'El nombre del rol debe tener entre 3 y 40 caracteres.' });
    }
    const codigos = validarCodigos(req.body?.permisos ?? []);
    if (!codigos) return res.status(400).json({ error: 'La lista de permisos contiene códigos inválidos.' });
    if (db.prepare('SELECT 1 FROM roles WHERE nombre = ?').get(nombre)) {
      return res.status(409).json({ error: 'Ya existe un rol con ese nombre.' });
    }

    const id = transaccion(db, () => {
      const { lastInsertRowid } = db.prepare('INSERT INTO roles (nombre, descripcion) VALUES (?, ?)').run(nombre, descripcion);
      asignarPermisos(db, lastInsertRowid, codigos);
      return Number(lastInsertRowid);
    });
    registrar(db, req, 'CREAR_ROL', `${nombre} con permisos [${codigos.join(', ')}]`);
    res.status(201).json({ rol: { id, nombre, descripcion, es_sistema: false, usuarios: 0, permisos: codigos } });
  });

  router.put('/:id/permisos', requirePermiso(db, 'roles.gestionar'), (req, res) => {
    const rol = buscarRol(req, res);
    if (!rol) return;
    if (rol.nombre === ROL_ADMIN) {
      return res.status(409).json({ error: 'El rol Administrador siempre conserva todos los permisos.' });
    }
    const codigos = validarCodigos(req.body?.permisos);
    if (!codigos) return res.status(400).json({ error: 'La lista de permisos contiene códigos inválidos.' });

    const anteriores = permisosDe(rol.id);
    transaccion(db, () => {
      db.prepare('DELETE FROM rol_permisos WHERE rol_id = ?').run(rol.id);
      asignarPermisos(db, rol.id, codigos);
    });

    const agregados = codigos.filter((c) => !anteriores.includes(c));
    const quitados = anteriores.filter((c) => !codigos.includes(c));
    registrar(
      db,
      req,
      'ACTUALIZAR_PERMISOS',
      `${rol.nombre}: +[${agregados.join(', ')}] -[${quitados.join(', ')}]`
    );
    res.json({ permisos: permisosDe(rol.id) });
  });

  router.delete('/:id', requirePermiso(db, 'roles.gestionar'), (req, res) => {
    const rol = buscarRol(req, res);
    if (!rol) return;
    if (rol.es_sistema) return res.status(409).json({ error: 'Los roles base del sistema no se pueden eliminar.' });
    const enUso = db.prepare('SELECT COUNT(*) AS n FROM usuario_roles WHERE rol_id = ?').get(rol.id).n;
    if (enUso > 0) {
      return res.status(409).json({ error: `El rol está asignado a ${enUso} usuario(s). Reasígnelos antes de eliminarlo.` });
    }
    db.prepare('DELETE FROM roles WHERE id = ?').run(rol.id);
    registrar(db, req, 'ELIMINAR_ROL', rol.nombre);
    res.json({ ok: true });
  });

  return router;
};
