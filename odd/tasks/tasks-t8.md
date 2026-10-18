# T8: jerarquía y transiciones

Estado: parcial. Alcance acordado web/API, sin CLI. Primera subunidad lista para revisión del padre, sin commit ni aprobación nativa.

## Intención

Permitir subtareas multinivel y cambios de jerarquía dentro del mismo proyecto, sin crear abiertas bajo ancestros cerrados ni reabrir implícitamente. Mantener comandos explícitos fuera de PATCH.

## Unidades

- [x] Crear subtareas: core, DB, API y tests deterministas. Padre del mismo proyecto, revisión esperada, ancestros abiertos y transacción IMMEDIATE. Evidencia RED/GREEN en [registro T8](../../docs/tareas-t8.md).
- [x] Lectura estructural, typecheck y suite completa de creación: 156 pruebas aprobadas, cero fallos.
- [ ] Commit local y revisión nativa de primera subunidad, a cargo del padre.
- [ ] Cambiar/quitar padre: revisión optimista, ciclos, misma rama/proyecto, negativos y rollback. Comenzar solo después de la revisión y commit local anteriores.
- [ ] Transiciones: migración last_completed_at, completar sin descendientes abiertos también desde cancelled, cancelar todos los descendientes abiertos o abortar, reapertura in_progress con ancestros/proyecto y cliente archivado bloqueante.
- [ ] Adaptar UI T7 tras comandos y contratos revisados.

## Límites

Sin migración en creación. Sin traslado de proyectos T11, timers, eliminación, consentimiento combinado ni transiciones ahora. No se modifica odd/tasks/projects-t6.md ajeno.

Riesgo: escrituras de jerarquía y estado concurrentes. Primera subunidad valida estado actual bajo IMMEDIATE, sin reclamar prueba multiproceso. Las operaciones futuras de rama deben verificar membresía y revisiones, no confiar solo en raíz.

Rollback de esta subunidad: retirar creación con padre, su validación, mapeo HTTP, tests y registro en los ocho archivos autorizados. No hay cambio de esquema que revertir. Retirar el código no convierte subtareas ya creadas en raíces.
