# Pruebas: Épica 1, Gestión de Usuarios y Accesos

## Cómo ejecutarlas

```bash
npm install
npm test
```

Las pruebas (`test/acceso.test.js`) levantan la aplicación en un puerto libre con una **base de datos SQLite temporal**, hacen peticiones HTTP reales a la API (cada "usuario" tiene su propia cookie de sesión, como un navegador distinto) y al final borran la base temporal.

## Casos de prueba

| ID | HU | Tipo | Caso | Resultado esperado |
|---|---|---|---|---|
| CP-01 | HU-01 | Autorizado | Registro con datos válidos | 201, rol Cliente, correo normalizado, contraseña guardada como hash `scrypt` |
| CP-02 | HU-01 | Validación | Registro con correo ya existente | 409 |
| CP-03 | HU-01 | Validación | Contraseña corta, contraseña sin números, correo inválido | 400 en los tres casos |
| CP-04 | HU-02 | Autorizado | Inicio de sesión correcto | 200, cookie `HttpOnly` + `SameSite=Strict`, perfil con permisos del rol |
| CP-05 | HU-02 | No autorizado | Contraseña incorrecta / correo inexistente | 401 con el **mismo** mensaje en ambos casos |
| CP-06 | HU-02, HU-04 | No autorizado | 5 intentos fallidos y luego la clave correcta; el admin desbloquea | 401 ×5 → 423 → desbloqueo 200 → inicio de sesión 200 |
| CP-07 | HU-03 | No autorizado | Reutilizar la cookie después de cerrar sesión | Cierre 200 (`Max-Age=0`) y luego 401 con la cookie vieja |
| CP-08 | HU-07 | No autorizado | Llamar sin sesión a los 6 endpoints protegidos | 401 en todos |
| CP-09 | HU-07 | Mixto | Cliente: consultar, publicar, crear diseño, ver usuarios, ver auditoría, auto-asignarse roles | Consultar 200; resto 403 |
| CP-10 | HU-07 | Mixto | Agente: publicar propiedad / crear diseño / ver usuarios | 201 / 403 / 403 |
| CP-11 | HU-07 | Mixto | Arquitecto: crear diseño / publicar propiedad | 201 / 403 |
| CP-12 | HU-05 | Autorizado | El admin asigna el rol Agente a un Cliente con la sesión abierta | Antes 403, después 201 **sin volver a iniciar sesión** |
| CP-13 | HU-04, HU-05 | Regla de negocio | El admin intenta quitarse su rol, desactivarse, dejarse sin roles o asignar un rol inexistente | 409, 409, 400, 400 |
| CP-14 | HU-04 | No autorizado | Desactivar un usuario con la sesión abierta | Su sesión pasa a 401 y el inicio de sesión a 403; al reactivarlo puede entrar |
| CP-15 | HU-06 | Autorizado | Crear el rol "Auditor", asignarlo, agregar y quitar permisos | 201; nombre duplicado 409; permiso inválido 400; los cambios aplican de inmediato (200 ↔ 403) |
| CP-16 | HU-06 | Regla de negocio | Editar el rol Administrador / eliminar un rol base / eliminar un rol en uso / eliminar un rol libre | 409 / 409 / 409 / 200 |
| CP-17 | HU-08 | Trazabilidad | Consultar la bitácora después de las pruebas | Contiene las 15 acciones esperadas; los `ACCESO_DENEGADO` incluyen el usuario y el permiso requerido |

## Resultados de la ejecución

**Fecha:** 26/10/2026. **Entorno:** Windows 10 Pro, Node.js v24.18.1.

```
✔ CP-01 (HU-01) registro válido crea la cuenta con rol Cliente y contraseña cifrada
✔ CP-02 (HU-01) registro con correo duplicado es rechazado
✔ CP-03 (HU-01) registro con datos inválidos es rechazado
✔ CP-04 (HU-02) inicio de sesión correcto entrega cookie HttpOnly y el perfil con permisos
✔ CP-05 (HU-02) credenciales incorrectas devuelven un mensaje genérico
✔ CP-06 (HU-02) la cuenta se bloquea tras 5 intentos fallidos y el admin puede desbloquearla
✔ CP-07 (HU-03) cerrar sesión invalida el token en el servidor
✔ CP-08 (HU-07) sin sesión, todos los endpoints protegidos responden 401
✔ CP-09 (HU-07) Cliente: solo consulta; no publica ni administra
✔ CP-10 (HU-07) Agente Inmobiliario: publica propiedades pero no diseños
✔ CP-11 (HU-07) Arquitecto: crea diseños pero no publica propiedades
✔ CP-12 (HU-05) el admin asigna un rol y el cambio aplica de inmediato, sin volver a iniciar sesión
✔ CP-13 (HU-04/HU-05) el admin no puede quitarse su rol ni desactivarse (evita quedar sin administrador)
✔ CP-14 (HU-04) desactivar un usuario cierra sus sesiones y le impide entrar
✔ CP-15 (HU-06) crear un rol personalizado y editar sus permisos
✔ CP-16 (HU-06) el rol Administrador no se edita, los roles base no se eliminan y un rol en uso tampoco
✔ CP-17 (HU-08) la bitácora registra accesos, denegaciones y cambios de permisos
ℹ tests 17
ℹ pass 17
ℹ fail 0
```

**17 de 17 casos aprobados.**

## Verificación manual en la interfaz

Además de las pruebas automatizadas, la pantalla **Prueba de accesos** (disponible para todos los perfiles) hace 8 peticiones reales con la sesión actual y compara la respuesta con lo esperado según los permisos. Es la evidencia en vivo de acceso autorizado y no autorizado:

| Perfil | Permitido | Denegado (403) |
|---|---|---|
| Cliente | Consultar propiedades, consultar diseños | Publicar propiedad, crear diseño, listar usuarios, asignar roles, crear rol, consultar auditoría |
| Agente Inmobiliario | Consultar y publicar propiedades, consultar diseños | Crear diseño, listar usuarios, asignar roles, crear rol, consultar auditoría |
| Arquitecto | Consultar propiedades, consultar y crear diseños | Publicar propiedad, listar usuarios, asignar roles, crear rol, consultar auditoría |
| Administrador | Todo | — |

Las escrituras se envían vacías: si el perfil tiene el permiso, el servidor responde 400 (validación) y no crea datos.
