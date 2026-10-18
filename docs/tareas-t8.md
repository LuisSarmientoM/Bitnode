# T8: jerarquía y transiciones

Creación de subtareas implementada en core, SQLite, API y web. Cambiar/quitar padre backend verificado y guardado en 3a16c1a; revisión pendiente. Estados simples y finalización backend implementados, pendientes de verificación global y revisión del padre. T8 sigue incompleta: faltan cancelación, reapertura y UI de reparentado/estados. La CLI queda excluida.

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

## Web de cambiar y quitar padre

"Cambiar padre" abre un diálogo con el selector "Nuevo padre" y la opción "Sin padre". Los candidatos se cargan recorriendo todas las páginas del proyecto, sin el tope de 200 de la lista, y excluyen la tarea y sus descendientes. Esa lectura no es una instantánea transaccional; el backend vuelve a validar ciclos, proyecto y revisiones al guardar. "Sin padre" usa detach. Las revisiones de la tarea y del padre se toman al abrir y no se refrescan al enviar; ante conflicto o error de red se conserva la selección.

E2E: RED real, código 1 por ausencia del botón Cambiar padre. La primera pasada GREEN falló (12 aprobadas, 1 fallida) porque la preparación cerraba un proyecto con tareas abiertas, algo que `HAS_OPEN_TASKS` impide. La prueba ahora completa las tareas reales con change-state antes de cerrar el proyecto. Resultado final: 13 E2E de Tareas aprobados, con más de 200 candidatos paginados, viewport móvil, conservación de proyecto/estado/descendientes, separación en proyecto cerrado y revisión obsoleta.

## Continuación

Tras verificar y revisar esta unidad, cancelar exige consentimiento para todos los abiertos; reapertura vuelve a in_progress y verifica ancestros/proyecto/cliente concurrentemente. Traslados entre proyectos quedan en T11. La UI de estados queda posterior a cancel/reopen. Sin push ni merge; las bases y certificados de prueba son temporales. Las aprobaciones registradas se limitan a creación backend y su UI, no al reparentado ni al resto de T8.
