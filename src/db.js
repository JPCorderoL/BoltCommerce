// src/db.js
// Base de datos SQLite usando el modulo nativo node:sqlite (no requiere compilar nada).
// Crea el esquema, el catalogo de permisos, los roles base y, opcionalmente,
// usuarios y datos de demostracion.

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./security');

const ROL_ADMIN = 'Administrador';
const ROL_POR_DEFECTO = 'Cliente';

// Catalogo de permisos: [codigo, modulo, descripcion]
const PERMISOS = [
  ['propiedades.ver', 'Propiedades', 'Consultar el catálogo de propiedades'],
  ['propiedades.gestionar', 'Propiedades', 'Publicar y eliminar propiedades'],
  ['disenos.ver', 'Diseño arquitectónico', 'Consultar proyectos de diseño'],
  ['disenos.gestionar', 'Diseño arquitectónico', 'Crear y eliminar proyectos de diseño'],
  ['usuarios.ver', 'Administración', 'Consultar usuarios registrados'],
  ['usuarios.gestionar', 'Administración', 'Asignar roles y activar/desactivar usuarios'],
  ['roles.gestionar', 'Administración', 'Crear roles y editar sus permisos'],
  ['auditoria.ver', 'Administración', 'Consultar la bitácora de auditoría'],
];

// Roles base del sistema. El administrador siempre conserva todos los permisos.
const ROLES_BASE = [
  {
    nombre: ROL_ADMIN,
    descripcion: 'Administra usuarios, roles, permisos y auditoría.',
    permisos: PERMISOS.map((p) => p[0]),
  },
  {
    nombre: 'Agente Inmobiliario',
    descripcion: 'Publica y gestiona propiedades en venta o alquiler.',
    permisos: ['propiedades.ver', 'propiedades.gestionar', 'disenos.ver'],
  },
  {
    nombre: 'Arquitecto',
    descripcion: 'Gestiona los proyectos de diseño arquitectónico.',
    permisos: ['disenos.ver', 'disenos.gestionar', 'propiedades.ver'],
  },
  {
    nombre: ROL_POR_DEFECTO,
    descripcion: 'Consulta el catálogo de propiedades y diseños.',
    permisos: ['propiedades.ver', 'disenos.ver'],
  },
];

const AHORA_ISO = "(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))";

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre            TEXT NOT NULL,
  email             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash     TEXT NOT NULL,
  activo            INTEGER NOT NULL DEFAULT 1,
  intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta   INTEGER,
  creado_en         TEXT NOT NULL DEFAULT ${AHORA_ISO},
  ultimo_acceso     TEXT
);

CREATE TABLE IF NOT EXISTS roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  descripcion TEXT NOT NULL DEFAULT '',
  es_sistema  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS permisos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo      TEXT NOT NULL UNIQUE,
  modulo      TEXT NOT NULL,
  descripcion TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rol_permisos (
  rol_id     INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permiso_id INTEGER NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
  PRIMARY KEY (rol_id, permiso_id)
);

CREATE TABLE IF NOT EXISTS usuario_roles (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rol_id     INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, rol_id)
);

CREATE TABLE IF NOT EXISTS sesiones (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_en  INTEGER NOT NULL,
  ip         TEXT,
  creada_en  TEXT NOT NULL DEFAULT ${AHORA_ISO}
);

CREATE TABLE IF NOT EXISTS auditoria (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  email      TEXT,
  accion     TEXT NOT NULL,
  detalle    TEXT NOT NULL DEFAULT '',
  ip         TEXT,
  fecha      TEXT NOT NULL DEFAULT ${AHORA_ISO}
);

CREATE TABLE IF NOT EXISTS propiedades (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo     TEXT NOT NULL,
  tipo       TEXT NOT NULL,
  ubicacion  TEXT NOT NULL,
  precio     REAL NOT NULL,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en  TEXT NOT NULL DEFAULT ${AHORA_ISO}
);

