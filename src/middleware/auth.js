// src/middleware/auth.js
// Autenticacion (sesion por cookie HttpOnly) y autorizacion (permisos por rol).
// Los roles y permisos se leen en cada peticion, asi un cambio del administrador
// tiene efecto inmediato sin que el usuario cierre sesion.

const { hashToken } = require('../security');
const { registrar } = require('../services/auditoria');

const COOKIE_SESION = 'sid';

function leerCookie(req, nombre) {
  const cabecera = req.headers.cookie;
  if (!cabecera) return null;
  for (const parte of cabecera.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nombre) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

function cookieSesion(valor, maxAgeSegundos) {
  const segura = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_SESION}=${valor}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSegundos}${segura}`;
}

function perfilUsuario(db, id) {
  const usuario = db.prepare('SELECT id, nombre, email FROM usuarios WHERE id = ?').get(id);
  if (!usuario) return null;
  const roles = db
    .prepare('SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = ? ORDER BY r.nombre')
    .all(id)
    .map((r) => r.nombre);
  const permisos = db
    .prepare(
      `SELECT DISTINCT p.codigo FROM usuario_roles ur
       JOIN rol_permisos rp ON rp.rol_id = ur.rol_id
       JOIN permisos p ON p.id = rp.permiso_id
       WHERE ur.usuario_id = ?`
    )
    .all(id)
    .map((p) => p.codigo);
  return { id: usuario.id, nombre: usuario.nombre, email: usuario.email, roles, permisos: new Set(permisos) };
}

function cargarSesion(db) {
  const buscar = db.prepare(
    `SELECT s.usuario_id, s.expira_en, u.activo FROM sesiones s
     JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ?`
  );
  const borrar = db.prepare('DELETE FROM sesiones WHERE token_hash = ?');

  return (req, res, next) => {
    const token = leerCookie(req, COOKIE_SESION);
    if (!token) return next();
    const tokenHash = hashToken(token);
    const sesion = buscar.get(tokenHash);
    if (!sesion) return next();
    if (sesion.expira_en <= Date.now() || !sesion.activo) {
      borrar.run(tokenHash);
      return next();
    }
    req.sesion = { tokenHash };
    req.usuario = perfilUsuario(db, sesion.usuario_id);
    next();
  };
}

function requireAuth(req, res, next) {
  if (!req.usuario) return res.status(401).json({ error: 'Debe iniciar sesión.' });
  next();
}

// Permite el acceso si el usuario tiene AL MENOS uno de los permisos indicados.
function requirePermiso(db, ...codigos) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ error: 'Debe iniciar sesión.' });
    if (codigos.some((c) => req.usuario.permisos.has(c))) return next();
    registrar(db, req, 'ACCESO_DENEGADO', `${req.method} ${req.originalUrl} (requiere ${codigos.join(' o ')})`);
    res.status(403).json({ error: `No tiene permiso para esta operación (requiere ${codigos.join(' o ')}).` });
  };
}

module.exports = { COOKIE_SESION, cookieSesion, cargarSesion, perfilUsuario, requireAuth, requirePermiso };
