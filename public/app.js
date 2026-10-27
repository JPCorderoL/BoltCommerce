// public/app.js
// Frontend sin frameworks. El menu se arma con los permisos del usuario, pero la
// proteccion real esta en el servidor: si se fuerza una URL, la API responde 403
// y la vista lo muestra.

const $app = document.getElementById('app');
let usuario = null;
let avisoPendiente = null; // mensaje para mostrar en la siguiente vista

// ---------- Utilidades ----------

function h(tag, props, ...hijos) {
  const el = document.createElement(tag);
  for (const [clave, valor] of Object.entries(props || {})) {
    if (valor == null || valor === false) continue;
    if (clave.startsWith('on')) el.addEventListener(clave.slice(2), valor);
    else if (clave === 'class') el.className = valor;
    else if (clave === 'style') el.style.cssText = valor; // via CSSOM: la CSP bloquea atributos style inline
    else el.setAttribute(clave, valor === true ? '' : valor);
  }
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo == null || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : String(hijo));
  }
  return el;
}

async function api(metodo, url, cuerpo) {
  const opciones = { method: metodo, credentials: 'same-origin', headers: {} };
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  const r = await fetch(url, opciones);
  let datos = null;
  try {
    datos = await r.json();
  } catch {}
  // Sesion vencida o invalidada (p. ej. el admin desactivo la cuenta): volver al login.
  if (r.status === 401 && usuario && !url.startsWith('/api/auth/')) {
    usuario = null;
    avisoPendiente = { tipo: 'error', texto: 'Su sesión terminó. Inicie sesión de nuevo.' };
    ir('#/login');
  }
  return { ok: r.ok, status: r.status, datos };
}

