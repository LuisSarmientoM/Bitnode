# Primera base de Notas

Entrega autorizada por el usuario mediante la opción "Notas funcionales de punta a punta". Incluye código y dependencias para Angular/NestJS/SQLite y un recorrido de crear, listar, abrir y editar notas Markdown. La aceptación visual final de la pantalla por el usuario sigue pendiente.

## Versión y SQLite

La primera versión es `v0.1.0`, definida en `package.json` y visible en la UI. `npm run db:init` prepara SQLite sin servidor usando el mismo bootstrap que el arranque web; repetirlo conserva las notas. El comando se ejecutó sobre la base local existente y mantuvo su nota. Los archivos de `.data/`, `.pi/`, `.codegraph/` y `.stitch.json` se excluyen de la publicación.

## Usar y revisar

1. Ejecutar `npm ci` y `npm run dev` con Node 26 y npm 11.
2. Abrir http://127.0.0.1:3000 y crear una nota con título o contenido.
3. Guardar, modificar y recargar. La nota permanece en `.data/bitnode.sqlite`.
4. Consultar [README](../README.md) para los comandos, límites y precauciones.

## Alcance real

| Incluido | Pendiente |
|---|---|
| Listado paginado por última modificación, apertura y edición. | Búsqueda global y filtros por contexto. |
| Markdown y vista previa sin HTML del usuario ni imágenes remotas. | Adjuntos y recursos externos, fuera del alcance general. |
| Título generado y persistido al crear sin título. | Vínculos, etiquetas y colores. |
| Guardado explícito, aviso antes de descartar, conflictos de revisión y errores visibles. | Recuperación del borrador tras un fallo del navegador. |
| SQLite real, WAL, migración inicial, transacciones de edición y espera busy de 3 segundos. | Mantenimiento, backup/restauración, purgas, FTS y actividad global. |
| Servidor limitado a loopback y origen propio, solo JSON para escrituras. | Login, sesiones, HTTPS, acceso LAN y CLI autónoma. |

No se han completado las unidades T1–T4 o T12 del plan global. No hay migraciones ni tablas vacías para los módulos pendientes. Las notas de esta primera versión no generan un historial global de Actividad retroactivo.

## Contrato inicial

- `GET /api/v1/notes?offset=0&limit=50` devuelve `{items,total,offset,limit}`. Máximo 200 por solicitud; la UI usa 50.
- `GET /api/v1/notes/:id` devuelve la nota completa.
- `POST /api/v1/notes` recibe `{title?,body?}`. Al menos uno debe contener texto.
- `PATCH /api/v1/notes/:id` recibe `{title?,body?,expectedRevision}`. Requiere un campo editable; no admite campos desconocidos ni `null`.
- La nota contiene `id`, `title`, `body`, `revision`, `createdAt` y `updatedAt`. Los tiempos son milisegundos UTC; la UI muestra Colombia.
- El título generado usa el primer encabezado ATX o la primera línea con contenido, elimina marcadores básicos y se recorta a 500 puntos Unicode. Su edición posterior es explícita. No se reinterpreta todo Markdown para generar el título.
- Conflicto de revisión devuelve 409; base ocupada, 503; datos inválidos, 400. Ninguno descarta el borrador de la UI.
- Un fallo de conexión después de enviar una escritura deja resultado incierto. No hay reintento automático ni garantía de idempotencia de creación. Consultar las notas en otra pestaña antes de repetir el guardado.

## Verificación ejecutada

Entorno local macOS arm64 con Node 26.10.0 y npm 11.19.1. Versiones exactas y árbol resuelto en `package.json` y `package-lock.json`.

| Comprobación | Evidencia |
|---|---|
| `npm test` | 15 pruebas aprobadas, incluida inicialización idempotente sin servidor con permisos locales, schema1, WAL e integridad: validaciones, Markdown seguro, SQLite al reabrir, revisiones entre conexiones, versión futura, paginación, API, JSON/origen/Host y bloqueo SQLite real sin escritura parcial. |
| `npm run typecheck` | Exit 0 para backend, core, db y tests. |
| `npm run build` | Exit 0. Angular comprobó tipos y plantillas y generó un bundle inicial de 259,60 kB sin recursos externos. |
| `npm run test:e2e` | 6 recorridos aprobados con Chromium: navegación lenta, paginación, creación/edición/recarga, borrador ante fallo, conflicto y vista móvil/preview seguro. |
| Arranque real de `main.ts` | Exit 0. Sirvió web/API, creó una nota en base temporal y la recuperó tras detener y reiniciar el proceso. Cierre por SIGTERM aprobado. |
| `npm audit` | 0 vulnerabilidades informadas en el árbol instalado al ejecutar la comprobación. No implica garantía sobre futuras vulnerabilidades. |
| LSP activo | No emitió errores, pero dejó varios archivos inconclusos. No se presenta como prueba de limpieza; se complementa con TypeScript y build Angular. |

Se observaron fallos reales antes de implementar core, SQLite, API, preview y el recorrido inicial de navegador. Una ejecución posterior dio 3/4 y timeout en conflicto; la recarga innecesaria de una nota ya seleccionada se corrigió antes del resultado 6/6. Revisar capturas también detectó estilos bloqueados por CSP: se desactivó `inlineCritical` en Angular sin permitir scripts inline.

Las capturas generadas quedan en `test-results/notas-desktop.png` y `test-results/notas-mobile.png`. Las pruebas usan bases temporales, no notas del usuario. Esto no acredita CLI, LAN, autenticación, distribución ni pruebas multiproceso del sistema completo.

## Revisión técnica pendiente

El intento de revisión nativa devolvió `lens_context_budget_exceeded` en preflight y `next_action: stop`. No se creó autoridad de revisión ni una aprobación. El candidato del workspace incluye los cambios documentales previos y la base nueva; su evidencia completa supera el presupuesto. No repetir el mismo START ni usar reset/recover.

La continuación nativa pide dividir en candidatos menores mediante commits y consultar un status nuevo. El usuario autorizó después publicar `v0.1.0` en `LuisSarmientoM/Bitnode`; se preparan commits separados para documentación/diseños y base ejecutable. La primera revisión de workspace sigue sin aprobación. Las pruebas funcionales y el build aprobados no sustituyen esa revisión pendiente.

El intento adicional del verificador independiente no arrancó porque su modelo configurado no estaba disponible. No se modificó su configuración ni se atribuyó una validación inexistente. Las exportaciones previas de `design/` conservan espacios finales originales; `git diff --check` los detecta y no se presentan como código limpio.

## Próximo paso

Revisar visualmente la pantalla con el usuario. Acordar una sola ampliación de Notas antes de añadir módulos, archivo/papelera o conexiones con otros registros. Mantener P7 pendiente para Hoy/Tareas, sin bloquear este módulo.
