// src/security.js
// Hash de contrasenas (scrypt con sal aleatoria), tokens de sesion y politica de contrasenas.

const crypto = require('crypto');

const LONGITUD_HASH = 64;

function hashPassword(password) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, sal, LONGITUD_HASH);
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

function verificarPassword(password, almacenado) {
  const [algoritmo, salHex, hashHex] = String(almacenado).split('$');
  if (algoritmo !== 'scrypt' || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const calculado = crypto.scryptSync(String(password), Buffer.from(salHex, 'hex'), esperado.length);
  return crypto.timingSafeEqual(esperado, calculado);
}

// Se usa cuando el correo no existe, para que el tiempo de respuesta no delate si la cuenta existe.
const HASH_FICTICIO = hashPassword(crypto.randomBytes(16).toString('hex'));

// Devuelve un mensaje de error o null si la contrasena cumple la politica.
function validarPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 100) {
    return 'La contraseña debe tener entre 8 y 100 caracteres.';
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'La contraseña debe contener al menos una letra y un número.';
  }
  return null;
}

function nuevoToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// En la base solo se guarda el hash del token: si la tabla se filtra, las sesiones no se pueden reutilizar.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { hashPassword, verificarPassword, validarPassword, nuevoToken, hashToken, HASH_FICTICIO };