const tiene = (permiso) => Boolean(usuario?.permisos.includes(permiso));
const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es-DO') : '—');
const dinero = (n) => Number(n).toLocaleString('es-DO', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const datosForm = (form) => Object.fromEntries(new FormData(form).entries());

function cajaAviso() {
  const caja = h('div', { class: 'aviso', role: 'status' });
  caja.mostrar = (tipo, texto) => {
    caja.className = `aviso ${tipo}`;
    caja.textContent = texto;
  };
  if (avisoPendiente) {
    caja.mostrar(avisoPendiente.tipo, avisoPendiente.texto);
    avisoPendiente = null;
  }
  return caja;
}

function vistaDenegada(resp) {
  return h('div', { class: 'tarjeta denegado' },
    h('div', { class: 'codigo' }, resp.status),
    h('h2', {}, 'Acceso denegado'),
    h('p', { class: 'tenue' }, resp.datos?.error || 'No tiene permiso para ver esta sección.'),
    h('p', { class: 'tenue' }, 'El intento quedó registrado en la bitácora de auditoría.'),
    h('a', { href: '#/inicio' }, 'Volver al inicio'));
}

// ---------- Acceso ----------

function marcoAcceso(...contenido) {
  return h('div', { class: 'acceso' },
    h('section', { class: 'acceso-marca' },
      h('div', { class: 'logo' }, 'BoltCommerce ', h('span', {}, '·'), ' Inmobiliaria & Diseño'),
      h('h1', {}, 'Propiedades y arquitectura en un solo lugar.'),
      h('small', { style: 'color:#cfdcd9' }, 'Épica 1 · Gestión de usuarios y accesos')),
    h('section', { class: 'acceso-panel' }, h('div', { class: 'acceso-caja' }, ...contenido)));
}

function vistaLogin() {
  const aviso = cajaAviso();
  const form = h('form', { class: 'pila' },
    h('label', {}, 'Correo electrónico', h('input', { name: 'email', type: 'email', required: true, autocomplete: 'username' })),
    h('label', {}, 'Contraseña', h('input', { name: 'password', type: 'password', required: true, autocomplete: 'current-password' })),
    h('button', { class: 'primario', type: 'submit' }, 'Iniciar sesión'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await api('POST', '/api/auth/login', datosForm(form));
    if (!r.ok) return aviso.mostrar('error', r.datos?.error || 'No se pudo iniciar sesión.');
    usuario = r.datos.usuario;
    ir('#/inicio');
  });

  const cuentas = [
    ['Administrador', 'admin@inmo.local', 'Admin1234'],
    ['Agente Inmobiliario', 'agente@inmo.local', 'Demo1234'],
    ['Arquitecto', 'arquitecto@inmo.local', 'Demo1234'],
    ['Cliente', 'cliente@inmo.local', 'Demo1234'],
  ];
  const demo = h('div', { class: 'demo' },
    h('small', {}, 'Cuentas de demostración (clic para completar):'),
    cuentas.map(([rol, email, clave]) =>
      h('button', {
        type: 'button',
        class: 'chico',
        onclick: () => {
          form.email.value = email;
          form.password.value = clave;
        },
      }, h('span', {}, rol), h('span', { class: 'tenue' }, email))));

  return marcoAcceso(
    h('h2', {}, 'Iniciar sesión'),
    h('p', { class: 'tenue' }, '¿No tiene cuenta? ', h('a', { href: '#/registro' }, 'Regístrese')),
    aviso, form, demo);
}

function vistaRegistro() {
  const aviso = cajaAviso();
  const form = h('form', { class: 'pila' },
    h('label', {}, 'Nombre completo', h('input', { name: 'nombre', required: true, minlength: 3, maxlength: 80, autocomplete: 'name' })),
    h('label', {}, 'Correo electrónico', h('input', { name: 'email', type: 'email', required: true, autocomplete: 'email' })),
    h('label', {}, 'Contraseña', h('input', { name: 'password', type: 'password', required: true, minlength: 8, autocomplete: 'new-password' }),
      h('small', {}, 'Mínimo 8 caracteres, con al menos una letra y un número.')),
    h('label', {}, 'Confirmar contraseña', h('input', { name: 'confirmar', type: 'password', required: true, autocomplete: 'new-password' })),
    h('button', { class: 'primario', type: 'submit' }, 'Crear cuenta'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { nombre, email, password, confirmar } = datosForm(form);
    if (password !== confirmar) return aviso.mostrar('error', 'Las contraseñas no coinciden.');
    const r = await api('POST', '/api/auth/registro', { nombre, email, password });
    if (!r.ok) return aviso.mostrar('error', r.datos?.error || 'No se pudo registrar.');
    avisoPendiente = { tipo: 'ok', texto: `Cuenta creada para ${r.datos.usuario.email} con rol Cliente. Ya puede iniciar sesión.` };
    ir('#/login');
  });

  return marcoAcceso(
    h('h2', {}, 'Crear cuenta'),
    h('p', { class: 'tenue' }, '¿Ya tiene cuenta? ', h('a', { href: '#/login' }, 'Inicie sesión')),
    aviso, form);
}

// ---------- Estructura de la aplicacion ----------

const VISTAS = [
  { ruta: 'inicio', titulo: 'Inicio', seccion: 'General', render: vistaInicio },
  { ruta: 'propiedades', titulo: 'Propiedades', seccion: 'e-Commerce', permiso: 'propiedades.ver', render: () => vistaCatalogo(CATALOGOS.propiedades) },
  { ruta: 'disenos', titulo: 'Diseños', seccion: 'e-Commerce', permiso: 'disenos.ver', render: () => vistaCatalogo(CATALOGOS.disenos) },
  { ruta: 'usuarios', titulo: 'Usuarios', seccion: 'Administración', permiso: 'usuarios.ver', render: vistaUsuarios },
  { ruta: 'roles', titulo: 'Roles y permisos', seccion: 'Administración', permiso: 'roles.gestionar', render: vistaRoles },
  { ruta: 'auditoria', titulo: 'Auditoría', seccion: 'Administración', permiso: 'auditoria.ver', render: vistaAuditoria },
  { ruta: 'pruebas', titulo: 'Prueba de accesos', seccion: 'Verificación', render: vistaPruebas },
];

function shell(vistaActual, contenido) {
  const visibles = VISTAS.filter((v) => !v.permiso || tiene(v.permiso));
  const nav = h('nav', {});
  let seccion = null;
  for (const v of visibles) {
    if (v.seccion !== seccion) {
      seccion = v.seccion;
      nav.append(h('div', { class: 'seccion' }, seccion));
    }
    nav.append(h('a', { href: `#/${v.ruta}`, class: v === vistaActual ? 'activo' : null }, v.titulo));
  }

  const salir = h('button', { class: 'chico', onclick: cerrarSesion }, 'Cerrar sesión');
  return h('div', { class: 'shell' },
    h('aside', { class: 'lateral' }, h('div', { class: 'logo' }, 'BoltCommerce ', h('span', {}, '·')), nav),
    h('div', { class: 'cuerpo' },
      h('header', { class: 'barra' },
        h('strong', {}, vistaActual.titulo),
        h('div', { class: 'quien' },
          h('span', {}, usuario.nombre),
          usuario.roles.map((r) => h('span', { class: 'chip acento' }, r)),
          salir)),
      contenido));
}

async function cerrarSesion() {
  await api('POST', '/api/auth/logout');
  usuario = null;
  avisoPendiente = { tipo: 'ok', texto: 'Sesión cerrada correctamente.' };
  ir('#/login');
}

// ---------- Vistas internas ----------

function vistaInicio() {
  const modulos = [
    ['Propiedades', 'propiedades.ver', 'propiedades.gestionar'],
    ['Diseño arquitectónico', 'disenos.ver', 'disenos.gestionar'],
    ['Usuarios', 'usuarios.ver', 'usuarios.gestionar'],
    ['Roles y permisos', null, 'roles.gestionar'],
    ['Auditoría', 'auditoria.ver', null],
  ];
  const nivel = ([, ver, gestionar]) => {
    if (gestionar && tiene(gestionar)) return h('span', { class: 'chip ok' }, 'Gestión');
    if (ver && tiene(ver)) return h('span', { class: 'chip' }, 'Consulta');
    return h('span', { class: 'chip gris' }, 'Sin acceso');
  };

  return h('div', {},
    cajaAviso(),
    h('div', { class: 'tarjeta' },
      h('h2', {}, `Bienvenido, ${usuario.nombre}`),
      h('p', { class: 'tenue' }, `${usuario.email} · Roles: ${usuario.roles.join(', ')}`),
      h('p', {}, 'Su acceso a cada módulo depende de los permisos de sus roles:')),
    h('div', { class: 'rejilla' },
      modulos.map((m) => h('div', { class: 'modulo' }, h('h3', {}, m[0]), nivel(m)))),
    h('div', { class: 'tarjeta', style: 'margin-top:1.25rem' },
      h('h3', {}, 'Permisos efectivos'),
      h('p', {}, usuario.permisos.map((p) => [h('code', {}, p), ' ']))));
}

const CATALOGOS = {
  propiedades: {
    titulo: 'Catálogo de propiedades',
    url: '/api/propiedades',
    permisoGestionar: 'propiedades.gestionar',
    columnas: [
      ['Título', (x) => x.titulo],
      ['Tipo', (x) => x.tipo],
      ['Ubicación', (x) => x.ubicacion],
      ['Precio', (x) => dinero(x.precio), 'num'],
      ['Publicado por', (x) => x.autor || '—'],
    ],
    campos: () => [
      h('label', {}, 'Título', h('input', { name: 'titulo', required: true })),
      h('label', {}, 'Tipo', h('select', { name: 'tipo' }, ['Casa', 'Apartamento', 'Solar', 'Local'].map((t) => h('option', {}, t)))),
      h('label', {}, 'Ubicación', h('input', { name: 'ubicacion', required: true })),
      h('label', {}, 'Precio (USD)', h('input', { name: 'precio', type: 'number', min: 1, required: true })),
    ],
  },
  disenos: {
    titulo: 'Proyectos de diseño arquitectónico',
    url: '/api/disenos',
    permisoGestionar: 'disenos.gestionar',
    columnas: [
      ['Nombre', (x) => x.nombre],
      ['Estilo', (x) => x.estilo],
      ['Área', (x) => `${x.area_m2} m²`, 'num'],
      ['Arquitecto', (x) => x.autor || '—'],
    ],
    campos: () => [
      h('label', {}, 'Nombre', h('input', { name: 'nombre', required: true })),
      h('label', {}, 'Estilo', h('input', { name: 'estilo', required: true })),
      h('label', {}, 'Área (m²)', h('input', { name: 'area_m2', type: 'number', min: 1, required: true })),
    ],
  },
};

async function vistaCatalogo(cfg) {
  const r = await api('GET', cfg.url);
  if (!r.ok) return vistaDenegada(r);
  const aviso = cajaAviso();
  const gestiona = tiene(cfg.permisoGestionar);

  const filas = r.datos.elementos.map((x) =>
    h('tr', {},
      cfg.columnas.map(([, valor, clase]) => h('td', { class: clase }, valor(x))),
      gestiona && h('td', {}, h('button', {
        class: 'chico peligro',
        onclick: async () => {
          const d = await api('DELETE', `${cfg.url}/${x.id}`);
          if (!d.ok) return aviso.mostrar('error', d.datos?.error);
          avisoPendiente = { tipo: 'ok', texto: 'Registro eliminado.' };
          render();
        },
      }, 'Eliminar'))));

  let formulario = null;
  if (gestiona) {
    const form = h('form', { class: 'fila-form' }, cfg.campos(), h('button', { class: 'primario', type: 'submit' }, 'Agregar'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const c = await api('POST', cfg.url, datosForm(form));
      if (!c.ok) return aviso.mostrar('error', c.datos?.error);
      avisoPendiente = { tipo: 'ok', texto: 'Registro creado.' };
      render();
    });
    formulario = h('div', { class: 'tarjeta' }, h('h3', {}, 'Nuevo registro'), form);
  }

  return h('div', {},
    h('div', { class: 'cabecera' },
      h('div', {}, h('h2', {}, cfg.titulo),
        h('small', {}, gestiona ? 'Su perfil puede consultar y gestionar este módulo.' : 'Su perfil solo puede consultar este módulo.'))),
    aviso,
    formulario,
    h('div', { class: 'tarjeta tabla-envoltura' },
      h('table', {},
        h('thead', {}, h('tr', {}, cfg.columnas.map(([t, , clase]) => h('th', { class: clase }, t)), gestiona && h('th', {}, ''))),
        h('tbody', {}, filas.length ? filas : h('tr', {}, h('td', { colspan: 9, class: 'tenue' }, 'Sin registros.'))))));
}

async function vistaUsuarios() {
  const r = await api('GET', '/api/usuarios');
  if (!r.ok) return vistaDenegada(r);
  const gestiona = tiene('usuarios.gestionar');
  const roles = gestiona ? (await api('GET', '/api/roles')).datos?.roles || [] : [];
  const aviso = cajaAviso();

  const fila = (u) => {
    const estado = u.bloqueado
      ? h('span', { class: 'chip error' }, 'Bloqueado')
      : u.activo ? h('span', { class: 'chip ok' }, 'Activo') : h('span', { class: 'chip gris' }, 'Inactivo');

    if (!gestiona) {
      return h('tr', {},
        h('td', {}, u.nombre, h('br'), h('small', {}, u.email)), h('td', {}, estado),
        h('td', {}, u.roles.map((x) => [h('span', { class: 'chip acento' }, x.nombre), ' '])),
        h('td', {}, h('small', {}, fecha(u.ultimo_acceso))));
    }

    const asignados = new Set(u.roles.map((x) => x.id));
    const checks = roles.map((rol) =>
      h('label', {}, h('input', { type: 'checkbox', value: rol.id, checked: asignados.has(rol.id) }), rol.nombre));

    const guardar = h('button', {
      class: 'chico primario',
      onclick: async () => {
        const seleccion = checks.map((l) => l.firstChild).filter((c) => c.checked).map((c) => Number(c.value));
        const g = await api('PUT', `/api/usuarios/${u.id}/roles`, { roles: seleccion });
        if (!g.ok) return aviso.mostrar('error', g.datos?.error);
        avisoPendiente = { tipo: 'ok', texto: `Roles de ${u.email} actualizados: ${g.datos.roles.map((x) => x.nombre).join(', ')}.` };
        if (u.id === usuario.id) await recargarSesion();
        render();
      },
    }, 'Guardar roles');

    const activar = !u.activo || u.bloqueado;
    const estadoBtn = h('button', {
      class: activar ? 'chico' : 'chico peligro',
      disabled: u.id === usuario.id,
      title: u.id === usuario.id ? 'No puede desactivar su propia cuenta' : null,
      onclick: async () => {
        const g = await api('PATCH', `/api/usuarios/${u.id}/estado`, { activo: activar });
        if (!g.ok) return aviso.mostrar('error', g.datos?.error);
        avisoPendiente = { tipo: 'ok', texto: `${u.email} ${activar ? 'activado' : 'desactivado (sus sesiones se cerraron)'}.` };
        render();
      },
    }, u.bloqueado ? 'Desbloquear' : u.activo ? 'Desactivar' : 'Activar');

    return h('tr', {},
      h('td', {}, u.nombre, h('br'), h('small', {}, u.email)), h('td', {}, estado),
      h('td', {}, h('div', { class: 'roles-check' }, checks)),
      h('td', {}, h('small', {}, fecha(u.ultimo_acceso))),
      h('td', {}, h('div', { class: 'acciones' }, guardar, estadoBtn)));
  };

  return h('div', {},
    h('div', { class: 'cabecera' }, h('div', {}, h('h2', {}, 'Usuarios'),
      h('small', {}, gestiona ? 'Marque los roles de cada usuario y presione "Guardar roles".' : 'Vista de solo lectura.'))),
    aviso,
    h('div', { class: 'tarjeta tabla-envoltura' },
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Usuario'), h('th', {}, 'Estado'), h('th', {}, 'Roles'), h('th', {}, 'Último acceso'), gestiona && h('th', {}, 'Acciones'))),
        h('tbody', {}, r.datos.usuarios.map(fila)))));
}

