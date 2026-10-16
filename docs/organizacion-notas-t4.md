# Organización de Notas y acceso seguro

Implementación autorizada en tres entregas verificables, sin publicación ni push. Conservar datos locales y la interfaz mínima de Notas. No incluir carpetas, archivo, papelera, vínculos ni otros módulos.

## Entregas

| Unidad | Alcance | Estado |
|---|---|---|
| 1 | Búsqueda en título/contenido y orden de lista | Commit `909993e`; RDD aprobado y reconocido, 22 tests y 14 E2E aprobados. |
| 2 | Etiquetas inmutables, asignaciones y filtros Todas/Cualquiera | Commit `10dfe33`; RDD reconocido, 25 tests y 15 E2E aprobados. |
| 3 | T4: contraseña, sesiones, reset CLI, CSRF y HTTPS guiado | Base credenciales/reset en `9fc6b76`, RDD reconocido. Middleware HTTP en verificación. Arranque HTTPS y pantalla de acceso pendientes. |

## Búsqueda y orden

Escribir la consulta y pulsar Aplicar. Vaciarla y aplicar vuelve a la lista completa. Los filtros aplicados se conservan al paginar y guardar. Aplicarlos con cambios sin guardar pide confirmación; cancelar conserva el borrador y los resultados actuales.

`GET /api/v1/notes` admite `q` y `sort=updated|title|created`, además de la paginación existente. La consulta admite hasta 500 puntos Unicode. Valores repetidos, no textuales u órdenes desconocidos devuelven 400. Con consulta se fuerza orden por título; sin consulta se conserva última modificación por defecto y se permiten título o creación descendente. El ID desempata de forma estable.

La búsqueda exige todos los términos, con palabras completas o prefijos, en título y contenido combinados. No interpreta operadores. Normaliza mayúsculas y acentos vocálicos, conserva ñ y no modifica el Markdown guardado.

Esta primera entrega usa funciones deterministas de SQLite y filtra antes de contar y paginar. No cambia schema1, no agrega dependencias ni implementa el índice FTS5 global de T17. Recorre las notas; no se ha validado rendimiento para colecciones grandes.

## Evidencia de unidad 1

- RED: `npx tsx --test packages/core/test/note-query.test.ts`, exit 1 porque faltaba el módulo nuevo.
- GREEN: `npm test`, 22 pruebas aprobadas. Cubren normalización, prefijos, términos entre campos, ñ, paginación filtrada, edición y parámetros API inválidos.
- `npm run typecheck`, exit 0 tras corregir accesos posiblemente vacíos en pruebas nuevas.
- `npm run test:e2e`, exit 0, 14 recorridos Chromium, incluido build Angular y búsqueda móvil/escritorio con protección del borrador.
- Captura móvil revisada: `test-results/notas-busqueda-mobile.png`. Sin desbordamiento horizontal a 390px.
- LSP activo no confirmó limpieza de todos los archivos; Nest se comprobó con configuración inferida. TypeScript del proyecto y build Angular son la evidencia de tipos y plantillas.

La reversión de unidad 1 retira `note-query.ts`, sus pruebas y el recorrido `search.spec.ts`, y revierte la integración de consulta/controles en repositorio, API y UI. No requiere reversión de datos ni de esquema.

## Reglas de unidad 2

Etiquetas planas con nombre único normalizado, color opcional inmutable desde creación, incluso su ausencia. No renombrar, fusionar ni borrar. Quitar una asignación no borra la etiqueta. Modificar asignaciones usa la revisión de la nota. Filtro Todas por defecto y Cualquiera alternativo.

`GET/POST /api/v1/tags` lista/crea etiquetas; no hay PATCH/DELETE. `tagIds` en POST/PATCH de Notas guarda asignaciones y contenido en una transacción, en lugar del PUT independiente propuesto para el producto completo. Nombre de 1–100 puntos Unicode, color `#RRGGBB` opcional y hasta 100 IDs por nota. Duplicado de nombre normalizado devuelve 409. Lista acepta `tagIds` separados por coma y `tagMode=all|any`. UI agrupa los controles en desplegables.

Schema2 agrega `tags` y `note_tags` sin cambiar las notas existentes. Migración y asignaciones se verifican con SQLite temporal; no se ejecutaron sobre los datos del usuario. La versión anterior del ejecutable rechaza schema2: no intentar downgrade de la base; conservar copia previa antes de arrancar la nueva versión con datos reales.

