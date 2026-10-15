# Contratos REST y CLI

[Índice del diseño](../diseno-tecnico-local.md). Contratos propuestos para implementar por unidad. Los ejemplos no son endpoints operativos. El dominio siempre vuelve a comprobar las reglas; validar DTO en NestJS no alcanza.

## Convenciones de transporte

Base `/api/v1`, JSON UTF-8, mismo origen HTTPS. UUID como strings. Dinero como strings. Día ISO e instante UTC milisegundos son tipos distintos. Campos omitidos en edición no cambian; null limpia un campo nullable; string vacío no reemplaza null salvo Markdown permitido. Rechazar propiedades desconocidas para evitar que cliente cambie campos inmutables.

POST de creación devuelve 201 con entidad/revisión; lecturas y acciones 200. Borrado devuelve 200 con IDs/efectos aplicados, no body ambiguo que impida saber el resultado. Sin mutaciones por GET. Listados no devuelven datos de acceso ni snapshots de actividad dentro de cada entidad.

Input de edición contiene `expectedRevision`. Acciones compuestas además usan acceptance. IDs nuevos se generan en aplicación; no suponer orden UUID. Un requestId operacional no es llave de idempotencia ni autoriza repetir una operación incierta.

Propuesta: no replay automático de POST/PATCH/DELETE tras timeout, socket cerrado o BUSY posterior al inicio. Clientes refrescan destino y muestran resultado desconocido si no pueden resolverlo. Una futura llave de idempotencia requiere diseño explícito de ledger/hash/retención; no afirmar exactly-once sobre red con estas revisiones.

## DTO comunes

```json
{
  "id": "6e784110-621c-4e7b-9785-d62e263941f9",
  "revision": 7,
  "createdAt": 1780570800000,
  "updatedAt": 1780571100000
}
```

Campos temporales de tarea:

```json
{
  "planned": { "kind": "day", "day": "2026-06-04" },
  "due": { "kind": "instant", "at": 1780596000000, "zone": "America/Bogota" }
}
```

Para entrada con hora usar `{kind:"local",day,time}` de Colombia y convertir en core a la forma instant de salida. `local` es input, no tercera forma persistida. `time` propuesto HH:mm, precisión minuto para formulario; metadata de timer mantiene milisegundos. La zona de salida es siempre America/Bogota. No aceptar zona configurable ni offset elegido por el consumidor; no introducir flujos DST de otras zonas.

Contextos derivados se devuelven como objetos separados de vínculos explícitos. Nota puede responder `links:{clientId,projectId,taskId,contactId}` y `derivedContexts`, sin copiar vínculos de tarea en links. Lista de scopes es cero/uno/dos valores, no un scope arbitrario. IDs derivados no son editables.

Lista propuesta:

```json
{
  "items": [],
  "nextCursor": null,
  "meta": { "limit": 50, "zone": "America/Bogota" }
}
```

Cursor opaco codificado con versión, datasetGeneration, orden, último tuple y hash de filtros. Validar límites y contenido, no ejecutar SQL desde cursor. Orden por default createdAt descendente/id ascendente. Cursores no garantizan snapshot entre páginas; si cambia dataset por restore devolver CONFLICT. Cambiar filtro reinicia cursor. No incluir totalCount costoso por default ni inventar filtros de producto.

## Errores y avisos

| Código | HTTP | Uso |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Campo, forma, fecha real, límite o propiedad desconocida. |
| `UNAUTHENTICATED` | 401 | Sesión ausente/inválida o login fallido genérico. |
| `FORBIDDEN` | 403 | CSRF/Origin, acción remota no permitida. |
| `NOT_FOUND` | 404 | ID inexistente o entidad no disponible en esa colección. |
| `CONFLICT` | 409 | Revisión, estado, unicidad o efecto de preview cambiado. reason tipado. |
| `CONFIRMATION_REQUIRED` | 409 | Operación válida que necesita aceptación explícita. |
| `BUSY` | 503 | Bloqueo SQLite/mantenimiento agotó espera acotada. |
| `RATE_LIMITED` | 429 | Login excede presupuesto. Propuesta técnica de protección. |
| `INTERNAL_ERROR` | 500 | Fallo no esperado, mensaje seguro y requestId. |

