# Dominio, comandos y transacciones

[Índice del diseño](../diseno-tecnico-local.md). REST y CLI llaman a los mismos casos de uso. La autorización HTTP pertenece al servidor; las reglas de negocio pertenecen a core y se comprueban con SQLite real en integración.

## Modelo de ejecución

Un comando recibe input validado, revisión esperada donde corresponda, actor de transporte y aceptación de efectos opcional. Devuelve resultado con DTO de dominio, avisos no bloqueantes y revisiones nuevas. No lanza excepciones SQL a los adaptadores.

Puertos propuestos: `Clock`, `ZoneProvider`, `IdGenerator`, `UnitOfWork`, repositorios por capacidad, `SearchIndex` y `ActivityWriter`. La unidad de trabajo suministra repositorios ligados a la misma conexión/transacción. Ningún repositorio inicia una transacción independiente dentro de un caso de uso compuesto.

Secuencia de escritura:

1. Validar forma/límites y permisos de transporte antes de adquirir recursos.
2. Adquirir bloqueo normal de datos; abrir conexión configurada, si no existe.
3. Obtener escritura `BEGIN IMMEDIATE`, con espera acotada.
4. Leer estado actual y comprobar revisiones, restricciones y efectos aceptados.
5. Tomar un único instante de operación. Usar America/Bogota para fechas y días civiles, sin consultar cambios de zona del equipo.
6. Escribir dominio, tiempo asociado, FTS y actividad aplicable.
7. COMMIT. Devolver solo después de éxito; ante error, ROLLBACK y cierre seguro.

No ejecutar Argon2, generar certificados, leer input humano o hacer red dentro de una transacción de dominio. Las lecturas que solo presentan estado no reconcilian timers ni producen actividad; arranque y comandos de mantenimiento ejecutan reconciliación separada antes de servir lecturas.

## Catálogo de capacidades

| Familia | Casos de uso y reglas | Actividad de producto |
|---|---|---|
| Cliente | Crear/editar nombre, corto, observaciones; cambiar scope con confirmación; archivar/reactivar; borrar sin asociaciones. Scope obligatorio sin default. | No. |
| Contacto | Crear/editar, vincular/desvincular clientes, archivar/reactivar. Nombre duplicado permitido, un email/teléfono, sin cargo ni borrado. | No. |
| Proyecto | Crear, editar nombre/Markdown/fechas, cambiar estado, borrar sin asociaciones. Cliente fijo, unicidad por cliente. | No, salvo tiempo cerrado como efecto. |
| Tarea | Crear/editar campos, URLs/etiquetas, cambiar estado, seleccionar Hoy, separar/reparentar, mover/eliminar/purgar rama. | No, salvo efectos de tiempo. |
| Nota | Crear/editar, vínculos independientes, etiquetas, archivo/reactivación, papelera/restauración y purga automática. | Creación/edición y operaciones de nota con payload restringido. |
| Etiqueta | Crear nombre/color y asignar/quitar de las cinco familias. Sin rename/color update/merge/delete. | Etiqueta/asignación, sin añadir evento de tarea/cliente por ese hecho. |
| Inbox | Crear/editar, procesar a tarea/nota nueva o existente, descartar. | Captura y procesamiento/descarte; nota creada/editada si corresponde. |
| Tiempo | Crear/editar manual, editar entrada guardada, borrar confirmado, iniciar/pausar/reanudar/cerrar timer, reconciliar vencidos. | Eventos de tiempo aprobados. |
| Finanzas | Crear/editar, cambiar tasa confirmado, borrar confirmado, consultar totales COP. | Creación/edición/tasa/baja. |
| Evento | Crear/editar, papelera/restaurar, purga automática y consultas calendario. | Operaciones de evento incluidas; purga no debe inventar evento de tarea. |
| Consulta | Listados, detalle, Hoy, calendario, búsqueda y actividad. | No por leer/buscar. |
| Operación | Setup, login/logout/reset, certificados, migrar, backup, restore, servicio opcional y mantenimiento. | No; logs operativos separados. |

