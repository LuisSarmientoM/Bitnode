# Verificación, puertas y unidades de implementación

[Índice del diseño](../diseno-tecnico-local.md). La documentación cubre el producto, pero no demuestra que driver, bloqueos o distribución funcionen. Aquí se define evidencia exigible antes de entregar cada unidad del [plan](../plan-implementacion-local.md).

## Estado de evidencia

| Evidencia | Estado real |
|---|---|
| Código de app, migraciones, endpoints y componentes | No implementados. |
| Tests funcionales, unitarios, integración, E2E o build | No ejecutados; no hay runner de app. |
| Lectura de fuentes y comparación de acuerdos | Ejecutada sobre propuesta, revisión, plan, brief e historial dirigido. |
| Consulta de SQLite y OWASP | Fuentes documentales externas consultadas, no experimentos locales. |
| Delegación de redacción/auditoría | Primeras dos tareas canceladas con cero tool calls. Verificador independiente posterior timed_out tras 4min esperando permiso del MCP de proyecto Stitch. Sin revisión entregada ni permiso inventado; no se modificó su configuración. |
| Evaluación nativa | ASSESS devolvió unassessable por archivos untracked sin declaración explícita. Indicó autoverificación y verificador independiente, que se intentó y no entregó revisión. No existe aprobación nativa de esta entrega. |
| Enlaces y estructura | Python sobre los 13 Markdown activos/archivados: enlaces locales/anchors sin ausencias; siete ejemplos JSON del diseño válidos; fences, espacios finales, conflictos y patrones básicos de secreto sin hallazgos en siete archivos nuevos. No es una auditoría de secretos completa. |
| Diff | `git diff --check` sin errores. Los archivos nuevos se comprobaron también directamente, porque el diff Git no incluye untracked. |
| Coherencia | Lectura manual de acuerdos y excepciones frente a capítulos; propuestas y preguntas separadas. No sustituye revisión independiente ni pruebas de aplicación. |

TDD no tiene un RED funcional significativo para documentos pasivos de una app que aún no existe. En esta entrega corresponde verificación estructural. En implementación, aplicar RED/GREEN/casos alternativos/refactor con resultados reales por unidad, no inventarlos retroactivamente.

## Datos base para pruebas futuras

Proponer fixtures reproducibles y aisladas, sin datos reales ni escribir la carpeta del usuario:

- Clientes "Peña Digital" work, "Pena Digital" personal y "Árbol". Distinguir Peña/Pena; Árbol/ARBOL colisionan. Nombres cortos tienen unicidad propia, no se cruzan artificialmente con full_name.
- Un cliente archivado sin proyectos activos; otro con proyecto pausado que impide archivo. Contacto libre y contacto ligado a los dos scopes.
- Proyectos A active y B paused en clientes diferentes; C completed y D archived. No permite cambiar su cliente.
- Rama raíz→hija→nieta, una descendiente done y otra blocked, timers en varias tareas y uno directo por proyecto.
- Nota que enlaza explícitamente cliente personal, proyecto work, tarea de otro proyecto y contacto transversal. Otra nota libre, otra archivada y otra en papelera.
- Captura para procesar a existente con revisiones de captura/destino, referencias con duplicado exacto y variantes de URL.
- Movimiento COP, USD convertido, USD pendiente y gastos, incluyendo redondeo 0.5 y valores mayores al rango seguro de Number.
- Eventos timed cero duración y all_day del día 10 al 12 inclusivos. Tarea planned/due mismo día.
- Zona fija America/Bogota. Reloj inyectable y origen UTC fijo; resultado igual aunque el host/navegador/CI use otra zona. No probar flujos DST de otras zonas como capacidad de esta versión.

P1–P6 y P8–P12 están resueltas en el índice; fixtures deben comprobar esos acuerdos. P7 sigue pendiente de aclaración y no se aprueba mediante una fixture.

## Matriz T1–T20

