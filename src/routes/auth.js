// src/routes/auth.js
// Registro, inicio de sesion, cierre de sesion y consulta de la sesion actual.

const express = require('express');
const { verificarPassword, validarPassword, nuevoToken, hashToken, HASH_FICTICIO } = require('../security');
const { transaccion, crearUsuario, ROL_POR_DEFECTO } = require('../db');
const { cookieSesion, perfilUsuario, requireAuth } = require('../middleware/auth');
const { registrar } = require('../services/auditoria');
const { texto } = require('../utils');

const MAX_INTENTOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;
const DURACION_SESION_MS = 8 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function perfilJson(perfil) {
  return { ...perfil, permisos: [...perfil.permisos].sort() };
}

module.exports = function rutasAuth(db) {
  const router = express.Router();

  router.post('/registro', (req, res) => {
    const nombre = texto(req.body?.nombre);
    const email = texto(req.body?.email).toLowerCase();
    const password = req.body?.password;

    if (nombre.length < 3 || nombre.length > 80) {
      return res.status(400).json({ error: 'El nombre debe tener entre 3 y 80 caracteres.' });
    }
    if (!EMAIL_RE.test(email) || email.length > 120) {
      return res.status(400).json({ error: 'El correo electrónico no es válido.' });
    }
    const errorPassword = validarPassword(password);
    if (errorPassword) return res.status(400).json({ error: errorPassword });
    if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email)) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    }

    // Toda cuenta nueva recibe el rol de menor privilegio; solo un administrador puede elevarla.
    const id = transaccion(db, () => crearUsuario(db, nombre, email, password, [ROL_POR_DEFECTO]));
    registrar(db, req, 'REGISTRO', `Nueva cuenta con rol ${ROL_POR_DEFECTO}`, { id, email });
    res.status(201).json({ usuario: { id, nombre, email, roles: [ROL_POR_DEFECTO] } });
  });

  router.post('/login', (req, res) => {
    const email = texto(req.body?.email).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const usuario = db
      .prepare('SELECT id, email, password_hash, activo, intentos_fallidos, bloqueado_hasta FROM usuarios WHERE email = ?')
      .get(email);

    if (usuario?.bloqueado_hasta > Date.now()) {
      const minutos = Math.ceil((usuario.bloqueado_hasta - Date.now()) / 60000);
      registrar(db, req, 'LOGIN_BLOQUEADO', 'Intento de acceso con la cuenta bloqueada', usuario);
      return res
        .status(423)
        .json({ error: `Cuenta bloqueada por intentos fallidos. Intente de nuevo en ${minutos} min.` });
    }

    // Si el correo no existe se verifica contra un hash ficticio para no delatarlo por el tiempo de respuesta.
    const valida = verificarPassword(password, usuario?.password_hash ?? HASH_FICTICIO) && Boolean(usuario);

    if (!valida) {
      if (usuario) {
        const intentos = usuario.intentos_fallidos + 1;
        if (intentos >= MAX_INTENTOS) {
          db.prepare('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = ? WHERE id = ?').run(
            Date.now() + BLOQUEO_MS,
            usuario.id
          );
          registrar(db, req, 'CUENTA_BLOQUEADA', `${MAX_INTENTOS} intentos fallidos consecutivos`, usuario);
        } else {
          db.prepare('UPDATE usuarios SET intentos_fallidos = ? WHERE id = ?').run(intentos, usuario.id);
        }
      }
      registrar(db, req, 'LOGIN_FALLIDO', 'Credenciales incorrectas', usuario ?? { id: null, email });
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    if (!usuario.activo) {
      registrar(db, req, 'LOGIN_FALLIDO', 'Cuenta desactivada', usuario);
      return res.status(403).json({ error: 'La cuenta está desactivada. Contacte al administrador.' });
    }

    db.prepare(
      'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = ? WHERE id = ?'
    ).run(new Date().toISOString(), usuario.id);
    db.prepare('DELETE FROM sesiones WHERE expira_en <= ?').run(Date.now());

    const token = nuevoToken();
    db.prepare('INSERT INTO sesiones (token_hash, usuario_id, expira_en, ip) VALUES (?, ?, ?, ?)').run(
      hashToken(token),
      usuario.id,
      Date.now() + DURACION_SESION_MS,
      req.ip ?? null
    );
    res.setHeader('Set-Cookie', cookieSesion(token, DURACION_SESION_MS / 1000));
    registrar(db, req, 'LOGIN', 'Inicio de sesión correcto', usuario);
    res.json({ usuario: perfilJson(perfilUsuario(db, usuario.id)) });
  });

  router.post('/logout', (req, res) => {
    if (req.sesion) db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(req.sesion.tokenHash);
    if (req.usuario) registrar(db, req, 'LOGOUT', 'Cierre de sesión');
    res.setHeader('Set-Cookie', cookieSesion('', 0));
    res.json({ ok: true });
  });

  router.get('/sesion', requireAuth, (req, res) => {
    res.json({ usuario: perfilJson(req.usuario) });
  });

  return router;
};