Las acciones exactas de archivo/restauración, asignación de etiqueta y bajas de tiempo se codifican bajo la familia aprobada, sin inventar historial de entidades excluidas. La lista de nombres de acciones se verifica en T18. P2 ya está resuelto para notas: su borrado definitivo elimina también su actividad; no extender por inferencia esa política a las demás familias.

## Clientes y proyectos

Cambiar scope del cliente recalcula contextos derivados en consultas, no reescribe scope de todos los proyectos/tareas. Preview incluye impacto en proyectos/tareas y scopes de notas/contactos relacionados; aceptar el cambio no acepta otras mutaciones.

Archivar cliente falla si existen proyectos active/paused. No ofrece cerrar proyectos implícitamente. Crear/reactivar proyecto con cliente archivado devuelve regla bloqueante que exige reactivar cliente mediante operación previa explícita. Los vínculos opcionales a cliente/contacto archivados sí se permiten mediante selección explícita, sin reactivación.

| Estado proyecto origen | Destino | Condición/efecto |
|---|---|---|
| active/paused | active/paused | Cambio permitido, sin modificar planificación. |
| Cualquiera | completed/archived | Sin tareas abiertas; detener/guardar timer directo en transacción. |
| completed/archived | active/paused | Cliente no archivado; reactivación explícita o efecto aceptado de reapertura de tarea/timer. |
| completed | archived, y viceversa | Sin tareas abiertas; conservar fechas planificadas. |

No hay fecha de comienzo/fin real de proyecto. Fechas de planificación invertidas producen aviso, no error.

## Tareas y transiciones

Abiertas son new/in_progress/blocked/in_review. Cerradas son done/cancelled. Los identificadores son propuestas; las seis etiquetas de producto están confirmadas.

| Transición | Condición y efectos |
|---|---|
| Crear | Proyecto active/paused, padre vivo del mismo proyecto y abierto para no crear hijas abiertas bajo cerrado. Nueva, sin prioridad. La regla de padre cerrado se aplica ofreciendo reapertura explícita antes, no creando contradicción. |
| Abierta → otra abierta | Libre. Sin flujo obligatorio Nueva→En curso→Revisión. Bloqueo admite motivo opcional. |
| Abierta/cancelled → done | No quedan descendientes abiertos; detener/guardar timer propio y registrar last_completed_at. |
| Cualquiera → cancelled | Si hay descendientes abiertos, ofrecer cancelar todos o abortar. Cerrados conservan estado. Detener/guardar timers afectados. Desde done conserva última finalización. |
| done/cancelled → abierta | Reopen devuelve tarea y ancestros cerrados a in_progress, limpia last_completed_at; proyecto cerrado se reactiva solo con efectos aceptados. Cliente archivado bloquea hasta operación previa. |
| done → done | No nuevo cierre ni nuevo timestamp por un reenvío sin cambio. |
| Seleccionar/quitar Hoy | Cambia flag; no cambia fechas. Cerrar limpia selección manual; retirar flag no excluye reglas automáticas. |

La reapertura siempre vuelve a en curso, aunque un consumidor solicite new/blocked desde cerrada: primero debe ejecutar reopen y después transición abierta. `PATCH` no elude esto. Reparentar bajo ancestro propio falla por ciclo. Adoptar rama abierta bajo padre cerrado requiere la misma reapertura explícita; no decidir automáticamente qué ancestros reabrir.

La aceptación de crear/reparentar bajo padre cerrado no está detallada en las rondas como interacción específica. Propuesta conservadora: exigir padre abierto o reapertura previa por el caso existente, no añadir un flujo combinado nuevo sin revisión de T8.

Separar hija quita parent_id, conserva proyecto, datos y descendientes. No detiene timers porque no cambia destino de atribución. Mover a otro proyecto siempre es otra acción confirmada.

### Traslado de rama

