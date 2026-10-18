# T8: jerarquía y transiciones

Estado: parcial. Alcance acordado web/API, sin CLI. Creación backend en `744cae5`, con revisión nativa aprobada y reconocida. UI de creación verificada, pendiente de revisión nativa propia.

## Intención

Permitir subtareas multinivel y cambios de jerarquía dentro del mismo proyecto, sin crear abiertas bajo ancestros cerrados ni reabrir implícitamente. Mantener comandos explícitos fuera de PATCH.

## Unidades

- [x] Crear subtareas: core, DB, API y tests deterministas. Padre del mismo proyecto, revisión esperada, ancestros abiertos y transacción IMMEDIATE. Evidencia RED/GREEN en [registro T8](../../docs/tareas-t8.md).
- [x] Lectura estructural, typecheck y suite completa de creación: 156 pruebas aprobadas, cero fallos.
- [x] Commit local `744cae5` y revisión nativa `review-e31e7d4d4e6173d8` aprobada y reconocida. Solo backend de creación, 193 líneas authored.
- [x] UI de creación de subtareas: RED por botón ausente, GREEN 11 pruebas E2E Tareas aprobadas, con viewport móvil y contexto fuera de la página.
- [ ] Revisión nativa de UI de creación, en su propio candidato local.
- [ ] Cambiar/quitar padre: revisión optimista, ciclos, mismo proyecto, negativos y rollback.
- [ ] Transiciones: migración last_completed_at, completar sin descendientes abiertos también desde cancelled, cancelar todos los descendientes abiertos o abortar, reapertura in_progress con ancestros/proyecto y cliente archivado bloqueante.
- [ ] Adaptar UI T7 tras comandos y contratos revisados.

## Límites

Sin migración en creación. Sin traslado de proyectos T11, timers, eliminación, consentimiento combinado ni transiciones ahora. No se modifica odd/tasks/projects-t6.md ajeno.

Riesgo: escrituras de jerarquía y estado concurrentes. Primera subunidad valida estado actual bajo IMMEDIATE, sin reclamar prueba multiproceso. Las operaciones futuras de rama deben verificar membresía y revisiones, no confiar solo en raíz.

Rollback de esta subunidad: retirar creación con padre, su validación, mapeo HTTP, tests y registro en los ocho archivos autorizados. No hay cambio de esquema que revertir. Retirar el código no convierte subtareas ya creadas en raíces.