`reason` de CONFLICT distingue REVISION_MISMATCH, DESTINATION_CLOSED, CLIENT_ARCHIVED, OPEN_DESCENDANTS, HAS_ASSOCIATIONS, DUPLICATE_NAME, TIMER_ALREADY_ACTIVE, PREVIEW_CHANGED, DATASET_CHANGED. No cambiar reglas para hacer encajar HTTP. Datos y revisiones actuales se exponen solo a solicitante autorizado.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Revisa los campos indicados.",
    "fields": [{ "path": "title", "reason": "REQUIRED", "message": "Escribe un título." }],
    "requestId": "req-opaque"
  }
}
```

Avisos en éxitos: `warnings:[{code,fields,message}]`, por ejemplo PLANNED_AFTER_DUE o PROJECT_END_BEFORE_START. Un aviso no genera un 409 ni exige consentimiento salvo efecto confirmado que sí lo necesita. No enviar SQL, stack, rutas locales, cookies o hashes.

## Protocolo de efectos aceptados

Petición inicial de acción sin acceptance calcula preview dentro de snapshot corto y responde CONFIRMATION_REQUIRED. Preview propuesto contiene operation, targetId, datasetGeneration, digest de input, conjunto ordenado de `{type,id,revision}`, efectos `{code,targets,details}` y digest canónico de efectos.

```json
{
  "error": {
    "code": "CONFIRMATION_REQUIRED",
    "message": "El traslado afecta a la rama y a su tiempo.",
    "preview": {
      "operation": "task.move",
      "targetId": "6e784110-621c-4e7b-9785-d62e263941f9",
      "previewDigest": "sha256-del-preview-canónico",
      "effects": [
        { "code": "DETACH_FROM_PARENT", "targets": ["id-raiz"] },
        { "code": "MOVE_BRANCH", "targets": ["id-raiz", "id-hija"] },
        { "code": "STOP_TIMERS", "targets": ["id-timer"] },
        { "code": "REATTRIBUTE_ALL_TASK_TIME", "targets": ["id-raiz", "id-hija"] }
      ]
    }
  }
}
```

El reenvío conserva input e incluye acceptance con digest y todos los códigos/targets aceptados. El servicio no confía en el hash enviado: vuelve a descubrir conjunto, revisiones y efectos en escritura, calcula el mismo digest y compara. El hash no es firma, sesión, autorización ni secreto. Si cambia estado devuelve PREVIEW_CHANGED y nuevo preview para revisar; no ejecuta los efectos originales parcialmente.

Efectos temporales usan ID/revisión de timer y política de cierre, no duración exacta mostrada en preview, porque sigue transcurriendo tiempo. El commit corta al now efectivo dentro del límite; UI etiqueta el tiempo del preview como estimado. Una nueva entrada de tiempo previa al traslado cambia el alcance económico mostrado y debe invalidar preview si se resumía el total; no firmar un total que pueda cambiar sin revisión del conjunto.

Recomendación: comparar IDs/revisiones de entradas cuando se presenta cantidad/tiempo total histórico y vínculos cuya desvinculación se ofrece; acotar tamaño y usar digest agregado de consulta ordenada calculado por servicio. La aceptación incluye pertenencia de rama y asociaciones, no solo raíz. No mantener una transacción abierta esperando aceptación.

En retenciones, aceptar política/plazo y entidades afectadas, no un timestamp dependiente del instante de preview que cambiaría al confirmar. Corte, fecha de eliminación y materialización se fijan al commit. Valores temporales ilustrativos se presentan como estimados y quedan fuera del digest autoritativo.

## Catálogo de rutas

Todas requieren sesión y protección de mutación excepto bootstrap de login descrito en operación. Para cada recurso consultar GET colección y GET /:id; filtros solo confirmados o marcados propuestos. No existe PATCH universal de cualquier campo.

| Recurso | Escrituras propuestas | Campos permitidos/reglas |
|---|---|---|
| `/clients` | POST, PATCH /:id, POST /:id/change-scope, /archive, /reactivate, DELETE /:id | PATCH nombre completo/corto/observaciones. Scope solo acción confirmada. Delete sin asociaciones. |
| `/contacts` | POST, PATCH /:id, PUT /:id/clients, POST /:id/archive, /reactivate | Nombre/email/teléfono/observaciones; replace clients con revisión y selección explícita archivados. Sin DELETE. |
| `/projects` | POST, PATCH /:id, POST /:id/change-state, DELETE /:id | PATCH nombre/description/fechas. Cliente no cambia. Cierre guarda tiempo. |
| `/tasks` | POST, PATCH /:id, POST /:id/change-state, /reopen, /cancel, /move, /detach, /reparent, /today-selection, /delete, /purge | PATCH título/description/priority/blockedReason/planned/due y URLs controladas. No estado/proyecto/padre/deletedAt por PATCH. |
| `/notes` | POST, PATCH /:id, POST /:id/archive, /activate, /trash, /restore | PATCH título/body y cuatro links independientes. Purga automática, no agregar baja inmediata individual no acordada. |
| `/tags` | POST | GET listado/detalle. Sin PATCH/DELETE. |
| `/{clients,projects,tasks,notes,contacts}/:id/tags` | PUT | Reemplazo explícito de tagIds con expectedRevision; ninguna entidad extra etiquetable. |
| `/inbox` | POST, PATCH /:id, POST /:id/process, /discard | Captura editada y combinación final. Process no admite destino distinto de tarea/nota. |
| `/time-entries` | POST, PATCH /:id, DELETE /:id | Día/minutos/target. Manual sin horario; tiempo retenido rechazado para toda mutación. |
| `/timers` | POST /start, POST /:id/pause | GET activos. Start en Nueva también pasa tarea a En curso e incrementa su revisión, todo atómico; respuesta incluye ambos cambios. Reanudar crea nuevo intervalo vía start. Cierre por límite interno. |
| `/financial-movements` | POST, PATCH /:id, POST /:id/change-rate, DELETE /:id | Kind/amount/currency/day/concept/target. Rate solo change-rate, cambio moneda limpia tasa. |
| `/events` | POST, PATCH /:id, POST /:id/trash, /restore | Rango discriminado all_day/timed, contexto único. No recurrencia. |
| `/backups` | POST | Creación manual en carpeta configurada del anfitrión; GET listado mínimo de copias gestionadas. No restore web, subida, path arbitrario ni descarga/exportación de dominio. |

La consulta de backups gestionados y su listado mínimo es propuesta operativa para seleccionar copia manual, no inventario del sistema de archivos. Elegir carpeta alternativa se hace en CLI o configuración local explícita. UI puede solicitar crear copia y mostrar identificador/resultado sin revelar rutas a clientes remotos.

Tarea `change-state` solo cambia entre abiertas o a done; cancel/reopen pasan siempre por acciones propias. Cambios de color/nombre de etiqueta, cliente de proyecto y campos derivados se rechazan, no se ignoran.

| Lectura específica | Respuesta |
|---|---|
| `GET /today?scope=&clientId=&projectId=` | Tres grupos, una fila por tarea, motivos de inclusión, contexto y revisión. Orden confirmado + P7. |
| `GET /calendar?from=&to=` | Marcadores planned/due, eventos, closedTaskCounts por día. Zona fija Colombia y rango acotado. |
| `GET /calendar/closed-tasks?day=` | Lista pulsable de tareas representadas ese día, con filtros coherentes de vista. |
| `GET /search?q=&includeArchived=&includeClosed=` | Entidades permitidas, todos términos, orden alfabético y cursor por displayKey/tipo/ID. Filtros adicionales solo tras revisar alcance. |
| `GET /activity?from=&to=&entityType=` | Resumen y agrupación operationId, cursor estable. Sin context/action filters en v1. |
| `GET /activity/:id` | Detalle before/after expandible. Las filas de una nota borrada definitivamente ya no existen; devolver NOT_FOUND, sin placeholder redactado. |
| `GET /time-entries/totals?from=&to=` | Minutos totales como strings decimales por destinos permitidos, excluyendo tareas eliminadas; sin overflow al sumar entradas enteras seguras. |
| `GET /financial-movements/totals?from=&to=` | incomeCop/expenseCop/netCop strings, pendingConversionCount. |
| `GET /trash/notes`, `/trash/events` | Papelera recuperable separada. |
| `GET /deleted-tasks` | Consulta retenida, sin restaurar ni mezclar con papelera recuperable. |
| `GET /runtime` | Zona fija America/Bogota, hora host, versión de contrato/capacidades no sensibles, sin paths/secretos. |

Filtros de notas/contactos scope y etiquetas Todas/Cualquiera están confirmados. Contexto/type adicionales de búsqueda siguen propuestas, no incluirlos como si acordados. La lista de tiempo/finanzas puede filtrar por período y destino para su operación; forma final se valida en su unidad.

## Ejemplos de comandos

Crear tarea:

```json
{
  "projectId": "c012ecab-4f1a-4371-a7c3-5d038b66dc28",
  "parentId": null,
  "title": "Revisar propuesta",
  "description": "## Objetivo\nRevisar el contrato.",
  "planned": { "kind": "day", "day": "2026-06-04" },
  "due": null
}
```

No permitir `state` ni `priority` inicial arbitrarios: creación fuerza nueva/sin prioridad; editar después por comando normal.

Procesar captura a existente:

```json
{
  "expectedRevision": 3,
  "mode": "append_to_note",
  "targetId": "7c5b6c44-dbf0-4a0e-9e13-f35a1a2626a7",
  "targetExpectedRevision": 8,
  "finalContent": { "title": "Reunión", "body": "Contenido combinado y editado." }
}
```

Modes propuestos create_task/create_note/append_to_task/append_to_note. Son intención UI; el servicio guarda contenido final, no concatena automáticamente. Si hay error, la captura permanece.

## Paridad CLI

CLI `bitnode` comparte comando core, no invoca REST. Parser distingue argumento ausente de null explícito, valida strings monetarias y exige scope al crear cliente. No requiere contraseña HTTP ni servidor activo.

| Familia | Comandos propuestos |
|---|---|
| Organización | `client create/edit/list/show/change-scope/archive/reactivate/delete`; `contact create/edit/link-clients/archive/reactivate`; `project create/edit/change-state/delete`. |
| Trabajo | `task create/edit/list/show/change-state/reopen/cancel/move/detach/reparent/today/delete/purge`. |
| Conocimiento | `note create/edit/list/archive/activate/trash/restore`; `tag create/list`; `tag assign/remove --entity-type ... --entity-id ...`. |
| Captura | `inbox capture/edit/list/process/discard`. |
| Tiempo | `time add/edit/list/totals/delete`; `timer list/start/pause/resume`. Resume es nuevo start de dominio. |
| Finanzas | `finance add/edit/list/totals/change-rate/delete`. |
| Consulta | `today`, `calendar`, `search`, `activity list/show`, `trash list`, `deleted-tasks list`. |
| Operación | `setup`, `password reset`, `server start/stop`, `tls setup/status/renew`, `db migrate/check`, `backup create/list/restore`, `service install/uninstall` con confirmación explícita. |

Interactividad solo con TTY. Cuerpos largos por stdin o `--body-file` local leído con límites, nunca ejecutar contenido como shell. JSON usa stdout para resultado/errores estructurados; mensajes operativos humanos van a stderr, sin contaminar stdout. Secretos por prompt oculto o stdin explícito, nunca en flags ni historial shell.

`--json` no habilita consentimiento genérico. `--dry-run` devuelve preview sin modificar dominio. En scripts, acción compuesta requiere `--preview-digest` y flags por efecto como `--accept-stop-timers`, `--accept-detach`, `--accept-time-reattribution`, `--accept-cancel-descendants`, `--accept-reactivate-project`. El digest vincula targets concretos; flags solos no aceptan consecuencias desconocidas. No ofrecer `--yes` universal.

Operaciones simples requieren `--expected-revision` en modo no interactivo. En modo interactivo CLI lee entidad/revisión antes de formulario, conserva esa revisión y valida al guardar, no obtiene una revisión fresca para sobrescribir cambios sin avisar.

Códigos salida propuestos: 0 éxito, 2 validación/uso, 3 no encontrado, 4 conflicto, 5 confirmación faltante, 6 busy, 7 acceso local/seguridad, 1 fallo interno. Mismo `error.code` que REST, con código específico de CLI para fallos filesystem. Ctrl-C antes de commit no escribe; Ctrl-C después o timeout puede dejar resultado incierto y exige consulta, no replay.

## Límites propuestos

| Dato | Límite inicial para revisar |
|---|---|
| Título/nombre | 500 puntos de código Unicode; título generado se recorta sin partir secuencias, conservando cuerpo. |
| Markdown/observaciones/cuerpo captura | 1 MiB UTF-8 por campo; body request máximo 2 MiB. |
| URL | 4096 caracteres; http/https explícitos como política técnica inicial. No consultas remotas. Duplicadas permitidas, sin restricción de unicidad. |
| Referencias tarea | 100; nombres opcionales <=500 caracteres. |
| Búsqueda | 500 caracteres, hasta 20 términos; sin sintaxis FTS del usuario. |
| Página | 50 default, 200 máximo; rangos calendario máximo 366 días. |
| Importe | Hasta 30 dígitos enteros positivos; tasa hasta 20 dígitos enteros +2 decimales. |
| Minutos | Entero positivo seguro JS <=9.007.199.254.740.991; UI puede advertir valores inusuales sin alterar regla mínima. |
| Rama/vínculos | No profundidad funcional arbitraria; validación iterativa/CTE, digest de conjuntos y límite HTTP. Si una operación excede presupuesto, devolver error seguro sin ejecución parcial. |

Son límites de protección propuestos, no nuevas decisiones de producto. El límite HTTP no puede hacer imposible una operación válida sin una alternativa CLI documentada o paginación de preview. Revisar con datos de prueba en cada unidad, no imponer límites ocultos al usuario.