1. Leer raíz, descendientes, padre externo, proyecto origen/destino y clientes. Destino active/paused, nunca cerrado ni siquiera para rama totalmente cerrada.
2. Si se trata de hija y cambia de proyecto, incluir efecto de separación del padre. Rama entera se conserva internamente.
3. Preview enumera IDs/revisiones de rama, timers activos, proyectos/clientes y efectos de atribución del tiempo anterior. Una hija nueva después del preview invalida ese preview.
4. En escritura volver a descubrir la rama y comparar efectos/revisiones. Validar destino otra vez.
5. Materializar timers de la rama hasta el instante efectivo; no reiniciarlos.
6. Quitar vínculo externo de raíz si hace falta. Actualizar project_id de todas las tareas de la rama e incrementar revisiones. FK compuesta diferible exige coherencia al COMMIT.
7. Tiempo sigue task_id; no modificar manualmente registros históricos para simular otro destino. Notas con task_id y eventos derivados siguen tarea; vínculos propios de nota permanecen intactos.
8. Actualizar documentos FTS cuyo texto cambió solo si hay texto modificado. Contexto se filtra vía joins actuales.
9. Emitir actividad de tiempo aplicable, no evento de traslado de tarea. COMMIT único.

Si destino igual al origen, usar separar/reparentar para cambiar jerarquía. No convertir no-op de traslado en cierre de timers sin que el usuario haya aceptado ese efecto.

### Eliminación y purga

Eliminar raíz marca toda rama como deleted_at, limpia selección Hoy, detiene/guarda timers y excluye su tiempo de totales inmediatamente. Irrecuperable aunque se retenga. Capturas/nuevas entradas/vínculos no pueden apuntar a tareas eliminadas. Tiempo retenido solo consulta, sin editar ni borrar individualmente.

Purga automática al vencer retención o purga definitiva solicitada de rama: borrar tiempos, referencias y etiquetas asignadas; poner task_id=null en notas/eventos vivos o en papelera, aumentando revisiones; borrar tareas de abajo arriba. No borrar notas/eventos ni sus otros vínculos. La purga solicitada exige consentimiento específico y también guarda/detiene timers si la tarea estaba viva.

Si una tarea eliminada contiene descendientes con fecha de eliminación distinta por operaciones anteriores, al eliminar ancestro conservar el plazo original de cada fila, sin extender retención silenciosamente. Purga por conjuntos coherentes que no dejen hijos apuntando a padre purgado. La estrategia exacta se verifica en T11, sin vaciar toda rama temprano por el vencimiento de una hija.

## Notas, etiquetas e Inbox

Crear nota admite título o cuerpo, nunca ambos vacíos. Si falta título, extraer primer encabezado Markdown o primera línea con contenido y persistirlo. Propuesta: quitar marcadores del encabezado y usar texto visible; límite de título y truncamiento determinista en T12, sin cambiar cuerpo. Una edición posterior del cuerpo no regenera título.

Vínculos de nota son explícitos y separados. No sincronizarlos al mover tarea. Selectores ocultan archivados por defecto, con opción explícita cuando el vínculo opcional lo permite. No validar igualdad cliente/proyecto/tarea/contacto.

Papelera requiere confirmación. Restaurar nota deja archived_at y trashed_at null; por P5 conservar solo vínculos existentes, sin reconstruir los eliminados por purga. Evento restaura rango/contexto existentes sin una condición de archivo que no tiene. Permitir restaurar antes de cumplir 30 días completos; desde ese límite no restaurar aunque el worker aún no haya borrado físicamente la fila.

Al borrar definitivamente una nota, eliminar sus asignaciones, documento FTS y todas las filas de Actividad ligadas a ella en la misma transacción. No añadir una nueva fila de borrado que mantenga la nota en Actividad ni dejar una fila con texto oculto. Archivo/papelera temporal no disparan este borrado del historial.

Referencias de tarea admiten URLs duplicadas. Validar sintaxis y texto, pero no rechazar, fusionar o quitar duplicados automáticamente.

Etiquetas no tienen edición ni baja. Crear color null fija ausencia para siempre. Asignar/quitar exige revisión del dueño y no cambia nombre/color. No crear etiqueta implícita por typo al seleccionar.

Procesar Inbox recibe contenido final editado, no instrucciones de merge silencioso. Para destino existente exige revisión de captura y destino. Para tarea nueva proyecto obligatorio, estado nueva; nota nueva con vínculos elegidos y regla de título. Crear/editar destino, índices/actividad y borrar captura ocurren en la misma transacción. Fallo de cualquiera conserva captura y destino anterior. Descartar captura es borrado definitivo confirmado.

