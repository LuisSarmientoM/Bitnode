# T7 Tareas básicas: registro y evidencia

**T7 completado en web/API e integrado en `main` hasta `3d34b58`**, sobre T6 (`132f18f`), mediante fast-forward. La CLI quedó excluida por decisión del usuario, igual que en T5. Se desarrolló en paralelo con T6 en un worktree separado, ya retirado. No se publicó ni se creó una nueva versión.

## Alcance entregado

- Crear, editar, listar y abrir tareas. Toda tarea nueva exige un proyecto activo o pausado. Un proyecto completado o archivado responde `409 CONFLICT` con `reason: PROJECT_CLOSED`.
- La creación fuerza el estado Nueva y la prioridad ninguna. `state`, `priority` y un `parentId` no nulo se rechazan al crear. Las subtareas llegan con T8.
- La edición admite título, descripción Markdown, prioridad (ninguna/baja/media/alta), planificación, límite y referencias. Estado, proyecto, padre y borrado se rechazan como campos desconocidos. Requiere `expectedRevision`. Un cambio sin efecto no sube la revisión.
- Planificación y límite son independientes. Cada uno admite sin fecha, día civil (`{kind:"day",day}`) o día y hora de Colombia (`{kind:"local",day,time:"HH:mm"}`), que se guarda y devuelve como instante (`{kind:"instant",at,zone:"America/Bogota"}`). Colombia usa UTC-5 fijo, sin horario de verano.
- La planificación posterior al límite devuelve `warnings: ["PLANNED_AFTER_DUE"]` y no bloquea el guardado. Si ambas fechas tienen hora, se comparan instantes. Si no, se comparan días civiles de Colombia, y el mismo día nunca se considera posterior.
- Referencias: lista ordenada de reemplazo completo, con URL http/https de hasta 4096 caracteres, nombre opcional de hasta 500 y un máximo de 100. Se permiten URLs duplicadas. Los IDs se conservan al reordenar o editar. Una referencia de otra tarea responde `404`.
- Proyectos (regla acordada con T6): completar o archivar con tareas abiertas responde `409 CONFLICT` con `reason: HAS_OPEN_TASKS`. Borrar un proyecto con cualquier tarea responde `HAS_ASSOCIATIONS`. Pausar sigue permitido.
- Web: vista Tareas en la navegación de escritorio y en el menú móvil, con lista filtrada por proyecto, creación limitada a proyectos activos o pausados, diálogo de edición, aviso del límite y borrador conservado ante conflicto de revisión o fallo de red.

## Esquema

`user_version 6`: `tasks` y `task_references`. La migración corre en la misma transacción que las anteriores y revierte por completo si falla. `tasks` ya incluye `parent_id` con la FK compuesta diferida `(parent_id, project_id)`, para que T8 no tenga que reconstruir la tabla. Las fechas usan tres columnas por campo (`*_kind`, `*_day`, `*_at`) con un `CHECK` de forma exclusiva. Una base con versión mayor a 6 se rechaza.

## API

| Ruta | Uso |
|---|---|
| `GET /api/v1/tasks?projectId=&offset=&limit=` | Lista paginada, recientes primero. Rechaza parámetros desconocidos. |
| `GET /api/v1/tasks/:id` | Tarea con referencias, avisos y contexto derivado (proyecto y cliente). |
| `POST /api/v1/tasks` | Crear: `201`. |
| `PATCH /api/v1/tasks/:id` | Editar con `expectedRevision`. Conflicto: `409 CONFLICT`, `reason: REVISION_MISMATCH`. |

## Verificación

| Comprobación | Resultado |
|---|---|
| `npm test` | 153 aprobadas, cero fallos, sobre `57e1220`. |
| `npm run typecheck` | Exit 0. |
| E2E `tasks.spec.ts`, `navigation.spec.ts`, `clients.spec.ts` | 45 aprobadas, 2 omitidas preexistentes, cero fallos, ejecutadas por el worker de la UI. Una pasada previa tuvo 6 fallos en Clientes mientras la sesión de T6 ocupaba el puerto 3107; se repitió con el puerto libre. |
| RED observado | Core, SQLite, REST y guarda de proyectos fallaron antes de implementar, por las causas esperadas. La E2E nueva no pudo observar RED porque el puerto 3107 estaba ocupado. |

No se ejecutó la suite E2E completa. No hay revisión nativa de T7. Se probó solo con bases temporales; no se migró ninguna base real.

## Diferencias con el diseño y límites

- La descripción usa un `textarea` Markdown sin vista previa, no el editor en vivo de Notas.
- La edición es un diálogo, como en Clientes, no una página de detalle. El contexto se muestra como "Proyecto / Cliente".
- El aviso del límite refleja el estado guardado; no se recalcula mientras se escribe.
- El filtro de proyectos usa los proyectos no archivados que devuelve `GET /api/v1/projects?limit=200`.
- Fuera de T7: cambios de estado, subtareas, Hoy, tiempo, traslado, borrado y etiquetas de tareas (T8–T17).
- La integración con T6 se resolvió en el rebase: navegación con Proyectos y Tareas, test de navegación y fila del plan.