RED: dos pruebas fallaron por `createTag` inexistente. GREEN focalizado: tres pruebas de migración, unicidad, rollback y filtros. La primera suite completa agotó 30s sin causa confirmada; el usuario autorizó otra ejecución y aprobó 25 pruebas y typecheck. E2E detectó TS5097 y luego un selector de etiqueta ambiguo; se corrigieron. Verificación final: `npm test && npm run typecheck && npm run test:e2e && git diff --check`, exit 0, 25 pruebas y 15 E2E/build aprobados. Captura móvil de etiquetas revisada. RDD `review-aba2104d311526f3` aprobado y reconocido; commit `10dfe33`.

## T4

El usuario confirmó una sola contraseña para Mac y dispositivos de la misma red, sin cuentas, roles, OAuth ni servicios externos. Eligió CA local guiada. Autenticar tanto loopback como LAN, invalidar sesiones al reset y no degradar a HTTP LAN. No instalar confianza de certificados, modificar Keychain ni abrir firewall sin autorización concreta. Validar seguridad independientemente y con pruebas de API/navegador. No afirmar acceso desde otro dispositivo sin prueba real allí.

Base T4 escrita sin integrar ni dar por terminada: `apps/server/src/auth-store.ts`, `apps/cli/src/auth.ts`, `apps/server/test/auth.test.ts` y scripts `auth:setup`/`auth:reset`. Identidad en `<BITNODE_DB>.auth.sqlite`, permisos 0600, Argon2id de Node, token de sesión almacenado como SHA-256, reset transaccional y límite global de diez intentos en quince minutos. Sesiones sin TTL por acuerdo previo. El middleware HTTP usa una cookie de sesión de navegador sin vencimiento persistente. No usa dependencias nuevas ni modifica las notas.

RED de auth observado por módulo ausente; GREEN focalizado 2/2 y typecheck exit 0. Setup y reset se ejecutaron en PTY real contra identidad temporal, exit 0 y sin eco de contraseña. No se configuró identidad real del usuario. El verificador independiente ejecutó las pruebas focalizadas y typecheck sin bloqueantes, y confirmó ausencia de mutaciones del repositorio. La revisión nativa high `review-0373107c85a90b35` quedó aprobada y reconocida sobre el commit `9fc6b76`, aislado en un worktree para excluir los cambios HTTP concurrentes. Los revisores anotaron sin bloquear el posible bloqueo global de intentos y el consumo de intentos cuando el hash está ocupado. Se conservan como límites las carreras de reemplazo del archivo por un proceso local con acceso al directorio y la falta de pruebas específicas de permisos/concurrencia.

Los primeros intentos de verificación no arrancaron por un modelo antiguo. Se localizó la referencia en el perfil `Max` de Gentle Shell. `/reload` conserva ese perfil por diseño; el usuario adoptó `No-opencode` mediante Enter en `/gentle:profiles` y el verificador terminó correctamente. No se modificaron los archivos de configuración.

### Middleware HTTP

`createApp` acepta `auth` y `httpsOptions`. Si recibe auth sin TLS, rechaza el arranque. Solo los endpoints de pre-sesión y login son públicos dentro de la API. El resto exige la cookie `__Host-bitnode`, con Secure, HttpOnly, SameSite=Strict y Path=/, sin Max-Age ni Expires. Toda mutación exige Origin exacto y `x-csrf-token`, incluido DELETE. Logout invalida la sesión en SQLite y borra la cookie.

El login requiere JSON y un CSRF de pre-sesión vinculado a una cookie separada. La pre-sesión dura diez minutos y admite hasta 128 entradas en memoria. Cada intento la consume, así que un fallo requiere pedir otra antes de reintentar. No hay excepción para localhost, User-Agent ni ausencia de Origin. Las rutas normalizadas de API llevan `Cache-Control: no-store`, incluidos alias en mayúsculas.

