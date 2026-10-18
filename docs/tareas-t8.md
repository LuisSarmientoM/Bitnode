# T8: jerarquía y transiciones

Creación de subtareas implementada en core, SQLite, API y web. Cambiar/quitar padre en `3a16c1a` con corrección `3456380`, revisado. Estados simples y finalización con schema v7 en `952efa6`, revisado y con verificación independiente. UI de reparentado en `4a2be30`. Cancelar y reabrir con efectos aceptados en backend y API, verificados. UI de estados, cancelación y reapertura en la pantalla de Tareas. La CLI queda excluida.

## Contrato disponible

`POST /api/v1/tasks` admite `parentId` y exige `expectedParentRevision` si el padre no es null. Ejemplo:

```json
{"projectId":"p1","parentId":"t1","expectedParentRevision":2,"title":"Revisar detalle"}
```

Omitir padre o enviar null crea raíz; en ese caso no se admite revisión del padre. La tarea nace nueva, sin prioridad y con revisión 1. GET y listado devuelven parentId. PATCH sigue rechazando padre, proyecto y estado.

## Reglas y decisiones

- Proyecto active/paused, padre existente del mismo proyecto, padre y todos sus ancestros abiertos. Un cerrado exige reapertura previa explícita; este comando no reabre nada.
- La revisión del padre se compara dentro de la transacción IMMEDIATE, junto con proyecto y ancestros. Una edición concurrente previa del padre devuelve conflicto; no se toma una revisión fresca para sobrescribir la intención del consumidor.
- Crear una hija no cambia datos ni revisión del padre. No hay preview de rama ni efectos aceptados en esta acción simple. La futura composición de ramas deberá comparar membresía, no solo revisión de raíz.
- La FK compuesta diferible de v6 ya garantiza mismo proyecto. No se modifica ni reconstruye esquema. El ID nuevo generado por aplicación no admite un padre que sea él mismo ni uno de sus descendientes, porque aún no existen. Al reparentar, la consulta de ancestros del nuevo padre rechaza la propia tarea y cualquiera de sus descendientes.
- Cliente archivado bloquea crear/reactivar proyecto y la futura reapertura. No se añade una prohibición independiente de creación de tarea en proyecto active/paused: se conserva la regla existente. En estados coherentes, archivar cliente ya exige ausencia de proyectos active/paused.
- Errores HTTP: 404 NOT_FOUND para padre ausente; 409 CONFLICT con reason REVISION_MISMATCH, PROJECT_CLOSED, PARENT_PROJECT_MISMATCH o PARENT_CLOSED. Forma inválida devuelve 400 VALIDATION_ERROR.

