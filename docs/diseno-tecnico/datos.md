# Datos e integridad

[Índice del diseño](../diseno-tecnico-local.md). Todo esquema de esta página es propuesta técnica. Las reglas de producto proceden del [alcance](../revision-alcance-local.md). No existe una migración ejecutada.

## Convenciones

| Tipo lógico | SQLite y contrato | Validación |
|---|---|---|
| ID | `TEXT`, UUID de aplicación | Forma UUID; no confiar en orden temporal del UUID. |
| Instante | `INTEGER`, JSON número entero | UTC milisegundos, entero seguro en JavaScript. |
| Día | `TEXT`, JSON `YYYY-MM-DD` | Fecha real gregoriana en core, no solo regex. |
| Revisión | `INTEGER NOT NULL DEFAULT 1` | Positiva; incremento en cada mutación real. |
| Flag | `INTEGER`, JSON boolean | `CHECK IN (0,1)`. |
| Dinero entero | `TEXT`, JSON string | Decimal positivo canónico, sin signo, ceros iniciales ni exponentes. |
| Tasa | `TEXT` con centésimas enteras, JSON decimal | Positiva hasta dos decimales; no `REAL`. |
| Texto opcional | `TEXT NULL` | Vacío recortado se convierte a null en campos simples. Markdown vacío puede ser string vacío. |

Todas las entidades de dominio con ID tienen `created_at`, y las mutables también `updated_at` y `revision`. Instantes técnicos no introducen fechas reales de proyecto. Las tablas de asignación usan clave primaria compuesta y no necesitan ID artificial. Etiquetas y entradas de actividad son inmutables salvo borrado de actividad por su plazo anual o por eliminación definitiva de la nota a la que pertenecen.

Columnas obligatorias son `NOT NULL`; en las tablas siguientes `?` indica nullable. IDs referenciados son FKs. SQL define enums mediante `CHECK`; se verifica tipo entero cuando una afinidad SQLite no lo garantiza. Validaciones de longitud, normalización y fechas reales se repiten en core, con CHECK defensivo donde sea fiable.

Usar tablas `STRICT` si el driver distribuido las soporta. Es una puerta T2, no motivo para perder CHECK en el fallback. Migraciones SQL auditables pueden complementar Drizzle para restricciones diferibles/FTS que el generador no exprese.

## Organización

| Tabla | Columnas específicas | Restricciones e índices |
|---|---|---|
| `clients` | `full_name`, `full_name_key`, `short_name?`, `short_name_key?`, `scope`, `observations?`, `archived_at?` | Unique full_name_key; unique short_name_key no null, independientemente del nombre completo; scope work/personal sin default. Índice scope/archived_at/id. |
| `contacts` | `name`, `email?`, `phone?`, `observations?`, `archived_at?` | Nombre no único. Email sintáctico, no comprobación remota. Teléfono texto, no número ni unicidad. Índice archived_at/id. |
| `contact_clients` | `contact_id`, `client_id` | PK de ambos; FKs restrictivas; índice inverso client_id/contact_id. |
| `projects` | `client_id`, `name`, `name_key`, `description`, `state`, `planned_start_day?`, `planned_end_day?` | Unique client_id/name_key. State active/paused/completed/archived. Índice client_id/state/id. Cliente inmutable por servicio. |

Cliente/proyecto no tienen `deleted_at` ni borrado en cascada. Para borrar cliente comprobar proyectos, vínculos de contactos, notas, eventos, finanzas y etiquetas asignadas; para proyecto tareas incluso retenidas, tiempo directo, timers, notas, eventos, finanzas y etiquetas. El conjunto de asociaciones se vuelve a consultar dentro de la transacción.

No almacenar scope en proyecto/tarea. Para notas y contactos calcular scopes por sus vínculos actuales. Una nota puede coincidir con ambos; no usar un único enum scope para representarla.

## Trabajo

| Tabla | Columnas específicas | Restricciones e índices |
|---|---|---|
| `tasks` | `project_id`, `parent_id?`, `title`, `description`, `state`, `priority`, `blocked_reason?`, `origin_kind`, `origin_capture_id?`, campos planned/due, `last_completed_at?`, `today_selected`, `deleted_at?` | State new/in_progress/blocked/in_review/done/cancelled; priority none/low/medium/high. Unique id/project_id para FK padre. Índices project_id/parent_id, parent_id, project_id/state/deleted_at, deleted_at, today_selected. |
| `task_references` | `id`, `task_id`, `url`, `name?`, `position` | FK restrictiva; unique task_id/position; position entero >=0. IDs estables para edición/reordenación. Revisión controlada por tarea. URLs repetidas permitidas, sin índice único ni deduplicación. |
| `inbox` | `title`, `body` | Sin cliente/proyecto/scope, etiquetas, estados procesada ni FK de destino. Índice created_at/id. |