El escritor no capturó RED del middleware inicial. El padre sí observó RED del defecto de caché en `/API/v1/auth/session`, por falta de no-store, y GREEN tras corregirlo. `npx tsx --test apps/server/test/auth-http.test.ts apps/server/test/lan.test.ts`: seis pruebas aprobadas. `npm test`: 31 aprobadas. `npm run typecheck` y `git diff --check`: exit 0. Se usaron certificados y SQLite temporales en loopback, sin Keychain, firewall ni datos reales. El verificador independiente repitió las seis pruebas y typecheck con exit 0, sin bloqueantes ni mutaciones del repositorio. Anotó como límites la expulsión de pre-sesiones al alcanzar el tope y el parseo de JSON antes de exigir sesión. Commit `92ffb42`; RDD high `review-75534612f978d716` aprobado y reconocido, sin correcciones. Avisos no bloqueantes sobre inundación de pre-sesiones, cobertura adicional y observabilidad de errores 500.

Revertir esta unidad elimina `auth-http.ts` y su prueba y retira las opciones y el montaje de auth en `app.ts`; no toca notas ni identidad. Las pruebas HTTPS ejercitan login, sesión, mutaciones y logout reales en loopback. No prueban confianza de CA en navegador ni acceso LAN físico.

### Preparación de certificados

`npm run tls:setup` prepara `<BITNODE_DB>.tls`, o `.data/bitnode.sqlite.tls` por defecto. Usa OpenSSL del equipo, sin dependencias npm nuevas. Para incluir la IP privada que tendrá el servidor, ejecutar con el mismo `BITNODE_DB` y `BITNODE_LAN_HOST` previsto para arrancar. Cambiar de IP requiere otro certificado con ese SAN; no basta con cambiar la variable.

La carpeta debe ser nueva. El comando no sobrescribe certificados ni claves existentes y no abre el puerto del servidor. Genera una CA de diez años y un certificado de servidor de 397 días, RSA de 2048 bits y SHA-256, con SAN para localhost, 127.0.0.1 y la IP LAN opcional. Carpeta 0700 y claves 0600. La carga rechaza archivos simbólicos, propietarios/permisos de clave incorrectos, pareja clave/certificado distinta, fechas inválidas, firma de otra CA o SAN ausentes.

El comando imprime la ruta de `ca.pem` y su huella SHA-256, nunca las claves. Guarda `ca-key.pem` y `server-key.pem` solo en este Mac o en una copia privada. No los transfieras a los dispositivos. Solo se comparte `ca.pem`, por un canal controlado, y se compara su huella con la impresa en el Mac. Confiar en esta CA permite aceptar certificados que firme su clave; no importarla en equipos ajenos.

La confianza se instala manualmente, después de decidirlo expresamente:

1. En el Mac, importar solo `ca.pem` en Acceso a Llaveros, comprobar la huella y habilitar confianza para SSL de esa CA.
2. En otro dispositivo, importar la CA mediante el mecanismo de certificados del sistema. En iOS, instalar el perfil y después habilitar esa raíz en Ajustes, General, Información, Ajustes de confianza de certificados. Comparar la huella antes de confiar.
3. Cuando el servidor HTTPS esté integrado, abrir la URL con un nombre o IP incluido en sus SAN. No continuar ignorando un error del certificado.

No hay renovación automática. No borrar la carpeta para resolver un error sin planear antes la renovación y la confianza de los dispositivos. Ningún comando de esta unidad modifica Keychain, almacenes de confianza ni firewall.

Evidencia: RED de `tls.test.ts` por módulo ausente, exit 1. GREEN de una prueba con TLS real confiando explícitamente en la CA, rechazo sin ella, SAN distinto, sobrescritura rechazada sin cambiar la CA, fecha simulada vencida, permisos y symlink. Typecheck incluye ahora ambas CLI, antes omitidas del tsconfig raíz. `npm run tls:setup` se ejercitó en un directorio temporal, exit 0, sin crear notas ni identidad real. La suite completa aprobó 32 pruebas y typecheck, con exit 0. El verificador independiente repitió TLS y typecheck sin bloqueantes ni cambios al repositorio. Advirtió que la CA no tiene restricciones de nombres y que su clave vive junto a la del servidor. La carga no valida EKU ni permisos de la clave de CA, que no necesita para servir HTTPS. La limpieza ante fallos de OpenSSL y un certificado firmado por otra CA no tienen prueba específica. Revisión nativa y commit de certificados pendientes. Revertir esta unidad retira `tls.ts` de servidor y CLI, su prueba y el script; no borra certificados creados por un operador.

**`main.ts` aún no pasa auth ni TLS. El servidor de producción sigue sin autenticación ni HTTPS. T4 no está completo.**