## Tiempo exacto

Carga manual admite destinos cerrados no eliminados. Minutos enteros >=1. Fecha se guarda tal cual tras validación civil. Edición de entrada puede cambiar día/minutos/destino; si fuente timer mantener metadatos originales y marcar corrected_at. No recalcular los minutos editados desde el intervalo original.

Cada entrada valida un entero seguro, pero su suma puede superar Number.MAX_SAFE_INTEGER. Propuesta: sumar minutos mediante BigInt en servicio y devolver totales como strings decimales; no un SUM SQLite susceptible de overflow ni Number truncado.

### Materialización de temporizador

`end = min(now, started_at + 12h)`. Un retroceso de reloj no genera duración negativa; si now<started_at, reportar anomalía operativa y permitir reconciliación posterior, sin inventar tiempo. El reloj UTC persistido no equivale a monotónico a través de reinicios.

1. Bajo escritura leer timer actual con revisión y destino.
2. Usar America/Bogota. No congelar zona por intervalo ni resolver cambios del equipo; esos escenarios no forman parte de esta versión.
3. Dividir [start,end) por medianoches civiles reales de esa zona. No iterar incrementando 24h.
4. Por tramo positivo guardar `ceil(durationMs / 60000)` en el día civil, ID intervalo y segment_index. Omitir todo tramo exactamente cero, sin mínimo artificial.
5. Quitar fila timer activa en la misma transacción. Actividad por cierre y entradas con un operation_id.

Dos procesos consumen secuencialmente; el segundo no encuentra fila. Si un comando exige pausa de ID consumido devuelve conflicto/estado actual, no vuelve a sumar tiempo. La unique de tramo agrega defensa contra error de reconciliación, no habilita ignorar una inserción que habría fallado.

El worker debe cerrar al límite y materializar al pausar/cerrar/mover/eliminar. No materializar parcialmente cada segundo o cada minuto: duplicaría redondeos. Si se decide materializar a medianoche mientras timer sigue abierto, requerirá un cursor persistido de tramo y pruebas específicas, no forma parte de esta propuesta inicial. Las vistas pueden mostrar estimación sin persistirla.

Arranque y entrada CLI reconcilian vencidos idempotentemente. Servidor despierta para el siguiente límite con comprobación periódica de respaldo, tolerante a suspensión macOS; CLI observa límites antes de sus comandos. Ningún GET HTTP produce cierre oculto.

Iniciar timer requiere destino vivo y exclusión por destino. Tarea cerrada ofrece reopen + ancestros + proyecto aceptados; cliente archivado exige reactivación previa. Tarea bloqueada/en revisión permite iniciar sin cambiar estado. Por P10, Nueva pasa a in_progress en la misma transacción que crea el timer, incrementando revisión de tarea. Si no se puede crear timer, no cambiar estado. La respuesta devuelve timer y nueva revisión/estado de tarea para actualizar UI. Proyecto pausado admite timer sin activarlo silenciosamente. Reanudar equivale a crear otro intervalo con nuevo ID/límite; no resucitar fila eliminada ni sumar sobre límite anterior.

Ejemplos de aceptación:

| Intervalo | Resultado |
|---|---|
| 2m exactos | 2 minutos. |
| 2m1s | 3 minutos. |
| 23:59:30–00:00:30 | 1 +1 minutos en dos días, no un único minuto. |
| 1m10s, pausa, 20s | 2 +1 minutos en intervalos independientes. |
| Reinicio al cabo de 15h | Guardar solo hasta 12h, repartidas por días civiles. |
| Dos tareas 10m simultáneas | Total 20m, sin deduplicar ni aviso. |

## Dinero exacto

COP/USD importes en unidades enteras, no centavos ni dólares fraccionados. Entrada JSON y almacenamiento texto decimal. El parser no acepta exponente, decimal en importe, signos ni separadores regionales en API; UI traduce formato visual sin aritmética flotante.

Tasa COP/USD hasta dos decimales. Convertir decimal a centésimas enteras por procesamiento de string. Para USD con importe A y tasa R en centésimas:

```text
cop = (A * R + 50n) / 100n
signedCop = income ? cop : -cop
```

División BigInt entera positiva antes de aplicar signo. COP equivalente es A sin tasa. Ejemplo A=3 USD, tasa=4000.50, R=400050, equivalente=12002 COP. No redondear la suma de fracciones al final. Con USD sin tasa, excluir movimiento del total y devolver número de pendientes visible.

Totales de ingreso/gasto/neto suman equivalentes exactos por movimiento, expresados como strings. No `SUM` sobre importes texto ni conversiones a Number para calcular. Paginar lectura por lotes internos si hace falta, con un mismo snapshot para total coherente.

Cambiar moneda limpia tasa y se informa como efecto/aviso, nunca reutiliza tasa de otra moneda. Modificar tasa existente o retirarla exige confirmación del recálculo de períodos anteriores. Crear USD con tasa inicial no es edición histórica. Reembolsos son movimiento contrario independiente. Borrar movimiento exige confirmación y recalcula vistas sin snapshots históricos.

## Fechas, Hoy y calendario

Representar día puro y momento con hora como tipos diferentes. Con hora, input día/hora de Colombia que core convierte a instante UTC; persistir instante sin una zona por registro. America/Bogota es fija para esta versión. No diseñar selector de zona, manejo de cambios del equipo ni flujo DST de otras zonas.

Advertencia de planificación posterior al límite compara instantes cuando ambos tienen hora; con día puro compara días civiles en America/Bogota y presenta aviso solo cuando inequívocamente posteriores. No inventar medianoche UTC ni bloquear guardado por aviso.

Hoy calcula el día actual de Colombia, independientemente de la zona del equipo anfitrión o navegador LAN. Incluye tarea abierta no eliminada si manual OR planned civil<=hoy OR due civil<=hoy OR in_progress. Incluir todas las horas de hoy es propuesta P7. Una fila por tarea, aunque cumpla varias condiciones, con ruta de ancestros como contexto. Proyectos pausados incluidos.

Tres grupos principal/bloqueadas/revisión; principal in_progress primero, después priority high/medium/low/none y due más temprano, null al final. P7 propone desempate created_at/id. Filtros scope/cliente/proyecto no escriben selección ni fechas.

Calendario recibe rango civil; eventos all_day se intersectan inclusivamente, timed por instantes presentados en America/Bogota. Tareas tienen marcadores independientes planned/due, no duración ficticia entre ambos. Cerradas solo conteo pulsable por sus fechas representadas, no por last_completed_at inventado como tercer marcador. P7 propone unique task/day si planned=due mismo día. Arrastre escribe únicamente planificación con revisión; conserva modalidad día/hora y pide hora si falta definición de drop, no toca límite.

## Actividad y retención

Cada comando genera operation_id y filas ordenadas para acciones incluidas. Actor web/CLI puede ser metadata técnica interna; no introducir autores colaborativos. Before/after se limita a campos de dominio incluidos, sin secretos, payload SQL o rutas de backup.

Actividad de tiempo al cerrar desde movimiento/eliminación de tarea es válida; un evento adicional de acción tarea no lo es. Procesamiento Inbox produce fila captura y, si aplica, nota, sin fila de creación de tarea. Cambios del tiempo se documentan con valores anteriores/nuevos dentro de su familia.

P3 confirmado: tareas/notas/eventos vencen al cumplir 30 días completos desde deleted/trashed_at; Actividad al cumplir un año desde la acción. Propuesta técnica: plazo de 720h y aniversario a la misma hora de Colombia, ajustando 29/02 a 28/02 cuando no existe esa fecha. Purga toma cutoff único por lote y vuelve a validar dentro de escritura. Lotes pequeños, idempotentes; puede correr servidor o CLI, con exclusión de escritura SQLite.

Por P2, la actividad de una nota termina antes del año si la nota se borra definitivamente: se eliminan las filas ligadas a ella, con texto y resumen, no solo se redactan. Para eventos/capturas u otras familias no se ha acordado extender esa eliminación; no reutilizar la decisión como política general. No prometer borrado completo de copias históricas: los backups manuales no se reescriben automáticamente al borrar dominio y su conservación se explica en operación.