async function vistaRoles() {
  const r = await api('GET', '/api/roles');
  if (!r.ok) return vistaDenegada(r);
  const { roles, permisos } = r.datos;
  const aviso = cajaAviso();
  const editable = (rol) => rol.nombre !== 'Administrador';

  // checks[rolId][codigo] = <input>
  const checks = {};
  for (const rol of roles) {
    checks[rol.id] = {};
    for (const p of permisos) {
      checks[rol.id][p.codigo] = h('input', {
        type: 'checkbox',
        checked: rol.permisos.includes(p.codigo),
        disabled: !editable(rol),
        'aria-label': `${rol.nombre}: ${p.codigo}`,
      });
    }
  }

  const cuerpo = h('tbody', {});
  let modulo = null;
  for (const p of permisos) {
    if (p.modulo !== modulo) {
      modulo = p.modulo;
      cuerpo.append(h('tr', { class: 'grupo' }, h('td', { colspan: roles.length + 1 }, modulo)));
    }
    cuerpo.append(h('tr', {},
      h('td', {}, h('code', {}, p.codigo), h('br'), h('small', {}, p.descripcion)),
      roles.map((rol) => h('td', { class: 'centro' }, checks[rol.id][p.codigo]))));
  }

  const pie = h('tr', {}, h('td', {}),
    roles.map((rol) => h('td', { class: 'centro' },
      editable(rol)
        ? h('div', { class: 'acciones', style: 'justify-content:center' },
          h('button', {
            class: 'chico primario',
            onclick: async () => {
              const seleccion = permisos.map((p) => p.codigo).filter((c) => checks[rol.id][c].checked);
              const g = await api('PUT', `/api/roles/${rol.id}/permisos`, { permisos: seleccion });
              if (!g.ok) return aviso.mostrar('error', g.datos?.error);
              avisoPendiente = { tipo: 'ok', texto: `Permisos de "${rol.nombre}" guardados. Aplican de inmediato a sus usuarios.` };
              await recargarSesion();
              render();
            },
          }, 'Guardar'),
          !rol.es_sistema && h('button', {
            class: 'chico peligro',
            onclick: async () => {
              const g = await api('DELETE', `/api/roles/${rol.id}`);
              if (!g.ok) return aviso.mostrar('error', g.datos?.error);
              avisoPendiente = { tipo: 'ok', texto: `Rol "${rol.nombre}" eliminado.` };
              render();
            },
          }, 'Eliminar'))
        : h('small', {}, 'Todos (fijo)'))));

  const form = h('form', { class: 'fila-form' },
    h('label', {}, 'Nombre del rol', h('input', { name: 'nombre', required: true, minlength: 3, maxlength: 40 })),
    h('label', {}, 'Descripción', h('input', { name: 'descripcion', maxlength: 200 })),
    h('button', { class: 'primario', type: 'submit' }, 'Crear rol'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const g = await api('POST', '/api/roles', { ...datosForm(form), permisos: [] });
    if (!g.ok) return aviso.mostrar('error', g.datos?.error);
    avisoPendiente = { tipo: 'ok', texto: `Rol "${g.datos.rol.nombre}" creado. Marque sus permisos en la matriz y guarde.` };
    render();
  });

  return h('div', {},
    h('div', { class: 'cabecera' }, h('div', {}, h('h2', {}, 'Roles y permisos'),
      h('small', {}, 'Marque los permisos de cada rol y presione "Guardar" en su columna.'))),
    aviso,
    h('div', { class: 'tarjeta' }, h('h3', {}, 'Nuevo rol'), form),
    h('div', { class: 'tarjeta tabla-envoltura' },
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Permiso'),
          roles.map((rol) => h('th', { class: 'centro' }, rol.nombre, h('br'), h('small', {}, `${rol.usuarios} usuario(s)`))))),
        cuerpo,
        h('tfoot', {}, pie))));
}

