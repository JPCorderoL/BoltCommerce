// test/acceso.test.js
// Pruebas de aceptacion de la Epica 1 contra la API real (base SQLite temporal).
// Cada prueba indica el caso (CP-xx) y la historia de usuario (HU-xx) que valida.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { once } = require('events');
const { abrirBaseDatos } = require('../src/db');
const { crearApp } = require('../src/app');

let servidor;
let base;
let db;
let carpeta;

before(async () => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'inmo-test-'));
  db = abrirBaseDatos(path.join(carpeta, 'test.db'), { demo: true });
  servidor = crearApp(db).listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => {
  servidor.closeAllConnections();
  servidor.close();
  db.close();
  fs.rmSync(carpeta, { recursive: true, force: true });
});

// Cliente HTTP con su propia "cookie jar", como si fuera un navegador distinto.
function cliente() {
  const c = async (metodo, ruta, cuerpo) => {
    const headers = {};
    if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
    if (c.cookie) headers.Cookie = c.cookie;
    const r = await fetch(base + ruta, {
      method: metodo,
      headers,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const setCookie = r.headers.get('set-cookie');
    if (setCookie) {
      c.setCookie = setCookie;
      c.cookie = setCookie.split(';')[0];
    }
    let datos = null;
    try {
      datos = await r.json();
    } catch {}
    return { status: r.status, datos };
  };
  return c;
}

async function iniciarSesion(email, password = 'Demo1234') {
  const c = cliente();
  const r = await c('POST', '/api/auth/login', { email, password });
  assert.equal(r.status, 200, `login de ${email} falló: ${JSON.stringify(r.datos)}`);
  return c;
}

const admin = () => iniciarSesion('admin@inmo.local', 'Admin1234');

async function idUsuario(email) {
  return db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email).id;
}
async function idRol(nombre) {
  return db.prepare('SELECT id FROM roles WHERE nombre = ?').get(nombre).id;
}

// ---------- HU-01 Registro ----------

test('CP-01 (HU-01) registro válido crea la cuenta con rol Cliente y contraseña cifrada', async () => {
  const c = cliente();
  const r = await c('POST', '/api/auth/registro', { nombre: 'Pedro Pérez', email: 'Pedro@Correo.com', password: 'Clave1234' });
  assert.equal(r.status, 201);
  assert.deepEqual(r.datos.usuario.roles, ['Cliente']);
  assert.equal(r.datos.usuario.email, 'pedro@correo.com');

  const guardado = db.prepare('SELECT password_hash FROM usuarios WHERE email = ?').get('pedro@correo.com');
  assert.match(guardado.password_hash, /^scrypt\$/);
  assert.ok(!guardado.password_hash.includes('Clave1234'));
});

test('CP-02 (HU-01) registro con correo duplicado es rechazado', async () => {
  const r = await cliente()('POST', '/api/auth/registro', { nombre: 'Otro', email: 'pedro@correo.com', password: 'Clave1234' });
  assert.equal(r.status, 409);
});

test('CP-03 (HU-01) registro con datos inválidos es rechazado', async () => {
  const c = cliente();
  const debil = await c('POST', '/api/auth/registro', { nombre: 'Débil', email: 'debil@correo.com', password: 'abc' });
  assert.equal(debil.status, 400);
  const sinNumero = await c('POST', '/api/auth/registro', { nombre: 'Débil', email: 'debil@correo.com', password: 'solamenteletras' });
  assert.equal(sinNumero.status, 400);
  const correo = await c('POST', '/api/auth/registro', { nombre: 'Débil', email: 'no-es-correo', password: 'Clave1234' });
  assert.equal(correo.status, 400);
});

// ---------- HU-02 / HU-03 Inicio y cierre de sesión ----------

test('CP-04 (HU-02) inicio de sesión correcto entrega cookie HttpOnly y el perfil con permisos', async () => {
  const c = cliente();
  const r = await c('POST', '/api/auth/login', { email: 'pedro@correo.com', password: 'Clave1234' });
  assert.equal(r.status, 200);
  assert.match(c.setCookie, /HttpOnly/);
  assert.match(c.setCookie, /SameSite=Strict/);
  assert.deepEqual(r.datos.usuario.permisos, ['disenos.ver', 'propiedades.ver']);

  const sesion = await c('GET', '/api/auth/sesion');
  assert.equal(sesion.status, 200);
  assert.equal(sesion.datos.usuario.email, 'pedro@correo.com');
});

test('CP-05 (HU-02) credenciales incorrectas devuelven un mensaje genérico', async () => {
  const c = cliente();
  const malaClave = await c('POST', '/api/auth/login', { email: 'pedro@correo.com', password: 'Incorrecta1' });
  const noExiste = await c('POST', '/api/auth/login', { email: 'nadie@correo.com', password: 'Incorrecta1' });
  assert.equal(malaClave.status, 401);
  assert.equal(noExiste.status, 401);
  assert.equal(malaClave.datos.error, noExiste.datos.error);
});

test('CP-06 (HU-02) la cuenta se bloquea tras 5 intentos fallidos y el admin puede desbloquearla', async () => {
  await cliente()('POST', '/api/auth/registro', { nombre: 'Bloqueo', email: 'bloqueo@correo.com', password: 'Clave1234' });
  const c = cliente();
  for (let i = 0; i < 5; i++) {
    const r = await c('POST', '/api/auth/login', { email: 'bloqueo@correo.com', password: 'Mala12345' });
    assert.equal(r.status, 401);
  }
  const bloqueado = await c('POST', '/api/auth/login', { email: 'bloqueo@correo.com', password: 'Clave1234' });
  assert.equal(bloqueado.status, 423, 'con la clave correcta sigue bloqueada');

  const a = await admin();
  const desbloqueo = await a('PATCH', `/api/usuarios/${await idUsuario('bloqueo@correo.com')}/estado`, { activo: true });
  assert.equal(desbloqueo.status, 200);
  const ok = await c('POST', '/api/auth/login', { email: 'bloqueo@correo.com', password: 'Clave1234' });
  assert.equal(ok.status, 200);
});

test('CP-07 (HU-03) cerrar sesión invalida el token en el servidor', async () => {
  const c = await iniciarSesion('cliente@inmo.local');
  const cookieVieja = c.cookie;
  const salida = await c('POST', '/api/auth/logout');
  assert.equal(salida.status, 200);
  assert.match(c.setCookie, /Max-Age=0/);

  // Reutilizar la cookie anterior (p. ej. robada) ya no sirve.
  c.cookie = cookieVieja;
  const r = await c('GET', '/api/propiedades');
  assert.equal(r.status, 401);
});

// ---------- HU-07 Restricción según perfil ----------

test('CP-08 (HU-07) sin sesión, todos los endpoints protegidos responden 401', async () => {
  const c = cliente();
  for (const ruta of ['/api/auth/sesion', '/api/propiedades', '/api/disenos', '/api/usuarios', '/api/roles', '/api/auditoria']) {
    const r = await c('GET', ruta);
    assert.equal(r.status, 401, ruta);
  }
});

test('CP-09 (HU-07) Cliente: solo consulta; no publica ni administra', async () => {
  const c = await iniciarSesion('cliente@inmo.local');
  assert.equal((await c('GET', '/api/propiedades')).status, 200);
  assert.equal((await c('GET', '/api/disenos')).status, 200);
  assert.equal((await c('POST', '/api/propiedades', { titulo: 'X', tipo: 'Casa', ubicacion: 'Y', precio: 1 })).status, 403);
  assert.equal((await c('POST', '/api/disenos', { nombre: 'X', estilo: 'Y', area_m2: 1 })).status, 403);
  assert.equal((await c('GET', '/api/usuarios')).status, 403);
  assert.equal((await c('GET', '/api/auditoria')).status, 403);
  assert.equal((await c('PUT', '/api/usuarios/1/roles', { roles: [1] })).status, 403, 'no puede auto-elevarse');
});

test('CP-10 (HU-07) Agente Inmobiliario: publica propiedades pero no diseños', async () => {
  const c = await iniciarSesion('agente@inmo.local');
  const nueva = await c('POST', '/api/propiedades', { titulo: 'Penthouse Piantini', tipo: 'Apartamento', ubicacion: 'Santo Domingo', precio: 450000 });
  assert.equal(nueva.status, 201);
  assert.equal((await c('POST', '/api/disenos', { nombre: 'X', estilo: 'Y', area_m2: 10 })).status, 403);
  assert.equal((await c('GET', '/api/usuarios')).status, 403);
});

test('CP-11 (HU-07) Arquitecto: crea diseños pero no publica propiedades', async () => {
  const c = await iniciarSesion('arquitecto@inmo.local');
  assert.equal((await c('POST', '/api/disenos', { nombre: 'Casa Brisa', estilo: 'Minimalista', area_m2: 150 })).status, 201);
  assert.equal((await c('POST', '/api/propiedades', { titulo: 'X', tipo: 'Casa', ubicacion: 'Y', precio: 1 })).status, 403);
});

// ---------- HU-04 / HU-05 Administración de usuarios y roles ----------

test('CP-12 (HU-05) el admin asigna un rol y el cambio aplica de inmediato, sin volver a iniciar sesión', async () => {
  const cli = await iniciarSesion('pedro@correo.com', 'Clave1234');
  const propiedad = { titulo: 'Local comercial', tipo: 'Local', ubicacion: 'La Romana', precio: 70000 };
  assert.equal((await cli('POST', '/api/propiedades', propiedad)).status, 403);

  const a = await admin();
  const r = await a('PUT', `/api/usuarios/${await idUsuario('pedro@correo.com')}/roles`, {
    roles: [await idRol('Cliente'), await idRol('Agente Inmobiliario')],
  });
  assert.equal(r.status, 200);

  assert.equal((await cli('POST', '/api/propiedades', propiedad)).status, 201);
});

test('CP-13 (HU-04/HU-05) el admin no puede quitarse su rol ni desactivarse (evita quedar sin administrador)', async () => {
  const a = await admin();
  const yo = await idUsuario('admin@inmo.local');
  assert.equal((await a('PUT', `/api/usuarios/${yo}/roles`, { roles: [await idRol('Cliente')] })).status, 409);
  assert.equal((await a('PATCH', `/api/usuarios/${yo}/estado`, { activo: false })).status, 409);
  assert.equal((await a('PUT', `/api/usuarios/${yo}/roles`, { roles: [] })).status, 400);
  assert.equal((await a('PUT', `/api/usuarios/${yo}/roles`, { roles: [9999] })).status, 400);
});

test('CP-14 (HU-04) desactivar un usuario cierra sus sesiones y le impide entrar', async () => {
  const arq = await iniciarSesion('arquitecto@inmo.local');
  const a = await admin();
  const id = await idUsuario('arquitecto@inmo.local');

  assert.equal((await a('PATCH', `/api/usuarios/${id}/estado`, { activo: false })).status, 200);
  assert.equal((await arq('GET', '/api/disenos')).status, 401, 'la sesión abierta quedó invalidada');
  assert.equal((await cliente()('POST', '/api/auth/login', { email: 'arquitecto@inmo.local', password: 'Demo1234' })).status, 403);

  assert.equal((await a('PATCH', `/api/usuarios/${id}/estado`, { activo: true })).status, 200);
  await iniciarSesion('arquitecto@inmo.local');
});

// ---------- HU-06 Roles y permisos ----------

test('CP-15 (HU-06) crear un rol personalizado y editar sus permisos', async () => {
  const a = await admin();
  const creado = await a('POST', '/api/roles', { nombre: 'Auditor', descripcion: 'Solo auditoría', permisos: ['auditoria.ver'] });
  assert.equal(creado.status, 201);
  assert.equal((await a('POST', '/api/roles', { nombre: 'auditor', permisos: [] })).status, 409, 'nombre duplicado');
  assert.equal((await a('POST', '/api/roles', { nombre: 'Malo', permisos: ['no.existe'] })).status, 400);

  await cliente()('POST', '/api/auth/registro', { nombre: 'Ana Auditora', email: 'auditora@correo.com', password: 'Clave1234' });
  await a('PUT', `/api/usuarios/${await idUsuario('auditora@correo.com')}/roles`, { roles: [creado.datos.rol.id] });

  const aud = await iniciarSesion('auditora@correo.com', 'Clave1234');
  assert.equal((await aud('GET', '/api/auditoria')).status, 200);
  assert.equal((await aud('GET', '/api/propiedades')).status, 403);

  const editado = await a('PUT', `/api/roles/${creado.datos.rol.id}/permisos`, { permisos: ['auditoria.ver', 'propiedades.ver'] });
  assert.equal(editado.status, 200);
  assert.equal((await aud('GET', '/api/propiedades')).status, 200, 'el nuevo permiso aplica de inmediato');

  const quitar = await a('PUT', `/api/roles/${creado.datos.rol.id}/permisos`, { permisos: [] });
  assert.equal(quitar.status, 200);
  assert.equal((await aud('GET', '/api/auditoria')).status, 403, 'el permiso retirado también aplica de inmediato');
});

test('CP-16 (HU-06) el rol Administrador no se edita, los roles base no se eliminan y un rol en uso tampoco', async () => {
  const a = await admin();
  assert.equal((await a('PUT', `/api/roles/${await idRol('Administrador')}/permisos`, { permisos: [] })).status, 409);
  assert.equal((await a('DELETE', `/api/roles/${await idRol('Cliente')}`)).status, 409);
  assert.equal((await a('DELETE', `/api/roles/${await idRol('Auditor')}`)).status, 409, 'Auditor está asignado');

  const temporal = await a('POST', '/api/roles', { nombre: 'Temporal', permisos: [] });
  assert.equal((await a('DELETE', `/api/roles/${temporal.datos.rol.id}`)).status, 200);
});

// ---------- HU-08 Auditoría ----------

test('CP-17 (HU-08) la bitácora registra accesos, denegaciones y cambios de permisos', async () => {
  const a = await admin();
  const r = await a('GET', '/api/auditoria?limite=1000');
  assert.equal(r.status, 200);
  const acciones = new Set(r.datos.registros.map((x) => x.accion));
  for (const accion of [
    'REGISTRO', 'LOGIN', 'LOGIN_FALLIDO', 'LOGIN_BLOQUEADO', 'CUENTA_BLOQUEADA', 'LOGOUT', 'ACCESO_DENEGADO',
    'ASIGNAR_ROLES', 'DESACTIVAR_USUARIO', 'ACTIVAR_USUARIO', 'CREAR_ROL', 'ACTUALIZAR_PERMISOS',
    'ELIMINAR_ROL', 'CREAR_PROPIEDAD', 'CREAR_DISENO',
  ]) {
    assert.ok(acciones.has(accion), `falta la acción ${accion}`);
  }
  const denegado = r.datos.registros.find((x) => x.accion === 'ACCESO_DENEGADO');
  assert.ok(denegado.email && denegado.detalle.includes('requiere'));
});