`origin_kind` propuesto manual/inbox; web/CLI son actor de operación, no origen de producto distinto. `origin_capture_id` conserva un identificador de procedencia, no una FK: la captura desaparece al procesarse. No introduce historial de Inbox. Al añadir captura a tarea existente no reemplazar su origen original. La codificación concreta queda propuesta.

Cada campo temporal planned/due de tarea usa tres columnas `*_kind?`, `*_day?`, `*_at?`. Colombia, America/Bogota, es constante de aplicación, no una preferencia ni una zona persistida por registro. CHECK exige una de estas formas:

- Todo null, sin fecha.
- kind day, day no null, at null.
- kind instant, at no null, day null.

No guardar día derivado junto al instante. Planificación/límite permanecen separados. Índices parciales planned_day/due_day y planned_at/due_at para candidatas de Hoy y calendario, condicionados a tarea no eliminada. El orden final y las reglas se resuelven en consultas, no en un único índice que mezcle días con instantes.

### Jerarquía

Declaración SQL de diseño, aún sin ejecutar:

```sql
UNIQUE (id, project_id),
FOREIGN KEY (parent_id, project_id)
  REFERENCES tasks (id, project_id)
  ON UPDATE NO ACTION ON DELETE NO ACTION
  DEFERRABLE INITIALLY DEFERRED,
CHECK (parent_id IS NULL OR parent_id <> id)
```

`project_id` sigue teniendo su FK inmediata a projects. Un padre null es raíz; SQLite no exige la FK compuesta si una columna hija es null. El CHECK no detecta ciclos de más de un nodo. Una CTE recursiva y el caso de uso los impiden bajo el bloqueo de escritura.