async function vistaAuditoria() {
  const r = await api('GET', '/api/auditoria?limite=500');
  if (!r.ok) return vistaDenegada(r);
  const registros = r.datos.registros;
  const acciones = [...new Set(registros.map((x) => x.accion))].sort();

  const cuerpo = h('tbody', {});
  const pintar = (filtro) => {
    const lista = filtro ? registros.filter((x) => x.accion === filtro) : registros;
    cuerpo.replaceChildren(...lista.map((x) =>
      h('tr', {},
        h('td', {}, h('small', {}, fecha(x.fecha))),
        h('td', {}, x.nombre || x.email || h('span', { class: 'tenue' }, 'anónimo'), x.nombre && x.email ? [h('br'), h('small', {}, x.email)] : null),
        h('td', {}, h('span', { class: /DENEGADO|FALLIDO|BLOQUEAD/.test(x.accion) ? 'chip error' : 'chip' }, x.accion)),
        h('td', {}, x.detalle),
        h('td', {}, h('small', {}, x.ip || '—')))));
  };
  pintar('');

  const filtro = h('select', { onchange: (e) => pintar(e.target.value) },
    h('option', { value: '' }, `Todas las acciones (${registros.length})`),
    acciones.map((a) => h('option', { value: a }, a)));

  return h('div', {},
    h('div', { class: 'cabecera' },
      h('div', {}, h('h2', {}, 'Bitácora de auditoría'), h('small', {}, 'Últimos 500 eventos de seguridad, del más reciente al más antiguo.')),
      h('label', {}, 'Filtrar', filtro)),
    h('div', { class: 'tarjeta tabla-envoltura' },
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Fecha'), h('th', {}, 'Usuario'), h('th', {}, 'Acción'), h('th', {}, 'Detalle'), h('th', {}, 'IP'))),
        cuerpo)));
}

