# Épica 1: Configuración / Gestión de Usuarios y Accesos

> Como administrador de la plataforma, necesito gestionar los usuarios, roles y permisos del sistema para garantizar que cada persona tenga acceso únicamente a las funcionalidades correspondientes a sus responsabilidades dentro de la e-Commerce inmobiliaria y los procesos de diseño arquitectónico.

**Objetivo de negocio:** establecer un mecanismo seguro de autenticación, autorización y administración de usuarios que controle el acceso a los módulos del sistema y asegure la trazabilidad de las operaciones realizadas.

**Fecha compromiso:** 29 de octubre de 2026, 8:00 p. m.

| ID | Historia | Estado | Casos de prueba |
|---|---|---|---|
| HU-01 | Registro de usuarios | Terminada | CP-01, CP-02, CP-03 |
| HU-02 | Inicio de sesión seguro | Terminada | CP-04, CP-05, CP-06 |
| HU-03 | Cierre de sesión | Terminada | CP-07 |
| HU-04 | Administración de usuarios (activar / desactivar) | Terminada | CP-06, CP-13, CP-14 |
| HU-05 | Asignación de roles a usuarios | Terminada | CP-12, CP-13 |
| HU-06 | Gestión de roles y permisos | Terminada | CP-15, CP-16 |
| HU-07 | Restricción de funcionalidades según el perfil | Terminada | CP-08, CP-09, CP-10, CP-11 |
| HU-08 | Bitácora de auditoría | Terminada | CP-17 |

---

## HU-01: Registro de usuarios

**Como** visitante de la plataforma **quiero** crear una cuenta con mi nombre, correo y contraseña **para** acceder a los servicios de la e-Commerce inmobiliaria.

**Criterios de aceptación**

1. **Dado** que completo nombre, un correo válido y una contraseña de 8 o más caracteres con letras y números, **cuando** envío el formulario, **entonces** la cuenta se crea con el rol **Cliente** y se me indica que ya puedo iniciar sesión.
2. **Dado** que el correo ya está registrado, **cuando** envío el formulario, **entonces** el sistema lo rechaza con el mensaje "Ya existe una cuenta con ese correo".
3. **Dado** que la contraseña no cumple la política, o el correo o el nombre son inválidos, **cuando** envío el formulario, **entonces** el sistema lo rechaza indicando el motivo.
4. La contraseña **nunca** se almacena en texto plano (hash `scrypt` con sal).
5. El registro queda en la bitácora (`REGISTRO`).

## HU-02: Inicio de sesión seguro

**Como** usuario registrado **quiero** iniciar sesión con mi correo y contraseña **para** usar las funcionalidades de mi perfil.

**Criterios de aceptación**

1. **Dado** que mis credenciales son correctas y mi cuenta está activa, **cuando** inicio sesión, **entonces** se crea una sesión (cookie `HttpOnly`, `SameSite=Strict`, válida 8 horas) y veo el menú correspondiente a mis permisos.
2. **Dado** que el correo no existe o la contraseña es incorrecta, **cuando** intento iniciar sesión, **entonces** veo el mismo mensaje genérico "Correo o contraseña incorrectos" en ambos casos.
3. **Dado** que fallo 5 veces seguidas, **cuando** vuelvo a intentarlo, **entonces** la cuenta queda bloqueada 15 minutos, incluso con la contraseña correcta (HTTP 423).
4. **Dado** que mi cuenta fue desactivada, **cuando** inicio sesión con las credenciales correctas, **entonces** se me niega el acceso.
5. Los inicios de sesión correctos, fallidos y los bloqueos quedan en la bitácora.

## HU-03: Cierre de sesión

**Como** usuario autenticado **quiero** cerrar mi sesión **para** que nadie más pueda usarla desde este equipo.

**Criterios de aceptación**

1. **Dado** que tengo una sesión abierta, **cuando** presiono "Cerrar sesión", **entonces** vuelvo a la pantalla de inicio con el mensaje "Sesión cerrada correctamente".
2. La sesión se **elimina en el servidor**: si alguien reutiliza la cookie anterior, recibe 401.
3. El cierre queda en la bitácora (`LOGOUT`).

## HU-04: Administración de usuarios

**Como** administrador **quiero** ver los usuarios registrados y activarlos, desactivarlos o desbloquearlos **para** controlar quién puede entrar al sistema.

**Criterios de aceptación**

