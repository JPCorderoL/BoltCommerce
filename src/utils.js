// src/utils.js
// Pequenos ayudantes de validacion de entrada.

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

// Devuelve un entero positivo o null.
function idEntero(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

module.exports = { texto, idEntero };