// Ejecuta peticiones reales contra la API con la sesion actual. Los POST se envian
// vacios: si el permiso existe, el servidor responde 400 (validacion) y no crea nada.
const PRUEBAS = [
  ['Consultar propiedades', 'GET', '/api/propiedades', 'propiedades.ver'],
  ['Publicar propiedad', 'POST', '/api/propiedades', 'propiedades.gestionar'],
  ['Consultar diseños', 'GET', '/api/disenos', 'disenos.ver'],
  ['Crear diseño', 'POST', '/api/disenos', 'disenos.gestionar'],
  ['Listar usuarios', 'GET', '/api/usuarios', 'usuarios.ver'],
  ['Asignar roles', 'PUT', '/api/usuarios/0/roles', 'usuarios.gestionar'],
  ['Crear rol', 'POST', '/api/roles', 'roles.gestionar'],
  ['Consultar auditoría', 'GET', '/api/auditoria?limite=1', 'auditoria.ver'],
];

function vistaPruebas() {
  const cuerpo = h('tbody', {});
  const ejecutar = async () => {
    cuerpo.replaceChildren();
    for (const [nombre, metodo, url, permiso] of PRUEBAS) {
      const r = await api(metodo, url, metodo === 'GET' ? undefined : {});
      const esperado = tiene(permiso);
      const permitido = r.status !== 401 && r.status !== 403;
      cuerpo.append(h('tr', {},
        h('td', {}, nombre),
        h('td', {}, h('code', {}, `${metodo} ${url.split('?')[0]}`)),
        h('td', {}, h('code', {}, permiso)),
        h('td', {}, esperado ? 'Permitir' : 'Denegar'),
        h('td', {}, h('span', { class: permitido ? 'chip ok' : 'chip error' }, `${r.status} · ${permitido ? 'Permitido' : 'Denegado'}`)),
        h('td', { class: 'centro' }, esperado === permitido ? '✔' : '✘')));
    }
  };
  ejecutar();

  return h('div', {},
    h('div', { class: 'cabecera' },
      h('div', {}, h('h2', {}, 'Prueba de accesos'),
        h('small', {}, `Peticiones reales al servidor con la sesión de ${usuario.email}. Las escrituras se envían vacías y no crean datos.`)),
      h('button', { class: 'primario', onclick: ejecutar }, 'Ejecutar de nuevo')),
    h('div', { class: 'tarjeta tabla-envoltura' },
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Funcionalidad'), h('th', {}, 'Endpoint'), h('th', {}, 'Permiso requerido'),
          h('th', {}, 'Esperado'), h('th', {}, 'Respuesta'), h('th', { class: 'centro' }, 'OK'))),
        cuerpo)));
}

// ---------- Enrutador ----------

async function recargarSesion() {
  const r = await api('GET', '/api/auth/sesion');
  usuario = r.ok ? r.datos.usuario : null;
}

let renderActual = 0;

// Navega renderizando una sola vez: si el hash cambia, el evento hashchange se encarga.
function ir(ruta) {
  if (location.hash === ruta) render();
  else location.hash = ruta;
}

async function render() {
  const id = ++renderActual;
  const ruta = location.hash.replace(/^#\/?/, '');

  if (!usuario) {
    $app.replaceChildren(ruta === 'registro' ? vistaRegistro() : vistaLogin());
    return;
  }
  if (ruta === '' || ruta === 'login' || ruta === 'registro') return ir('#/inicio');

  const vista = VISTAS.find((v) => v.ruta === ruta) || VISTAS[0];
  const contenido = h('main', { class: 'contenido' }, h('p', { class: 'cargando' }, 'Cargando…'));
  $app.replaceChildren(shell(vista, contenido));
  const nodo = await vista.render();
  if (id === renderActual && usuario) contenido.replaceChildren(nodo);
}

window.addEventListener('hashchange', render);

(async () => {
  await recargarSesion();
  render();
})();