| Unidad | Checks de aceptación | Evidencia y puerta |
|---|---|---|
| T1 Base | Build workspace, web estática por servidor, /api inexistente no devuelve HTML, CLI help con servidor apagado, assets sin CDN. | Logs de build/arranque limpio; versiones/arquitecturas fijadas y autorización de implementación. |
| T2 Persistencia | FKs ON en cada conexión, WAL efectivo, FTS5 presente, CHECK/unique, transacciones reales; dos procesos normales y exclusión de mantenimiento. | SQLite real y procesos separados; no mock de lock ni prueba con dos objetos mismo proceso. |
| T3 Comunes | Ñ/n, vocales, Unicode compuesto; días reales/leap, Colombia fija; dinero exacto y límites de strings. | Suites deterministas con Clock/Zone controlados, valores >2^53. |
| T4 Seguridad | Loopback/LAN sin cookie 401, reset invalida, CSRF/Origin/Host, login CSRF/fixation/throttle, no HTTP fallback. | Prueba de API y navegador +TLS desde otro dispositivo; medir Argon2 por arquitectura. |
| T5 Clientes/contactos | Scope obligatorio, únicos completos/cortos independientes, contactos duplicados/libres/transversales, vínculos archivados explícitos, tags sin edit/delete. | Core +SQLite +REST/CLI; cambio scope confirmado y bloqueo archivo. |
| T6 Proyectos | Cliente fijo, nombre único por cliente, fechas invertidas aviso, no tareas abiertas al completar/archivar, cliente archivado impide crear/reactivar. | Pruebas de transición y ausencia de reactivación implícita. |
| T7 Tareas | Crear nueva/sin prioridad desde REST/CLI/Inbox, proyecto obligatorio, planned/due separados, aviso no bloqueo, URLs y revisiones de referencias. | Contrato y negativa de campos inmutables; duplicadas permitidas P4; validar sintaxis y revisión de referencias. |
| T8 Jerarquía | Ciclos rechazados, parent/proyecto FK, cerrar padre con abierta falla, cancel descendientes solo consentimiento, reopen ancestros/proyecto a in_progress. | Transacciones con rollback; cambio de miembros tras preview invalida; padre cerrado requiere operación previa propuesta. |
| T9 Tiempo manual | >=1min, fecha/minutos/destino editables, destinos cerrados válidos, eliminados no, metadata timer corregida conserva original. | Totales derivados antes/después de traslado; sin SUM flotante ni repartición histórica por zona. |
| T10 Timers | Uno por destino multiproceso, simultáneos distintos, pausa/resume, reinicio/suspensión, límite12h, medianoche Colombia/ceil, tramo cero omitido y consumo único; Nueva→En curso al iniciar. | Reloj controlado y dos procesos; probar rollback de estado si falla creación de timer. |
| T11 Movimiento/bajas | Traslado toda rama, separación hija, destino cerrado siempre falla, tiempo anterior sigue destino, timers cerrados sin reinicio, deletion irrecuperable. | Composición tiempo/vínculos/FTS atómica; retención de 30 días completos y purga inmediata solicitada, según P3. |
| T12 Notas/tags | Título generado y estable, solo título permitido, ambos vacíos no, links cruzados, archivo ≠papelera, restore activa, tag color fijo incluso null. | UI/REST/CLI con reglas compartidas; restore conserva solo vínculos existentes, P5 confirmado. |
| T13 Inbox | Captura global, editar antes crear/combinación, guardar destino+retirar atómico; falla en cada paso preserva origen/destino. | Inyección de errores tras update/insert/FTS/activity/delete, transacción real; página propia Inbox, acceso global solo agregar, P9 confirmado. |
| T14 Finanzas | Enteros COP/USD, tasa string positiva <=2dec, redondeo por movimiento, pending excluido/visible, cambio moneda limpia, tasa histórica confirmada. | Casos BigInt y totales/edición/borrado consistentes, sin Number como autoridad. |
| T15 Eventos | Contexto único y derivado tarea móvil, timed fin>=inicio con igualdad, all_day último inclusivo, papelera/restauración/purga. | Calendar/vínculos antes/después de mover/purgar; plazos completos y vínculos existentes confirmados. |
| T16 Hoy/calendario | Selección manual OR automática, abiertos solamente, pausados incluidos, tres grupos/orden, lista plana, scope/contexto, drag solo planned, cerradas conteos. | Browser tests al viewport revisado +consultas reales; P7. |
| T17 Búsqueda | Prefijos no fragmentos, todos términos campos distintos, ñ, filtros antes LIMIT, scope nota/contacto, excluir familias no admitidas, rebuild equivalente. | SQLite FTS5 real; SQL input malicioso no ejecuta operadores arbitrarios; orden alfabético por nombre/título P8, no bm25. |
| T18 Actividad | Familias solo aprobadas, payloads before/after, agrupación, período/tipo, no tareas/clientes/proyectos/contactos, retención anual; eliminar historial de nota al borrarla definitivamente. | Matriz evento por comando/no-op y borrado P2 atómico sin fila redactada ni actividad nueva de purga. |
| T19 Operación | Backup con WAL activo desde web/CLI, depuración auth/secretos, manifest/integridad, restore exclusivo/atomicidad/recovery, retención idempotente. | Restore real en DB aislada; inyección crash/ENOSPC, P11 contraseña actual conservada/sesiones invalidadas; P12 timers cerrados sin reinicio; nota vencida y actividad eliminadas juntas. |
| T20 Distribución | Instalación limpia macOS, arm64/x64 elegidos, drivers nativos, migración/actualización, recursos offline, LAN dispositivo real, CLI sin servidor. | Recorrido completo y desinstalación conservando datos; no declarar binario único sin prueba. |

