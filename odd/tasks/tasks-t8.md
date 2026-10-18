# T8: jerarquía y transiciones

Estado: completada en web/API y publicada en `main` (PR #2, merge commit `e64e821`). Alcance acordado web/API, sin CLI. Creación backend en `744cae5`, con revisión nativa aprobada y reconocida. UI de creación en `e2ac786`, verificada y con revisión nativa propia aprobada y reconocida.

## Intención

Permitir subtareas multinivel y cambios de jerarquía dentro del mismo proyecto, sin crear abiertas bajo ancestros cerrados ni reabrir implícitamente. Mantener comandos explícitos fuera de PATCH.

## Unidades

- [x] Crear subtareas: core, DB, API y tests deterministas. Padre del mismo proyecto, revisión esperada, ancestros abiertos y transacción IMMEDIATE. Evidencia RED/GREEN en [registro T8](../../docs/tareas-t8.md).
- [x] Lectura estructural, typecheck y suite completa de creación: 156 pruebas aprobadas, cero fallos.
- [x] Commit local `744cae5` y revisión nativa `review-e31e7d4d4e6173d8` aprobada y reconocida. Solo backend de creación, 193 líneas authored.
- [x] UI de creación de subtareas: RED por botón ausente, GREEN 11 pruebas E2E Tareas aprobadas, con viewport móvil y contexto fuera de la página.
- [x] Revisión nativa de UI de creación `review-eae8b17feaac52fa`, aprobada y reconocida, rango `744cae5..e2ac786`.
- [x] Cambiar/quitar padre backend: revisión optimista, ciclos, mismo proyecto, no-op, negativos, rollback y dos conexiones con revisión obsoleta. RED 23/28, GREEN 29/29; detalles en registro T8.
- [x] Typecheck y suite completa de segunda unidad: 162 pruebas aprobadas, cero fallos.
- [x] Commit local de segunda unidad 3a16c1a, realizado por el padre.
- [x] Revisión nativa de segunda unidad `review-3cfda30cb914bbab`: una corrección acotada `3456380` (mensaje PARENT_CLOSED de creación), validada, aprobada y reconocida.
- [x] Estados simples/finalización backend y migración v7 last_completed_at nullable: RED 28/35, GREEN 35/35; cierre desde cancelled también bloquea descendientes abiertos. Sin cancel/reopen ni UI.
- [x] Typecheck y suite completa de tercera unidad: 168 pruebas aprobadas, cero fallos.
- [x] Commit local de tercera unidad `952efa6`.
- [x] Revisión nativa de tercera unidad `review-4cad1f83d4db7387`, aprobada y reconocida; verificador independiente PASS en migración, rollback, change-state y rutas existentes.
- [x] UI de cambiar/quitar padre: RED por botón ausente, preparación E2E corregida, 13 E2E de Tareas aprobados.
- [x] Revisión nativa de UI de reparentado `review-11d38cce0d7d63e9`, aprobada y reconocida.
- [x] Cancelar con CANCEL_DESCENDANTS aceptado, conservando cerrados y última finalización, y reabrir a in_progress con REOPEN_ANCESTORS/REACTIVATE_PROJECT aceptados, limpieza de finalización y cliente archivado bloqueante. Backend/API: RED 12/47, GREEN 47/47. Padre: typecheck correcto, 180/180 pruebas y 13 E2E. ~476 líneas en un commit, por encima del presupuesto.
- [x] Commit `8f7586e`; revisión `review-8bc67c599bd773da` aprobada y reconocida; verificador independiente PASS. Límite conocido: MAX_TARGETS=1000.
- [x] UI de estados, cancelación y reapertura: RED válido 5/5 contra el código sin UI; GREEN 180/180 y 102 E2E (3 omitidas preexistentes).
- [x] Commit `28dd335`; revisión `review-67839142ed238d57` aprobada y reconocida.

## Mejoras de lectura de la lista

Solicitud del usuario, literal: "La UI es edficiente, no sé qué tareas son hijas (se me ocurre anidarlas), los estados deben tener un código de color para facilitar la lectura, el cambio de estado debe ser un quick action". Colores, literal: "Nueva azul, En curso amarillo, bloqueada roo, en revisión violeta, completada verde, cancelada gris".

- S1. Anidado con expandir y colapsar: la lista muestra tareas raíz con contador de hijas; al expandir se cargan sus hijas indentadas, a cualquier nivel, sin depender de la página.
- S2. Color por estado: Nueva azul, En curso amarillo, Bloqueada rojo, En revisión violeta, Completada verde, Cancelada gris. Siempre con la etiqueta de texto y contraste legible en el tema oscuro.
- S3. Acción rápida: la insignia de estado de cada fila abre un menú con los demás estados; cancelar y reabrir con efectos muestran la confirmación en el mismo lugar.

Contrato acordado por el padre: `GET /api/v1/tasks?roots=true` (con `projectId`, `offset`, `limit`) lista solo raíces, recientes primero; `GET /api/v1/tasks?parentId=<id>` lista hijas directas, más antiguas primero, paginadas; ambos parámetros son excluyentes (400) y un padre inexistente da 404. El DTO `Task` añade `childCount` (hijas directas en cualquier estado). El listado plano actual no cambia.

- [x] U1. Backend del árbol (S1): `roots`, `parentId`, `childCount`. RED 46/52, GREEN 52/52; typecheck y 185/185.
- [x] U2a. UI del árbol (S1): RED válido, GREEN 185/185 y 104 E2E.
- [x] U2a revisada: `7334e02`, `review-0bb999dd52bcab3b` aprobada y reconocida.
- [x] U2b. UI de colores y acción rápida (S2-S3): RED válido, GREEN 185/185 y 110 E2E. Commit `a5069db`, revisión `review-b723a65f710a5503` aprobada y reconocida.

## Entrega

Decisión del usuario: un solo PR con varios commits. Tras probar la UI, el usuario pidió push, PR y merge. Se publicó el PR #2 con 15 commits (unas 2700 líneas authored, cada commit revisado por separado) y se integró con merge commit `e64e821`, que conserva los SHAs citados en este documento. La rama remota `feat/tasks-t8` sigue existiendo.

## Límites

Sin migración en creación; v7 agrega fecha nullable para finalización en tercera unidad. Sin traslado de proyectos T11, timers, selección Hoy ni eliminación. No se modifica odd/tasks/projects-t6.md ajeno.

Riesgo: escrituras de jerarquía y estado concurrentes. Creación y cambio de padre validan estado actual bajo IMMEDIATE, sin reclamar prueba multiproceso. Las operaciones futuras de rama deben verificar membresía y revisiones, no confiar solo en raíz.

Rollback de creación: retirar creación con padre, su validación, mapeo HTTP, tests y registro en los ocho archivos autorizados. No hay cambio de esquema que revertir. Retirar el código no convierte subtareas ya creadas en raíces.

Rollback de segunda unidad: retirar reparent/detach de core, DB y API con sus tests/registro; restaurar validación de padre inline de creación si se retira el helper compartido. No revierte cambios de parent_id ya guardados. Base de esta unidad e2ac786; no modifica UI, esquema, estados ni proyectos.

Rollback de tercera unidad: retirar change-state, DTO/columna de finalización, migración v7 y tests/registro añadidos. Una base ya migrada a v7 no debe abrirse con un binario que solo acepta v6; no bajar user_version ni eliminar columna de una base real. Antes de commit, solo fixtures aisladas. No hay migración descendente implementada.

Rollback de cuarta unidad: retirar cancel/reopen, el preview/aceptación de tareas, rutas, tests y registro. No hay cambio de esquema. Las tareas ya canceladas o reabiertas y proyectos reactivados no se revierten, y las revisiones ya incrementadas no bajan.