CREATE TABLE IF NOT EXISTS disenos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre     TEXT NOT NULL,
  estilo     TEXT NOT NULL,
  area_m2    REAL NOT NULL,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en  TEXT NOT NULL DEFAULT ${AHORA_ISO}
);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(fecha);
`;

function abrirBaseDatos(ruta, opciones = {}) {
  if (ruta !== ':memory:') fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(ESQUEMA);
  sembrar(db, opciones);
  return db;
}

function transaccion(db, fn) {
  db.exec('BEGIN');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function idRol(db, nombre) {
  return db.prepare('SELECT id FROM roles WHERE nombre = ?').get(nombre)?.id;
}

function asignarPermisos(db, rolId, codigos) {
  const insertar = db.prepare(
    'INSERT OR IGNORE INTO rol_permisos (rol_id, permiso_id) SELECT ?, id FROM permisos WHERE codigo = ?'
  );
  for (const codigo of codigos) insertar.run(rolId, codigo);
}

// No abre transaccion propia: quien llama decide.
function crearUsuario(db, nombre, email, password, nombresRoles) {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO usuarios (nombre, email, password_hash) VALUES (?, ?, ?)')
    .run(nombre, email.toLowerCase(), hashPassword(password));
  const asignar = db.prepare('INSERT INTO usuario_roles (usuario_id, rol_id) VALUES (?, ?)');
  for (const rol of nombresRoles) asignar.run(lastInsertRowid, idRol(db, rol));
  return Number(lastInsertRowid);
}

function sembrar(db, opciones) {
  const {
    adminNombre = 'Administrador General',
    adminEmail = 'admin@inmo.local',
    adminPassword = 'Admin1234',
    demo = true,
  } = Object.fromEntries(Object.entries(opciones).filter(([, v]) => v !== undefined));

  const insertarPermiso = db.prepare('INSERT OR IGNORE INTO permisos (codigo, modulo, descripcion) VALUES (?, ?, ?)');
  for (const permiso of PERMISOS) insertarPermiso.run(...permiso);

  // Los roles base se crean una sola vez; despues el administrador puede ajustarlos.
  if (db.prepare('SELECT COUNT(*) AS n FROM roles').get().n === 0) {
    transaccion(db, () => {
      const insertarRol = db.prepare('INSERT INTO roles (nombre, descripcion, es_sistema) VALUES (?, ?, 1)');
      for (const rol of ROLES_BASE) {
        const { lastInsertRowid } = insertarRol.run(rol.nombre, rol.descripcion);
        asignarPermisos(db, lastInsertRowid, rol.permisos);
      }
    });
  }

  // Si se agregan permisos nuevos al catalogo, el administrador los recibe automaticamente.
  db.prepare('INSERT OR IGNORE INTO rol_permisos (rol_id, permiso_id) SELECT ?, id FROM permisos').run(
    idRol(db, ROL_ADMIN)
  );

  if (db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n > 0) return;

  transaccion(db, () => {
    crearUsuario(db, adminNombre, adminEmail, adminPassword, [ROL_ADMIN]);
    if (!demo) return;

    const agente = crearUsuario(db, 'Ana Agente', 'agente@inmo.local', 'Demo1234', ['Agente Inmobiliario']);
    const arquitecto = crearUsuario(db, 'Luis Arquitecto', 'arquitecto@inmo.local', 'Demo1234', ['Arquitecto']);
    crearUsuario(db, 'Carla Cliente', 'cliente@inmo.local', 'Demo1234', [ROL_POR_DEFECTO]);

    const propiedad = db.prepare(
      'INSERT INTO propiedades (titulo, tipo, ubicacion, precio, creado_por) VALUES (?, ?, ?, ?, ?)'
    );
    propiedad.run('Apartamento con vista al mar', 'Apartamento', 'Santo Domingo, Malecón', 185000, agente);
    propiedad.run('Casa familiar 3 habitaciones', 'Casa', 'Santiago, Los Jardines', 230000, agente);
    propiedad.run('Solar residencial 600 m²', 'Solar', 'Punta Cana, Bávaro', 95000, agente);

    const diseno = db.prepare('INSERT INTO disenos (nombre, estilo, area_m2, creado_por) VALUES (?, ?, ?, ?)');
    diseno.run('Villa Tropical', 'Contemporáneo', 320, arquitecto);
    diseno.run('Casa Patio', 'Colonial moderno', 180, arquitecto);
  });
}

module.exports = {
  abrirBaseDatos,
  transaccion,
  idRol,
  asignarPermisos,
  crearUsuario,
  ROL_ADMIN,
  ROL_POR_DEFECTO,
  PERMISOS,
};