Cada unidad de dominio entrega core/db/REST/CLI y UI cuando el grupo esté revisado. Si UI se divide, marcar capacidad web incompleta expresamente. Actividad aplicable se escribe desde la unidad de origen, no inventar historia al implementar T18.

## Escenarios de concurrencia obligatorios

| Carrera | Resultado esperado |
|---|---|
| Web y CLI editan tarea rev7 | Solo primera escritura llega a rev8; segunda CONFLICT, sin overwrite. |
| Dos procesos start timer misma tarea | Una fila activa, una operación exitosa y otra TIMER_ALREADY_ACTIVE/conflicto. |
| Dos procesos cierran timer vencido | Entradas únicas, timer consumido una vez y actividad no duplicada. |
| Confirmar move mientras otro crea hija | Preview cambia y no mueve conjunto antiguo ni ignora nueva hija. |
| Confirmar close proyecto mientras otro crea tarea | Cierre vuelve a consultar abiertas bajo escritura y falla seguro. |
| Scope cliente cambia mientras se confirma operación con contexto | Revisión del cliente/efectos actuales invalida consentimiento viejo. |
| Purga desvincula nota mientras usuario la edita | Revisión nota incrementada; usuario revisa conflicto, no repone taskId purgado. |
| CLI migración/restore con servidor abierto | EX no adquirido, no archivo sustituido ni schema parcial. |
| Lock path se resuelve por alias | Mismo inode canónico y exclusión; rutas DB hardlink/no soportadas rechazadas. |
| Proceso muere con SH o EX | OS libera bloqueo tras descriptores; journal controla trabajo incompleto. |

Coordinar procesos con barreras deterministas de tests, no esperas arbitrarias que pueden dar falsos positivos. Probar kill tras adquirir lock, tras BEGIN, tras insert tiempo y antes/después COMMIT. SQLite garantiza transacción, no atomicidad de todos los archivos de restore.

## Fechas y fronteras

- Validar 2028-02-29 y rechazar 2026-02-29/2026-04-31.
- Conversión UTC↔Colombia y medianoche America/Bogota, independiente de zona host/browser. Sin selector de zona ni flujo DST.
- Evento all_day 10–12 aparece en tres días; timed inicio=fin aparece como marcador, no como notificación.
- Timer comienza 23:59:30 y final00:00:30: dos entradas1min. Medianoche exacta no crea tramo cero ni minuto artificial, P6 confirmado.
- Límite12h no se renueva al dividir día ni al refrescar UI. Reloj hacia atrás no crea minutos negativos.
- Zona del equipo diferente no altera presentación ni días guardados: la app sigue usando Colombia.
- Retención justo antes, en y después de cutoff con worker atrasado. Restore solo dentro de ventana aunque aún exista fila.
- Actividad en29/02 y paso a año no bisiesto según decisión P3; cutoff no depende de timezone del navegador.

## Dinero y búsqueda

| Caso | Esperado |
|---|---|
| 3 USD ×4000.50 | 12002 COP por redondeo movimiento. |
| Importe1 USD, tasa0.49 | 0 COP convertido válido; pendiente es únicamente ausencia tasa, no equivalente0. |
| Dos movimientos 1 USD ×0.50 | Cada uno1 COP, total2, no total1 redondeando suma. |
| Gasto convertido0.50 | Redondear magnitud y luego signo, no floor sobre negativo. |
| Importe `9007199254740993` | Se conserva exacto; no Number. |
| Suma de minutos que supera2^53 | Totales BigInt/string, sin overflow aunque cada entrada sea entero seguro. |
| USD sin tasa | Excluido y pendingConversionCount>0, no como cero silencioso. |
| Buscar `nino` contra Niño | No coincide; `niñ` como prefijo sí. |
| Buscar `arbol` contra Árbol | Coincide; normalización idéntica en unicidad y FTS. |
| Término en título +otro en cuerpo | Coincide mismo documento con AND. |
| Entrada `OR`, comillas o asterisco | Tratada como texto/token permitido, no sintaxis FTS no validada. |
| Coincide más texto en resultado Z que en A | A aparece antes que Z: orden alfabético, no relevancia. |
| Mismo nombre/título normalizado en dos entidades | Desempate técnico tipo/ID estable, sin duplicar/saltar resultados por cursor. |
| Misma URL dos veces en una tarea | Guardadas ambas, sin error ni deduplicación automática. |