Fuentes: [dominio](diseno-tecnico/dominio.md#tareas-y-transiciones), [datos](diseno-tecnico/datos.md#jerarquía) y [alcance](revision-alcance-local.md#relaciones-y-reglas-que-no-deben-romperse).

## Evidencia de esta unidad

Comando RED y GREEN, timeout 30 segundos, con fixtures temporales aisladas:

`./node_modules/.bin/tsx --test packages/core/test/tasks.test.ts packages/db/test/tasks.test.ts apps/server/test/tasks.test.ts`

- RED: código 1, 19 pasan y 4 fallan. API respondió 400 en lugar de 201; DB rechazó expectedParentRevision como campo desconocido; core no devolvía el padre normalizado.
- GREEN: código 0, 23 pasan, 0 fallan. Incluye multinivel, padre inexistente/ajeno, revisión obsoleta, padre/ancestro done o cancelled, proyecto cerrado, ausencia de cambios parciales y rechazo de parentId por PATCH.
- Verificación del padre: `npm run typecheck && npm test`, código 0; 156 pruebas aprobadas, cero fallos. LSP confirmó un archivo limpio y dejó cinco inconclusos, sin diagnósticos recibidos; no se presenta como validación global.
- E2E UI: RED real, código 1 por ausencia del botón Crear subtarea. Tras implementar, `BITNODE_E2E_PORT=3118 npx playwright test tests/e2e/tasks.spec.ts` pasó con código 0 y 11 pruebas aprobadas. Incluye escritorio/móvil, foco, proyecto fijo, revisión del padre, conservación de borrador y consulta del padre fuera de la página. El rechazo de ancestro cerrado se simula en HTTP en una prueba UI; su regla real está cubierta en DB/API.
- No se verificó concurrencia multiproceso.

## Web de creación

Crear subtarea consulta el padre por ID al abrir el formulario y fija su proyecto. Guarda la revisión leída al abrir, sin refrescarla al enviar. Ante conflicto conserva el texto y pide cancelar y volver a abrir explícitamente. Al editar una hija, consulta el padre por ID aunque no esté en la página de resultados. No construye un árbol incompleto desde la lista paginada.

## Revisión de la primera unidad

Commit local `744cae5`, 193 líneas añadidas más eliminadas. Revisión nativa `review-e31e7d4d4e6173d8`, sobre `f5d0b50..744cae5`, aprobada con cuatro lentes y reconocida en el worktree local `bitnode-t8-review`. No cubre la UI ni el resto de T8. Observaciones no bloqueantes: consulta de ancestros inline y falta de prueba específica de terminación ante un ciclo corrupto. No abrieron corrección ni requieren repetir ese candidato.

## Revisión de la UI de creación

Commit local `e2ac786`, 162 líneas authored. Revisión `review-eae8b17feaac52fa`, sobre `744cae5..e2ac786`, aprobada con tres lentes y reconocida. No bloqueantes: ternario del título repetido, relectura no nula del padre, reset de contexto en fill, casos negativos incompletos en UI, edición acoplada a consulta del padre y recuperación de conflicto que exige copiar/cancelar el borrador. Ninguna observación abrió corrección; quedan como trabajo posterior separado.

## Cambiar y quitar padre, segunda unidad backend

- `POST /api/v1/tasks/:id/reparent` recibe `{expectedRevision, parentId, expectedParentRevision}`. `parentId` debe ser un string no vacío; null se rechaza. No se refrescan revisiones al guardar.
- `POST /api/v1/tasks/:id/detach` recibe solo `{expectedRevision}` y convierte la tarea en raíz del mismo proyecto.
- Ambas acciones devuelven HTTP 200 con la tarea. Reparentar valida proyecto active/paused, padre del mismo proyecto, revisión del padre y todos sus ancestros abiertos. Ciclo directo o indirecto devuelve 409 CONFLICT con reason HIERARCHY_CYCLE. Los demás errores conservan los reasons de creación.
- Separar no exige reactivar proyecto: no hay nuevo destino ni cambio de atribución. La tarea movida puede estar abierta o cerrada; no se añade una restricción por su estado. Un padre nuevo cerrado se rechaza incluso para una rama cerrada, sin reapertura implícita.
- Dentro de IMMEDIATE se verifica primero la revisión de la tarea. Reparentar comprueba además la revisión del padre y las restricciones actuales antes de reconocer un no-op. Separar una raíz con revisión vigente no escribe. Un cambio real incrementa solo revisión/updated_at de la tarea movida; proyecto, datos, estado y descendientes quedan intactos.
- No requiere confirmación de cascada: no cambia estados, proyecto ni descendientes. PATCH sigue sin acceso a jerarquía. Las transiciones futuras deben redescubrir membresía y revisiones, no confiar solo en raíz.

Mismo comando enfocado documentado arriba, timeout 30 segundos, fixtures aisladas:

- RED inicial: código 1, 23 pasan y 5 fallan. Faltaban parsers/métodos de jerarquía y las rutas devolvían 404.
- Ejecución intermedia: código 1, 28 pasan y 1 falla. NestJS devolvía 201 en acciones; se añadió HttpCode(200) explícito.
- GREEN: código 0, 29 pasan y 0 fallan, 2,19 s. Añade no-op, self/ciclo multinivel, padre ausente/ajeno, ancestros cerrados, proyecto cerrado, tarea cerrada, conservación de rama y rollback tras UPDATE mediante trigger de fixture.
- Dos conexiones SQLite independientes verifican escrituras secuenciales con revisión obsoleta de tarea/padre, incluidos no-op. No prueba contención ni carrera multiproceso.
- Verificación del padre: `npm run typecheck && npm test`, código 0 y 162 pruebas aprobadas. LSP activo confirmó dos archivos limpios y dejó cuatro inconclusos, sin hallazgos recibidos. Revisión nativa `review-3cfda30cb914bbab`, sobre `e2ac786..3a16c1a`, con cuatro lentes. El refutador confirmó un hallazgo CRITICAL causado por la unidad: el helper compartido cambiaba el mensaje PARENT_CLOSED de crear subtarea por el de cambiar jerarquía. La corrección acotada `3456380` pasa la acción al helper y fija el mensaje exacto en la prueba de creación (RED observado, GREEN 29/29). El validador dirigido la aprobó y la revisión quedó reconocida. Observaciones no bloqueantes: non-null de la revisión del padre y mensaje compartido parametrizado.

## Estados simples y finalización, tercera unidad backend

`POST /api/v1/tasks/:id/change-state` recibe `{expectedRevision, state}` y devuelve HTTP 200 con la tarea. Solo admite new/in_progress/blocked/in_review/done. Estado cancelled y campos desconocidos se rechazan con 400. PATCH no permite estado ni lastCompletedAt. blockedReason opcional queda fuera de esta unidad.

- Entre abiertas no hay flujo obligatorio. Antes de guardar se exige proyecto active/paused y todos los ancestros abiertos, incluso si el destino es el mismo estado abierto.
- Desde done/cancelled hacia abierta devuelve 409 CONFLICT, reason REOPEN_REQUIRED; requiere el futuro comando reopen, nunca reapertura implícita.
- Completar vuelve a consultar toda la descendencia bajo IMMEDIATE y bloquea cualquier descendiente abierto con OPEN_DESCENDANTS, también desde cancelled. No cambia descendientes cerrados. Completar puede resolver una abierta en un contexto cerrado, porque no crea ninguna abierta.
- Revisiones obsoletas devuelven REVISION_MISMATCH antes de reconocer no-op. done→done conserva revisión, updatedAt y lastCompletedAt. Un cierre real toma un único Date.now dentro de escritura para updatedAt y lastCompletedAt, antes del commit; si falla, todo revierte.
- Migración v7: ALTER TABLE agrega last_completed_at INTEGER nullable dentro de la transacción de migración existente. No reconstruye tablas ni inventa fechas de finalización históricas: quedan null. DTO Task, GET y listado exponen lastCompletedAt. Las fixtures de versión actual pasan a 7 y de versión futura a 8; rollback histórico conserva sus versiones originales.
- No implementa cancel/reopen, aceptación ni timers. Cancelar desde done deberá conservar lastCompletedAt; reabrir deberá limpiarlo. Estas reglas quedan pendientes, no se simulan mediante change-state.

Comando enfocado, timeout 30 segundos, fixtures aisladas:

`./node_modules/.bin/tsx --test packages/core/test/tasks.test.ts packages/db/test/tasks.test.ts packages/db/test/task-states.test.ts apps/server/test/tasks.test.ts`

RED: código 1, 28 pasan y 7 fallan por rutas/métodos/migración ausentes, campo undefined y versión 6 en lugar de 7. GREEN: código 0, 35 pasan y 0 fallan. Reloj controlado, no-op, descendencia multinivel en los cuatro estados abiertos, cancelled→done, ancestros/proyecto cerrados, rollback tras UPDATE y rollback transaccional del ALTER cubiertos. Verificación del padre sobre esta unidad junto con la UI de reparentado sin confirmar: `npm run typecheck` correcto, `npm test` con 168 pruebas aprobadas y cero fallos, y 13 E2E de Tareas aprobados. No se ejecutó base real ni pruebas multiproceso. Abrir la base local real con esta versión la migraría a v7; no se hizo.

Revisión `review-4cad1f83d4db7387`, sobre `3456380..952efa6`, aprobada con cuatro lentes y reconocida, sin correcciones. Verificación independiente por tratarse de una migración: PASS en conservación de filas, rollback a v6, rechazo de v8, rechazo de v7 por el binario anterior, reglas de change-state y rutas existentes sin cambios. La prueba de rollback se hace sobre la migración aislada, no dentro de `openNotes`.

## Web de cambiar y quitar padre

"Cambiar padre" abre un diálogo con el selector "Nuevo padre" y la opción "Sin padre". Los candidatos se cargan recorriendo todas las páginas del proyecto, sin el tope de 200 de la lista, y excluyen la tarea y sus descendientes. Esa lectura no es una instantánea transaccional; el backend vuelve a validar ciclos, proyecto y revisiones al guardar. "Sin padre" usa detach. Las revisiones de la tarea y del padre se toman al abrir y no se refrescan al enviar; ante conflicto o error de red se conserva la selección.

E2E: RED real, código 1 por ausencia del botón Cambiar padre. La primera pasada GREEN falló (12 aprobadas, 1 fallida) porque la preparación cerraba un proyecto con tareas abiertas, algo que `HAS_OPEN_TASKS` impide. La prueba ahora completa las tareas reales con change-state antes de cerrar el proyecto. Resultado final: 13 E2E de Tareas aprobados, con más de 200 candidatos paginados, viewport móvil, conservación de proyecto/estado/descendientes, separación en proyecto cerrado y revisión obsoleta.

Revisión `review-11d38cce0d7d63e9`, sobre `952efa6..4a2be30`, aprobada con tres lentes y reconocida. Sin correcciones; observaciones no bloqueantes de legibilidad y fiabilidad de pruebas.

## Cancelar y reabrir con efectos aceptados, cuarta unidad backend

Solo backend y API; sin UI. `PATCH` y `change-state` siguen sin permitir cancelar ni reabrir.

- `POST /api/v1/tasks/:id/cancel` y `/reopen` reciben `{expectedRevision, acceptance?}` y devuelven 200 con la tarea. Una revisión obsoleta devuelve 409 `REVISION_MISMATCH` antes de calcular cualquier preview.
- Protocolo copiado del cambio de ámbito de clientes. Sin aceptación: 409 `{error:{code:'CONFIRMATION_REQUIRED', message, preview}}`, sin `reason`. Con aceptación distinta de lo recalculado: 409 `{code:'CONFLICT', reason:'PREVIEW_CHANGED', message, preview}` con el preview nuevo y nada escrito. `preview` es `{operation, targetId, previewDigest, effects}`; `operation` es `task.cancel` o `task.reopen`.
- `acceptance` es `{previewDigest, effects:[{code, targets}]}`. El digest es SHA-256 canónico (`sha256-` + 64 hex) sobre operación, tarea, su revisión y efectos ordenados. Cada efecto lleva `details.revisions` (`id:revisión,...`), que entra al digest. Se comparan digest, códigos y targets; los `details` reenviados se ignoran.
- Cancelar: desde abierta o done. Sin descendientes abiertos cancela directo. Con ellos, efecto `CANCEL_DESCENDANTS` con todos los abiertos de cualquier nivel. Aceptado, los cancela en la misma transacción y la tarea objetivo se escribe al final. Cerrados, `lastCompletedAt` y descendientes cerrados no cambian. cancelled→cancelled devuelve la tarea sin nueva revisión.
- Reabrir: solo desde done/cancelled; en abierta devuelve 409 `TASK_NOT_CLOSED`. Siempre deja `in_progress` y limpia `lastCompletedAt`. Cliente archivado devuelve 409 `CLIENT_ARCHIVED` antes de cualquier preview, también sin aceptación. Ancestros cerrados dan `REOPEN_ANCESTORS` (ids y revisiones); proyecto completed/archived da `REACTIVATE_PROJECT`. Aceptados, los ancestros pasan a `in_progress` con `lastCompletedAt` null y el proyecto a `active` con revisión +1. Sin efectos necesarios reabre directo. Un proyecto paused no genera efecto.
- Todo se recalcula bajo IMMEDIATE: conjunto, revisiones y estado de proyecto. Una hija abierta creada o reabierta, o una revisión de miembro cambiada, produce PREVIEW_CHANGED. Si falla cualquier escritura posterior, revierte toda la operación.
- Sin timers, selección Hoy ni traslado de proyecto. `blockedReason` sigue fuera.

Comando enfocado, timeout 30 segundos, fixtures aisladas:

`./node_modules/.bin/tsx --test packages/core/test/tasks.test.ts packages/db/test/tasks.test.ts packages/db/test/task-states.test.ts packages/db/test/task-effects.test.ts apps/server/test/tasks.test.ts`

- RED: código 1, 35 pasan y 12 fallan (parsers, preview y métodos inexistentes).
- GREEN: código 0, 47 pasan y 0 fallan, 2,77 s. Cubre digest estable ante orden y sensible a revisión, objetivo y operación; aceptación correcta; PREVIEW_CHANGED tras crear hija, reabrir una cerrada, cambiar una revisión de descendiente o de ancestro y cambiar el proyecto; rollback con trigger de fixture; cerrados intactos; `lastCompletedAt` conservado al cancelar y limpiado al reabrir; cliente archivado; reactivación con revisión +1; y HTTP 200/409/404.
- Verificación del padre: `npm run typecheck` correcto, `npm test` con 180 pruebas aprobadas y cero fallos (con `pipefail`), y 13 E2E de Tareas aprobados. Sin base real ni concurrencia multiproceso.
- Revisión `review-8bc67c599bd773da`, sobre `4a2be30..8f7586e`, aprobada con cuatro lentes y reconocida, sin correcciones. Verificación independiente por concurrencia y por cambiar el estado de proyectos: PASS en recálculo dentro de IMMEDIATE, digest, cancelación, reapertura, compatibilidad con la reactivación de T6, rutas existentes y forma HTTP igual a Clientes.
- Límite conocido: la aceptación admite como máximo 1000 targets (`MAX_TARGETS`). Una rama con más de 1000 descendientes abiertos no podría cancelarse desde la API; queda como trabajo posterior, junto con las observaciones de baja severidad: una aceptación sin efectos pendientes se ignora en silencio, `contratos.md` describe `datasetGeneration` y `{type,id,revision}` mientras la implementación usa `details.revisions`, y cancelar una tarea completada en un proyecto cerrado no exige reactivarlo.
- Tamaño: unas 476 líneas authored, por encima del presupuesto de ~400. Se confirma como un solo commit porque cancelar y reabrir comparten preview, digest y aceptación; separarlos dejaría la infraestructura de aceptación en un commit y su segundo consumidor en otro.

## Web de estados, cancelación y reapertura

La lista muestra el estado con sus seis etiquetas de producto: Nueva, En curso, Bloqueada, En revisión, Completada y Cancelada. El diálogo de edición añade el selector "Estado" con "Aplicar estado" (estados abiertos y Completada), "Cancelar tarea" y, en tareas cerradas, "Reabrir". Si el servidor responde CONFIRMATION_REQUIRED, un panel enumera los efectos con nombres legibles (descendientes que se cancelarán, ancestros que se reabrirán y proyecto que se reactivará), hasta 10 y "y N más", con "Confirmar" y "Volver". Solo Confirmar envía la aceptación. Ante PREVIEW_CHANGED se muestra el resumen nuevo y hay que confirmar otra vez. Para leer esos previews, `scopePreviewOf` en `notes-api.ts` acepta ahora `task.cancel` y `task.reopen`, sin cambiar el flujo de Clientes.

Tras "Aplicar estado" el diálogo sigue abierto con la tarea devuelta por el servidor y su revisión nueva; cancelar y reabrir lo cierran. El selector de estado no cuenta como borrador: si se elige un estado y se cierra sin aplicar, se descarta sin aviso.

E2E: la primera pasada RED tuvo cuatro fallos de preparación (el helper buscaba el botón "Editar" exacto y el botón de fila se llama "Editar <título>"). Tras corregir la preparación, el RED se repitió contra el código sin la UI: cinco pruebas fallidas por la funcionalidad ausente (etiqueta de estado, selector Estado y botón Cancelar tarea). GREEN: `npm run typecheck` correcto, `npm test` 180/180 y la suite E2E completa con 102 aprobadas y 3 omitidas preexistentes, incluida la prueba de 390 px.

Revisión `review-67839142ed238d57`, sobre `681348d..28dd335`, aprobada con tres lentes y reconocida, sin correcciones. Observaciones no bloqueantes de legibilidad y fiabilidad (manejo de títulos de efectos, foco y casos de error de la confirmación) quedan como trabajo posterior.

## Árbol de tareas, backend

Solicitado por el usuario para leer la jerarquía en la lista.

- `GET /api/v1/tasks?roots=true` (con `projectId`, `offset`, `limit` opcionales) lista solo tareas sin padre, recientes primero.
- `GET /api/v1/tasks?parentId=<id>` lista las hijas directas, más antiguas primero, paginadas con total. Un padre inexistente da 404 `NOT_FOUND`. Combinar `roots` con `parentId`, enviar `roots` distinto de `true`, `parentId` vacío o `projectId` junto a `parentId` da 400 `VALIDATION_ERROR`.
- `Task.childCount` cuenta las hijas directas en cualquier estado. Se calcula con una subconsulta en la misma lectura, sin una consulta extra por fila, y aparece en listados, `GET /:id` y en todas las mutaciones.
- El listado plano sin esos parámetros no cambia; lo sigue usando el selector de padre. Sin cambios de esquema.

RED: 46 pasan y 6 fallan. GREEN: 52/52 pruebas enfocadas. Tres aserciones antiguas comparaban la tarea padre completa y se ajustaron a `{ ...root, childCount: 1 }`, conservando que crear una hija no cambia sus datos ni su revisión. Padre: typecheck correcto y `npm test` 185/185.

## Árbol en la web

La lista muestra solo tareas raíz (`roots=true`), con el filtro de proyecto y la paginación de siempre. Cada fila con hijas tiene el botón "Subtareas de <título>" con su contador y `aria-expanded`. Al expandir se cargan las hijas directas (`parentId`) en páginas de 50, indentadas a cualquier nivel, con "Cargar más subtareas de <título>" mientras haya más. Colapsar descarta el subárbol. Tras una mutación se vuelven a leer los nodos expandidos sin colapsarlos; cambiar de página o de filtro colapsa todo. La sangría tiene un tope de 120 px para que el título se lea en 390 px. El selector de "Cambiar padre" sigue usando el listado plano.

E2E: RED válido con el backend real, por la UI ausente. Se ajustaron tres pruebas existentes que dependían de la lista plana (crear subtarea, cambiar padre y reabrir con ancestro cerrado): ahora expanden el padre para llegar a la hija. GREEN: typecheck correcto, 185/185 pruebas y 104 E2E aprobados con 3 omitidas preexistentes, sin contar `tasks-quick.spec.ts`, que pertenece a la unidad siguiente.

## Colores por estado y acción rápida en la web

Cada estado tiene una insignia con su etiqueta, un punto y un fondo de color: Nueva azul, En curso amarillo, Bloqueada rojo, En revisión violeta, Completada verde y Cancelada gris. Los tonos son variables CSS propias de la pantalla de Tareas, con texto claro sobre fondo oscuro opaco y contraste de al menos 4.5:1 comprobado en E2E; la paleta global no cambia. La columna Estado va justo después del título para que la insignia se vea en 390 px.

La insignia es un botón ("Cambiar estado de <título>: <estado>") que abre un menú con los demás estados abiertos, Completada y "Cancelar tarea"; en tareas cerradas solo ofrece "Reabrir". Escape o un clic fuera lo cierran y el foco vuelve a la insignia. Los estados usan change-state con la revisión de la fila tal como se cargó. Si cancelar o reabrir tienen efectos, el panel Confirmar/Volver aparece en la fila siguiente; PREVIEW_CHANGED muestra el resumen nuevo. Ante otro error, el mensaje queda en la fila y la lista se recarga conservando lo expandido. El diálogo de edición conserva sus controles.

E2E en `tests/e2e/tasks-quick.spec.ts`: RED válido por la insignia ausente; GREEN con typecheck correcto, 185/185 pruebas y la suite E2E completa con 110 aprobadas y 3 omitidas preexistentes.

## Continuación

T8 queda completa en web/API en la rama local `feat/tasks-t8`, sin push ni merge. La forma de aceptación está duplicada de `client-scope.ts` porque allí no es genérica; extraerla exige editar ese módulo. Traslados entre proyectos quedan en T11. Sin push ni merge; las bases y certificados de prueba son temporales. Las aprobaciones registradas cubren cada commit por separado, no el acumulado de la rama.