No usar `ON UPDATE RESTRICT` en esa FK: falla inmediatamente incluso si se declara diferible. La fuente oficial se enlaza en [operación](operacion.md#referencias-técnicas). El traslado se detalla en [dominio](dominio.md#traslado-de-rama). Un fallo de COMMIT exige ROLLBACK; no liberar la unidad de trabajo con una transacción fallida abierta.

No depender de cascada para eliminar una rama. Reunir el conjunto, desvincular referencias externas, borrar tiempos/referencias/asignaciones y después tareas de abajo arriba. No dejar una tarea no eliminada bajo ancestro eliminado.

## Notas y etiquetas

| Tabla | Columnas específicas | Restricciones e índices |
|---|---|---|
| `notes` | `title`, `body`, `client_id?`, `project_id?`, `task_id?`, `contact_id?`, `archived_at?`, `trashed_at?` | FKs independientes restrictivas. Título persistente incluso si se generó. Índices por cada vínculo, archived_at/trashed_at y trashed_at/id para purga. |
| `tags` | `name`, `name_key`, `color?` | Unique name_key, color propuesto hex RGB `#RRGGBB`. Sin updated_at/revision necesarios si nunca se edita. Ausencia de color es inmutable. |
| `client_tags` | `client_id`, `tag_id` | PK compuesta, FKs restrictivas, índice tag_id/client_id. |
| `project_tags` | `project_id`, `tag_id` | Igual para proyectos. |
| `task_tags` | `task_id`, `tag_id` | Igual para tareas. |
| `note_tags` | `note_id`, `tag_id` | Igual para notas. |
| `contact_tags` | `contact_id`, `tag_id` | Igual para contactos. |

No exigir igualdad de contexto entre los vínculos de nota. Al purgar tarea se asigna task_id=null e incrementa revisión de notas afectadas, pero no se modifican client_id/project_id/contact_id propios. Conservar vínculos a tareas retenidas ya existentes; rechazar nuevas asignaciones hacia ellas.

Archivo y papelera son campos diferentes. Restaurar nota limpia ambos campos; no inferir recuperación de tarea vinculada. Las asignaciones de etiquetas se editan con revisión de su propietario, para que quitar/agregar etiquetas invalide una edición paralela de ese registro.

## Tiempo

| Tabla | Columnas específicas | Restricciones e índices |
|---|---|---|
| `timers` | `task_id?`, `project_id?`, `started_at`, `effective_limit_at`, `revision` | Exactamente un destino; unique parcial task_id no null y project_id no null. Límite = inicio +43.200.000 ms. Índice effective_limit_at/id. Solo contiene intervalos activos. |
| `time_entries` | `task_id?`, `project_id?`, `day`, `minutes`, `source`, `interval_id?`, `segment_index?`, `original_start_at?`, `original_end_at?`, `corrected_at?` | Exactamente un destino; minutes entero >=1; source manual/timer. Unique interval_id/segment_index cuando ambos existen. Índices day/id, task_id/day, project_id/day. |

`interval_id` es el ID del timer consumido, no FK a una fila activa eliminada. Segmentos calculados una vez bajo transacción; datos guardados y borrado de timer atómicos. Dos procesos no pueden consumir la misma fila. Las entradas conservan metadata original aunque cambien día/minutos/destino por edición permitida.

Para manual, metadatos de intervalo son null. Para timer son completos y `original_end_at > original_start_at`: un tramo de duración cero no genera entrada ni minuto artificial, confirmado P6. Cambio de fecha manual no redistribuye otras entradas del mismo intervalo. Todos los días cronometrados se calculan en Colombia.

No repetir proyecto/cliente histórico en entradas de tarea. Si task_id existe project_id es null; consultar task.project_id y project.client_id actuales. En totales excluir tasks.deleted_at no null. Tiempo directo de proyecto cerrado sí cuenta y es editable.

## Finanzas y eventos

| Tabla | Columnas específicas | Restricciones e índices |
|---|---|---|
| `financial_movements` | `kind`, `amount_units`, `currency`, `rate_hundredths?`, `day`, `concept?`, `client_id?`, `project_id?` | Kind income/expense; currency COP/USD; a lo sumo un vínculo; COP exige rate null. Amount/rate canónicos positivos. Índices day/id, client_id/day, project_id/day. |
| `events` | `title`, `description`, `mode`, `start_day?`, `end_day?`, `start_at?`, `end_at?`, `client_id?`, `project_id?`, `task_id?`, `trashed_at?` | A lo sumo un vínculo. Mode all_day exige días y ningún instante; timed exige instantes y ningún día. Fin >= inicio, igualdad permitida timed. Índices rangos por modo, cada vínculo y trashed_at/id. |

Para importes texto, CHECK defensivo con solo dígitos, primer dígito 1–9, longitud dentro del límite y typeof text. No usar CAST a INTEGER como comprobación: puede truncar o desbordarse. Core usa BigInt y límites de [contratos](contratos.md#límites-propuestos).

No guardar equivalente COP o saldo histórico como autoridad. Derivar por movimiento en servicio y sumar enteros exactos. Para eventos all_day ambos días son inclusivos; convertir a intervalo semiabierto solo para consulta visual, avanzando un día civil al fin, no 24 horas UTC.

## Actividad y acceso

| Tabla | Columnas específicas | Restricciones e índices |
|---|---|---|
| `activity` | `id`, `operation_id`, `sequence`, `entity_type`, `entity_id`, `note_id?`, `action`, `occurred_at`, `summary`, `changes_json`, `payload_version` | Unique operation_id/sequence; enum de familias permitidas. Índices occurred_at/id, entity_type/occurred_at y note_id. entity_id sin FK general; note_id referencia notes con FK restrictiva para aplicar P2. |
| `local_identity` | `singleton_id`, `password_hash`, `credential_version`, timestamps | CHECK singleton_id=1; versión entera positiva. Nunca devolver hash en DTO. |
| `sessions` | `token_hash`, `credential_version`, `csrf_secret`, `created_at` | PK token_hash; índice credential_version. Sin maximum-age de producto. Secret solo para validar CSRF, fuera de logs y backups publicados. |
| `auth_throttle` | `bucket_key`, `window_started_at`, `attempt_count`, `blocked_until?` | Estado persistente de protección de login, no Actividad. Limpieza acotada; no introducir usuarios múltiples. |
| `schema_migrations` | `version`, `checksum`, `applied_at` | PK version; checksum evita reescribir migraciones ya aplicadas. |
| `data_metadata` | `singleton_id`, `normalization_version`, `dataset_generation` | Fila técnica; generación cambia al restaurar para invalidar cursores/previews anteriores. No identifica un usuario remoto. |

`changes_json` es un objeto validado por payload_version, no volcado arbitrario del DTO. Por P2, toda fila que represente una nota o incluya su contenido lleva note_id, incluidas asignaciones de etiquetas y procesamiento de captura hacia esa nota. Al borrar la nota definitivamente, borrar esas filas en la misma transacción antes de notes; no dejar fila redactada ni crear actividad de su purga. Filas independientes de la operación se conservan solo si no representan ni contienen la nota borrada. No generalizar este borrado a otras familias ni añadir timeline de tareas/proyectos/clientes/contactos.

## Normalización e índice de búsqueda

Una función de core versionada produce claves de unicidad y texto FTS: recorte exterior, normalización Unicode, minúsculas y eliminación de marcas vocálicas acordadas, preservando ñ. Propuesta: NFC de entrada, descomponer, retirar agudo/grave/circunflejo/diéresis sobre vocales y recomponer NFC; preservar tilde de n. No usar eliminación general de combining marks.

Espacios interiores múltiples y puntuación no se fusionan en claves únicas en esta propuesta. Si se cambia política, preflight de colisiones y migración explícita; no actualizar claves en silencio.

Tabla `search_documents` propuesta con rowid entero, entity_type/id únicos, columnas normalizadas name/title/body/observations, display_key alfabética derivada del nombre/título y versión de normalización. Tabla virtual FTS5 con contenido propio vinculado a esos documentos, tokenizer `unicode61 remove_diacritics 0`. Usar SQL controlado para actualizar ambas en una misma transacción. Borrado/papelera elimina entrada FTS, restauración la reconstruye; archivo/estado se filtran mediante join actual, no necesitan rehacer texto.

Incluye únicamente cliente/contacto/proyecto/tarea/nota/evento. Texto original permanece en tablas de dominio. No indexar scope, etiquetas, contenido de actividad ni datos fuera de campos confirmados como nuevos términos.

Consulta FTS:

1. Normalizar y tokenizar input con política compatible con unicode61.
2. Rechazar exceso de términos/longitud; términos no son operadores FTS.
3. Construir expresión controlada de términos escapados unidos por AND, con prefijo permitido.
4. Aplicar filtros de estado, eliminación y contexto mediante joins/EXISTS antes de LIMIT.
5. Orden alfabético confirmado por nombre/título. Propuesta técnica de orden estable display_key ascendente con comparación normalizada, luego entity_type e ID para empates. No usar bm25 ni relevancia para ordenar.

`des` encuentra desarrollo; `roll` no lo encuentra; `pena` no encuentra peña. Términos pueden estar en columnas distintas del mismo documento. Filtros Todas/Cualquiera son solo para etiquetas, no para texto.

Rebuild FTS y cambio de normalización bajo mantenimiento exclusivo, con preflight y verificación de conteos. Búsqueda por defecto excluye archivados, proyectos completados, tareas cerradas/eliminadas y tareas bajo proyecto archivado. Contextos derivados se consultan actuales para que cambios de scope/traslado se reflejen sin texto obsoleto.

## Revisiones y consistencia de lecturas

Mutaciones usan `UPDATE ... WHERE id=? AND revision=?` e incrementan revisión; cero filas es CONFLICT o NOT_FOUND comprobado sin filtrar entidades ocultas. No actualizar `updated_at` de una operación sin cambios ni emitir actividad ficticia.

Las operaciones de rama no confían únicamente en la revisión de raíz. Bajo escritura consultan miembros y sus revisiones, ancestros, proyecto/cliente, timers y vínculos relevantes. Comparan con preview aceptado, incluida membresía. Crear una hija después del preview invalida el conjunto aunque raíz no cambie.

Purga que desvincula nota/evento incrementa sus revisiones. Editar referencias/asignaciones cambia revisión del propietario. Cambiar scope no debe incrementar todas las tareas: el preview verifica cliente y conjunto/efectos derivados, y DTO distingue revisiones de contextos cuando la operación depende de ellos.

Lecturas compuestas, totales y previews utilizan una transacción de lectura corta para un snapshot coherente. No retener snapshot durante interacción humana. Los cursores no garantizan snapshot entre páginas; una mutación puede invalidar posición y exige refrescar. No prometer exportación consistente mediante paginación.