## Fallos de operación y seguridad

Actividad de nota: conservar historial al archivar/enviar a papelera y tras restauración dentro del plazo. Al borrarla definitivamente, no queda fila de esa nota ni en detalle/agrupación ni texto en payload de actividad ligada a ella. Fallo al borrar actividad o FTS hace rollback de todo el borrado. No borrar acciones independientes del mismo operation_id. Los backups históricos siguen bajo conservación manual.

Inicio timer: tarea Nueva cambia a En curso solo si timer se crea; duplicado/busy/error de actividad hace rollback de timer y estado. Bloqueada/Revisión no cambian. Probar ambos adaptadores y revisión devuelta.

Restauración: checksum incorrecto, schema futuro, tabla/trigger no canónico, ENOSPC staging, fallo fsync/rename, crash antes/después journal/publicación/verificación, checkpoint fallido y proceso manteniendo SH. Cada escenario demuestra datos anteriores recuperables o nueva copia validada, nunca apertura ambigua ni eliminación de ambas.

Backup: escrituras fuente mientras copia, fallo antes de depurar identidad, páginas libres con secretos, colisión destino y certificado/clave excluidos. Revisar copia publicada, no solo manifest que dice excluirlos. Comprobar usuarios sin permisos y carpeta backup externa no cifrada.

API: login CSRF, sesión fixation, Origin host atacante, DNS rebinding/Host no permitido, invalidación reset, cookie restaurada tras navegador, agotamiento throttle y permisos locales independientes. UI: Markdown XSS/URLs peligrosas, imágenes remotas no descargadas, logs sin contenido y ausencia tokens en storage.

HTTPS: trust manual por dispositivo, SAN incorrecto, cert expirado, renovación y arranque offline. Restauración no reinstala confianza ni hace bootstrap remoto. LAN accesible no significa Internet público soportado.

## Recorrido de aceptación final

1. Setup CLI local y acceso por HTTPS autenticado desde localhost/LAN; servidor nunca expone bootstrap.
2. Crear cliente con scope, proyecto, rama tareas y nota con links cruzados.
3. Capturar Inbox y convertir editando; provocar fallo y demostrar conservación.
4. Temporizadores simultáneos, pausa, suspensión/reinicio y límite12h.
5. Mover rama confirmada, comprobar atribución histórica, eliminar y consultar tiempo retenido sin modificarlo.
6. Finanzas con convertido/pendiente y cambio tasa confirmado.
7. Hoy/calendario/búsqueda/actividad conforme a familias/reglas, no a mocks.
8. Backup manual con WAL activo, detener servidor, restore exclusivo y verificar sesiones invalidadas/datos íntegros.
9. Repetir recorrido con Internet bloqueado pero loopback/LAN disponible. Inspeccionar tráfico externo: no CDN/cotizaciones/telemetría.
10. Build e instalación en entorno limpio de las arquitecturas macOS declaradas.

Registrar comando exacto, datos aislados, resultado y evidencia browser/macOS por unidad. No escribir comandos ficticios `npm test`/`go test` antes de existir runner. Tests de dominio sin recorrido real no demuestran HTTPS LAN ni distribución.

## Revisión y carga de trabajo

Diseño dividido por áreas, no un único documento de cientos de reglas mezcladas. Implementar según unidades T1–T20 y dividir más si una unidad mezcla demasiados riesgos. Seguridad, concurrencia, restauración y dinero requieren verificación independiente proporcional; un chequeo Markdown no sustituye esas pruebas.

No commits, PR, push o entregas externas durante este diseño. Las modificaciones previas del repositorio no pertenecen automáticamente a esta sesión; conservarlas y separar el diseño nuevo al revisar diff.

## Cierre documental

Al cerrar esta entrega comprobar existencia de los siete documentos nuevos, enlaces relativos y anchors, fences Markdown balanceados, conflictos Git, secretos ausentes de contenido y preservación de documentos previos salvo enlaces/continuidad indicados. Las decisiones abiertas permanecen centralizadas en las preguntas finales.

Este diseño no tiene revisión independiente entregada. La revisión pendiente se retoma cuando el entorno de delegación pueda ejecutarla con autorización humana válida; no se necesita habilitar Stitch para las reglas de Bitnode y no se cambia configuración por cuenta del usuario. Antes de autorizar cada unidad, revisar contrato, pendientes y spike técnico aplicable.
