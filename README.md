# Horizonte · e-Commerce Inmobiliaria y Diseño Arquitectónico

**Incremento: Épica 1 — Configuración / Gestión de Usuarios y Accesos**

Módulo de autenticación, autorización y administración de usuarios. Permite registrar usuarios, iniciar y cerrar sesión, asignar roles, editar los permisos de cada rol, restringir las funcionalidades según el perfil y auditar las operaciones.

- Historias de usuario y criterios de aceptación: [docs/historias-usuario.md](docs/historias-usuario.md)
- Casos de prueba y resultados: [docs/pruebas.md](docs/pruebas.md)

---

## 1. Requisitos

| Herramienta | Versión |
|---|---|
| Node.js | **22.13 o superior** (probado con 24.x). Usa el módulo nativo `node:sqlite`, así que no hay que instalar ni compilar una base de datos. |
| npm | Incluido con Node |

Única dependencia externa: `express`.

## 2. Instalación y ejecución

```bash
git clone <url-del-repositorio>
cd ecommerce-inmobiliaria
npm install
npm start
```

Abrir **http://localhost:3000**.

La primera vez se crea automáticamente `data/app.db` con los roles, permisos, usuarios de demostración y datos de ejemplo. Para volver al estado inicial, detenga el servidor y borre la carpeta `data/`.

Configuración opcional: copie `.env.example` a `.env` (puerto, ruta de la base, credenciales del administrador inicial, `SEED_DEMO=false` para no crear usuarios de demostración).

### Usuarios de demostración

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | admin@inmo.local | Admin1234 |
| Agente Inmobiliario | agente@inmo.local | Demo1234 |
| Arquitecto | arquitecto@inmo.local | Demo1234 |
| Cliente | cliente@inmo.local | Demo1234 |

En la pantalla de inicio de sesión basta con hacer clic sobre una cuenta para completar el formulario.

## 3. Pruebas automatizadas

```bash
npm test
```

Ejecuta los 17 casos de prueba (CP-01 a CP-17) contra la API real usando una base de datos temporal; no toca `data/app.db`. Detalle y resultados en [docs/pruebas.md](docs/pruebas.md).

## 4. Modelo de seguridad

### Roles y permisos iniciales

| Permiso | Administrador | Agente Inmobiliario | Arquitecto | Cliente |
|---|:-:|:-:|:-:|:-:|
| `propiedades.ver` | ✔ | ✔ | ✔ | ✔ |
| `propiedades.gestionar` | ✔ | ✔ | | |
| `disenos.ver` | ✔ | ✔ | ✔ | ✔ |
| `disenos.gestionar` | ✔ | | ✔ | |
| `usuarios.ver` | ✔ | | | |
| `usuarios.gestionar` | ✔ | | | |
| `roles.gestionar` | ✔ | | | |
| `auditoria.ver` | ✔ | | | |

- Un usuario puede tener **varios roles**; sus permisos efectivos son la unión de los permisos de esos roles.
- El administrador puede **crear roles nuevos** y **editar los permisos** de cualquier rol desde *Roles y permisos*, excepto el rol Administrador, que siempre conserva todos los permisos.
- Los cambios de roles y permisos **aplican de inmediato**, sin que el usuario tenga que volver a iniciar sesión.

### Controles implementados

| Control | Implementación |
|---|---|
| Contraseñas | Hash `scrypt` con sal aleatoria por usuario. Política: 8 o más caracteres, con letras y números. |
| Sesión | Token aleatorio de 256 bits en una cookie `HttpOnly` y `SameSite=Strict` (`Secure` en producción). En la base de datos solo se guarda su hash SHA-256. Expira a las 8 horas. |
| Cierre de sesión | Elimina la sesión en el servidor: la cookie anterior deja de servir. |
| Fuerza bruta | 5 intentos fallidos bloquean la cuenta 15 minutos. El administrador puede desbloquearla. |
| Enumeración de cuentas | El mismo mensaje y un tiempo de respuesta similar tanto si el correo no existe como si la contraseña es incorrecta. |
| Autorización | Middleware `requirePermiso` en **cada endpoint** del servidor. El menú del frontend solo oculta opciones; la protección real está en la API. |
| Mínimo privilegio | Toda cuenta registrada recibe el rol Cliente. Solo un administrador puede elevar privilegios. |
| Continuidad | Un administrador no puede quitarse su propio rol ni desactivarse, y el sistema no permite quedarse sin ningún administrador activo. |
| Desactivación | Desactivar un usuario cierra todas sus sesiones abiertas. |
| Trazabilidad | Bitácora de auditoría (usuario, acción, detalle, IP y fecha) para registro, inicio y cierre de sesión, intentos fallidos, bloqueos, accesos denegados, cambios de roles y permisos, y altas y bajas de registros. |
| Cabeceras | CSP `default-src 'self'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`. |