1. **Dado** que tengo el permiso `usuarios.ver`, **cuando** abro *Usuarios*, **entonces** veo el nombre, el correo, el estado (Activo, Inactivo o Bloqueado), los roles y el último acceso de cada usuario.
2. **Dado** que desactivo a un usuario, **entonces** todas sus sesiones abiertas se cierran de inmediato y ya no puede iniciar sesión.
3. **Dado** que un usuario está bloqueado por intentos fallidos, **cuando** presiono "Desbloquear", **entonces** puede volver a iniciar sesión.
4. No puedo desactivar mi propia cuenta, y el sistema no permite quedarse sin ningún administrador activo.

## HU-05: Asignación de roles a usuarios

**Como** administrador **quiero** asignar uno o varios roles a cada usuario **para** otorgarle exactamente los accesos que su trabajo requiere.

**Criterios de aceptación**

1. **Dado** que tengo el permiso `usuarios.gestionar`, **cuando** marco roles para un usuario y guardo, **entonces** sus permisos se actualizan **de inmediato**, sin que tenga que volver a iniciar sesión.
2. Un usuario debe tener al menos un rol, y solo se aceptan roles existentes.
3. No puedo quitarme a mí mismo el rol Administrador.
4. Un usuario sin `usuarios.gestionar` no puede asignar roles, ni siquiera a sí mismo (403).
5. El cambio queda en la bitácora con los roles anteriores y los nuevos (`ASIGNAR_ROLES`).

## HU-06: Gestión de roles y permisos

**Como** administrador **quiero** crear roles y definir qué permisos tiene cada uno **para** adaptar el control de acceso a nuevas responsabilidades sin modificar el código.

**Criterios de aceptación**

1. **Dado** que tengo `roles.gestionar`, **cuando** abro *Roles y permisos*, **entonces** veo una matriz de permisos (agrupados por módulo) por rol.
2. Puedo crear un rol con un nombre único; los nombres duplicados se rechazan sin distinguir mayúsculas.
3. **Cuando** marco o desmarco permisos de un rol y guardo, **entonces** el cambio aplica de inmediato a todos los usuarios con ese rol.
4. El rol Administrador no se puede editar (siempre tiene todos los permisos). Los roles base no se pueden eliminar, y tampoco un rol que esté asignado a algún usuario.
5. Las operaciones quedan en la bitácora (`CREAR_ROL`, `ACTUALIZAR_PERMISOS` con permisos agregados y quitados, `ELIMINAR_ROL`).

## HU-07: Restricción de funcionalidades según el perfil

**Como** responsable de la plataforma **quiero** que cada usuario solo pueda usar las funcionalidades de su perfil **para** proteger la información y las operaciones del negocio.

**Criterios de aceptación**

1. **Dado** que no he iniciado sesión, **cuando** llamo a cualquier endpoint protegido, **entonces** recibo 401.
2. **Dado** que mi perfil no tiene el permiso requerido, **cuando** accedo a la funcionalidad (aunque escriba la URL a mano o llame directamente a la API), **entonces** recibo **403 Acceso denegado** y el intento queda en la bitácora (`ACCESO_DENEGADO`).
3. El menú solo muestra los módulos a los que tengo acceso, y en cada módulo solo veo los botones de gestión si tengo el permiso `*.gestionar`.
4. Con los roles iniciales:
   - **Cliente:** consulta propiedades y diseños.
   - **Agente Inmobiliario:** además publica y elimina propiedades.
   - **Arquitecto:** además crea y elimina diseños.
   - **Administrador:** acceso total.

## HU-08: Bitácora de auditoría

**Como** administrador **quiero** consultar un registro de las operaciones de seguridad **para** saber quién hizo qué, cuándo y desde dónde.

**Criterios de aceptación**

1. Cada evento registra fecha y hora, usuario (o correo intentado), acción, detalle e IP.
2. Se registran como mínimo: `REGISTRO`, `LOGIN`, `LOGIN_FALLIDO`, `LOGIN_BLOQUEADO`, `CUENTA_BLOQUEADA`, `LOGOUT`, `ACCESO_DENEGADO`, `ASIGNAR_ROLES`, `ACTIVAR_USUARIO`, `DESACTIVAR_USUARIO`, `CREAR_ROL`, `ACTUALIZAR_PERMISOS`, `ELIMINAR_ROL`, `CREAR_*` y `ELIMINAR_*`.
3. Solo los usuarios con `auditoria.ver` pueden consultarla, y se puede filtrar por tipo de acción.
4. La bitácora es de solo lectura: no hay ningún endpoint para modificar ni borrar registros.
