# T8: jerarquía y transiciones

Estado: parcial. Alcance acordado web/API, sin CLI. Creación backend en `744cae5`, con revisión nativa aprobada y reconocida. UI de creación en `e2ac786`, verificada y con revisión nativa propia aprobada y reconocida.

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
- [ ] Commit y revisión nativa de tercera unidad, a cargo del padre.
- [ ] Cancelar todos los descendientes abiertos o abortar, conservando cerrados y última fecha de finalización.
- [ ] Reapertura in_progress con aceptación de ancestros/proyecto, limpieza de finalización y cliente archivado bloqueante.
- [ ] Adaptar UI T7 tras comandos y contratos revisados.

## Límites

Sin migración en creación; v7 agrega fecha nullable para finalización en tercera unidad. Sin traslado de proyectos T11, timers, eliminación, consentimiento combinado ni cancel/reopen ahora. No se modifica odd/tasks/projects-t6.md ajeno.

Riesgo: escrituras de jerarquía y estado concurrentes. Creación y cambio de padre validan estado actual bajo IMMEDIATE, sin reclamar prueba multiproceso. Las operaciones futuras de rama deben verificar membresía y revisiones, no confiar solo en raíz.

Rollback de creación: retirar creación con padre, su validación, mapeo HTTP, tests y registro en los ocho archivos autorizados. No hay cambio de esquema que revertir. Retirar el código no convierte subtareas ya creadas en raíces.

Rollback de segunda unidad: retirar reparent/detach de core, DB y API con sus tests/registro; restaurar validación de padre inline de creación si se retira el helper compartido. No revierte cambios de parent_id ya guardados. Base de esta unidad e2ac786; no modifica UI, esquema, estados ni proyectos.

Rollback de tercera unidad: retirar change-state, DTO/columna de finalización, migración v7 y tests/registro añadidos. Una base ya migrada a v7 no debe abrirse con un binario que solo acepta v6; no bajar user_version ni eliminar columna de una base real. Antes de commit, solo fixtures aisladas. No hay migración descendente implementada.