## 5. API

| Método | Ruta | Permiso |
|---|---|---|
| POST | `/api/auth/registro` | público |
| POST | `/api/auth/login` | público |
| POST | `/api/auth/logout` | sesión |
| GET | `/api/auth/sesion` | sesión |
| GET | `/api/usuarios` | `usuarios.ver` |
| PUT | `/api/usuarios/:id/roles` | `usuarios.gestionar` |
| PATCH | `/api/usuarios/:id/estado` | `usuarios.gestionar` |
| GET | `/api/roles` | `roles.gestionar` o `usuarios.ver` |
| POST | `/api/roles` | `roles.gestionar` |
| PUT | `/api/roles/:id/permisos` | `roles.gestionar` |
| DELETE | `/api/roles/:id` | `roles.gestionar` |
| GET | `/api/propiedades` | `propiedades.ver` |
| POST, DELETE | `/api/propiedades[/:id]` | `propiedades.gestionar` |
| GET | `/api/disenos` | `disenos.ver` |
| POST, DELETE | `/api/disenos[/:id]` | `disenos.gestionar` |
| GET | `/api/auditoria` | `auditoria.ver` |

Respuestas de error: `401` sin sesión, `403` sin permiso, `409` regla de negocio, `423` cuenta bloqueada.

## 6. Estructura

```
server.js                 Punto de entrada (lee .env y levanta el servidor)
src/app.js                Construcción de la app Express y montaje de rutas
src/db.js                 Esquema SQLite, catálogo de permisos, roles base y datos de demostración
src/security.js           Hash de contraseñas, tokens y política de contraseñas
src/middleware/auth.js    Sesión, requireAuth y requirePermiso
src/services/auditoria.js Registro en la bitácora
src/routes/               auth, usuarios, roles, auditoria, catalogo (propiedades/diseños)
public/                   Frontend (HTML + CSS + JS sin frameworks)
test/acceso.test.js       Pruebas de aceptación (node:test)
docs/                     Historias de usuario y casos de prueba
```

## 7. Guion para la demostración en vivo (unos 10 minutos)

1. **Registro de usuarios.** Vaya a *Regístrese* y cree una cuenta (por ejemplo `maria@correo.com` / `Clave1234`). Muestre que una contraseña débil se rechaza. La cuenta se crea con el rol **Cliente**.
2. **Inicio de sesión.** Entre con la cuenta nueva. El menú solo muestra *Propiedades*, *Diseños* y *Prueba de accesos*, y el inicio indica "Consulta" o "Sin acceso" en cada módulo.
3. **Acceso no autorizado.** Escriba a mano `http://localhost:3000/#/usuarios`: el servidor responde **403 Acceso denegado**. Abra *Prueba de accesos*: la tabla muestra las peticiones reales y sus respuestas 200, 400 o 403, todas coherentes con el perfil.
4. **Cierre de sesión.** Use *Cerrar sesión*.
5. **Asignación de roles.** Entre como `admin@inmo.local`, abra *Usuarios*, marque **Agente Inmobiliario** para María y presione *Guardar roles*.
6. **Restricción según el perfil.** Vuelva a entrar como María: ahora puede **publicar propiedades**, pero en *Prueba de accesos* *Crear diseño* sigue denegado.
7. **Permisos.** Como administrador, en *Roles y permisos* cree el rol "Auditor", marque `auditoria.ver` y guarde. Asígnelo a un usuario y muestre que ve la bitácora.
8. **Bloqueo.** Intente entrar 5 veces con una contraseña incorrecta: la cuenta queda **bloqueada (423)**. Desbloquéela desde *Usuarios*.
9. **Trazabilidad.** Abra *Auditoría* y filtre por `ACCESO_DENEGADO`, `LOGIN_FALLIDO` y `ASIGNAR_ROLES` para mostrar todo lo que ocurrió durante la demostración.
10. Ejecute `npm test` y muestre los 17 casos en verde.
