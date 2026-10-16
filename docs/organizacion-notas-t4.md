# Organización de Notas y acceso seguro

Implementación autorizada en tres entregas verificables, sin publicación ni push. Conservar datos locales y la interfaz mínima de Notas. No incluir carpetas, archivo, papelera, vínculos ni otros módulos.

## Entregas

| Unidad | Alcance | Estado |
|---|---|---|
| 1 | Búsqueda en título/contenido y orden de lista | Commit `909993e`; RDD aprobado y reconocido, 22 tests y 14 E2E aprobados. |
| 2 | Etiquetas inmutables, asignaciones y filtros Todas/Cualquiera | Implementación en verificación; pendiente de revisión. |
| 3 | T4: contraseña, sesiones, reset CLI, CSRF y HTTPS guiado | Pendiente de concretar detalles de operación. |

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

Base T4 escrita sin integrar ni dar por terminada: `apps/server/src/auth-store.ts`, `apps/cli/src/auth.ts`, `apps/server/test/auth.test.ts` y scripts `auth:setup`/`auth:reset`. Identidad en `<BITNODE_DB>.auth.sqlite`, permisos 0600, Argon2id de Node, token de sesión almacenado como SHA-256, reset transaccional y límite global de diez intentos en quince minutos. Sesiones sin TTL por acuerdo previo; cookie de navegador pendiente. No usa dependencias nuevas ni modifica las notas.

RED de auth observado por módulo ausente; GREEN focalizado 2/2 y typecheck exit 0. Setup y reset se ejecutaron en PTY real contra identidad temporal, exit 0 y sin eco de contraseña. No se configuró identidad real del usuario. El verificador independiente ejecutó las pruebas focalizadas y typecheck sin bloqueantes, y confirmó ausencia de mutaciones del repositorio. Quedan revisión nativa y toda integración HTTP/CSRF/login/TLS. Se conservan como límites las carreras de reemplazo del archivo por un proceso local con acceso al directorio y la falta de pruebas específicas de permisos/concurrencia.

Los primeros intentos de verificación no arrancaron por un modelo antiguo. Se localizó la referencia en el perfil `Max` de Gentle Shell. `/reload` conserva ese perfil por diseño; el usuario adoptó `No-opencode` mediante Enter en `/gentle:profiles` y el verificador terminó correctamente. No se modificaron los archivos de configuración. **El servidor actual sigue sin autenticación ni HTTPS. T4 no está completo.**
