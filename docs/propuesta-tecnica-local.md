# Propuesta técnica local

Propuesta para construir Bitnode con Angular, NestJS, SQLite y Drizzle en macOS. No es un esquema aprobado ni una implementación. El alcance confirmado está en [revisión final](revision-alcance-local.md) y [historial detallado](archivo/alcance-local.md). El [diseño técnico detallado](diseno-tecnico-local.md) concreta datos, dominio, contratos, frontend, operación y verificación, con preguntas finales centralizadas. El [plan](plan-implementacion-local.md) divide el trabajo; el [brief de Stitch](diseno-ui-stitch.md) guía el diseño visual.

## Decisiones confirmadas y propuestas

Confirmado: app personal, un usuario, funcionamiento sin Internet, acceso LAN autenticado, CLI autónoma con datos y servicios compartidos, sin sincronización ni MCP de producto.

Confirmado: UI de escritorio oscura y compacta con acento verde y navegación lateral como base de trabajo; diseño con Stitch fuera de esta sesión. No se conectará ni instalará Stitch aquí. Stitch se usa para preparar diseños, no como dependencia de la app.

Confirmado posteriormente: edición antes de crear desde Inbox y guardado atómico que conserva captura ante fallo; recorte de espacios exteriores, obligatorios no vacíos, validación sintáctica email/URL sin consultas externas y teléfono como texto.

Aprobada tras revisión: organización mínima con tres apps y dos paquetes compartidos, core y db. Los detalles técnicos restantes son propuestas; no hay aprobación global del esquema ni autorización de implementación.

## Organización aprobada y arquitectura propuesta

```text
Angular ── HTTPS/REST ── NestJS ──┐
                                 ├── Casos de uso ── Drizzle ── SQLite
CLI autónoma ────────────────────┘
```

La CLI no importa controladores NestJS ni llama al servidor. Ambos adaptadores construyen los mismos servicios mediante una fábrica compartida. Angular nunca accede directamente a SQLite. NestJS sirve los archivos estáticos del frontend y rutas `/api/v1`; las rutas API no caen en el fallback SPA.

| Directorio aprobado | Responsabilidad |
|---|---|
| `apps/web` | Angular, formularios, navegación y presentación. |
| `apps/server` | NestJS, sesión HTTP, validación de transporte y servidor HTTPS. |
| `apps/cli` | Comandos, JSON de salida, errores y confirmaciones interactivas. |
| `packages/core` | Casos de uso, reglas, puertos de reloj/repositorios y errores sin dependencia HTTP. |
| `packages/db` | Drizzle, migraciones, repositorios, transacciones y mantenimiento. |

`core` no importa Angular, NestJS ni Drizzle. Contiene tipos, reglas y puertos; `db` implementa esos puertos. Servidor y CLI componen ambos para ejecutar los mismos casos de uso. Web accede a REST, no a los repositorios.

DTO y validación de transporte comienzan en sus adaptadores; las reglas de dominio se comparten desde core. Fixtures y utilidades se mantienen con las pruebas correspondientes. Extraer `contracts` o `testing` solo cuando exista reutilización concreta, sin duplicar reglas para evitar la extracción. No se requiere publicación ni versionado independiente de estos directorios.

La revisión fue documental, con un subagente alternativo tras fallo de Opus; no demuestra viabilidad de bloqueos multiproceso ni distribución macOS.

Proponer workspace npm con TypeScript. Fijar versiones estables compatibles al iniciar implementación, no asumir números de versión en estos documentos. Usar SQLite con `better-sqlite3`, verificando su instalación en las arquitecturas macOS soportadas y disponibilidad de FTS5 antes de fijar dependencia.

## Persistencia propuesta

IDs UUID generados por la aplicación. Instantes como enteros de milisegundos UTC; días como texto ISO `YYYY-MM-DD`; revisión entera por registro mutable. No almacenar scope repetido en proyectos/tareas ni atribución histórica de tiempo de tarea.

| Tablas | Campos de dominio y restricciones principales |
|---|---|
| `clients` | Nombre completo, corto opcional, claves normalizadas únicas independientes, scope obligatorio sin default, observaciones, archivo. |
| `contacts`, `contact_clients` | Nombre no único, email/teléfono/observaciones opcionales, archivo; relación muchos a muchos con clientes. |
| `projects` | Cliente fijo, nombre único normalizado por cliente, descripción Markdown, estado, inicio/fin planificados solo día. |
| `tasks` | Proyecto obligatorio, padre opcional, título, Markdown, prioridad, estado, motivo de bloqueo, origen, planificación, límite, última finalización, selección manual Hoy, eliminación. |
| `task_references` | Tarea, URL, nombre opcional y orden. |
| `inbox` | Título y cuerpo; captura global sin scope/proyecto. |
| `notes` | Título persistido, Markdown, hasta un cliente/proyecto/tarea/contacto explícitos e independientes, archivo y papelera. |
| `tags` y cinco tablas de asignación | Nombre normalizado único y color opcional inmutable; asignación a clientes/proyectos/tareas/notas/contactos, no a eventos. |
| `time_entries` | Tarea o proyecto directo, día guardado, minutos enteros positivos, procedencia manual/cronometrada y metadatos de intervalo cuando apliquen. |
| `timers` | Tarea o proyecto directo, inicio UTC y límite efectivo; una fila activa por destino. |
| `financial_movements` | Income/expense, importe entero positivo, COP/USD, tasa opcional, día, concepto; cliente o proyecto opcional, nunca ambos. |
| `events` | Título, Markdown, modo día completo/con hora, rango y un contexto opcional cliente/proyecto/tarea, papelera. |
| `activity` | Tipo de acción, resumen, campos antes/después, instante y grupo de operación; solo acciones incluidas en el alcance. |
| `local_identity`, `sessions` | Hash de contraseña, versión de credencial; hash de token de sesión y versión asociada. |
| `schema_migrations` | Control de versión y ejecución exclusiva de migraciones. |

Los enums técnicos sugeridos son `active/paused/completed/archived`, `new/in_progress/blocked/in_review/done/cancelled` y `none/low/medium/high`. Son propuestas; las etiquetas de UI serán en español. La creación de tarea fuerza nueva y sin prioridad.

### Integridad

- Activar claves foráneas en todas las conexiones. Sin borrados de clientes/proyectos en cascada. Cada servicio verifica todas las asociaciones antes de borrar.
- `CHECK` para destinos excluyentes de tiempo/finanzas/eventos, importes y estados. Índices únicos parciales para temporizadores por tarea y por proyecto directo.
- Padre del mismo proyecto mediante relación compuesta; ciclos y operaciones de rama mediante CTE recursiva y validación transaccional. Traslados actualizan la rama bajo restricciones diferibles o estrategia equivalente probada, nunca desactivando claves foráneas.
- Notas con FKs independientes, sin validar igualdad entre contextos. Purga de tarea desvincula nota/evento, sin borrar esas entidades.
- Tiempo ligado a tarea deriva proyecto/cliente al consultar. Se excluye de totales desde eliminación y queda solo lectura hasta purga.
- Un registro mutable tiene `revision`; actualizaciones comprueban la revisión esperada y la incrementan. Las operaciones compuestas comprueban todos los registros afectados.

## Casos de uso y transacciones

Los servicios concentran reglas; REST y CLI no duplican lógica de negocio. Una operación escribe dominio, tiempo asociado, índices de búsqueda y actividad aplicable en la misma transacción.

| Operación | Comportamiento requerido |
|---|---|
| Crear/reactivar proyecto | Cliente no archivado. Si lo está, reactivación previa explícita. |
| Cerrar proyecto | Sin tareas abiertas; cerrar temporizador directo y guardar tiempo. |
| Completar/cancelar tarea | Completar exige resolver hijas abiertas; cancelar permite cancelar descendientes abiertos con consentimiento. Guarda tiempo y detiene temporizadores afectados. |
| Reabrir/iniciar temporizador | Confirmar ancestros cerrados y reactivación del proyecto; cliente archivado exige reactivarlo primero. Reapertura vuelve a en curso. |
| Mover rama | Destino activo/pausado, confirmar efectos, separar hija si aplica, cerrar temporizadores, mover rama sin reinicio. Tiempo anterior sigue destino actual. |
| Eliminar rama | Confirmar irreversibilidad de tareas, detener/guardar tiempo, marcar eliminación y excluir tiempo de totales. Sin endpoint de restauración. |
| Procesar Inbox | Editar antes de crear y editar combinación al añadir a existente; guardar destino y eliminar captura atómicamente, fallo conserva captura. Confirmado. |
| Editar tasa | Confirmar recálculo de períodos anteriores; cambiar moneda limpia la tasa. |
| Nota/evento a papelera | Confirmación y retención; restaurar nota la deja activa. |

### REST y CLI propuestos

REST bajo `/api/v1`: colecciones de clientes, contactos, proyectos, tareas, notas, etiquetas, Inbox, tiempo, movimientos y eventos. Lecturas específicas `/today`, `/calendar`, `/search` y `/activity`. Autenticación en `/auth/login`, `/auth/logout`; bootstrap/reset de contraseña solo por CLI local.

Las acciones compuestas usan rutas explícitas, por ejemplo `POST /tasks/:id/move`, `/reopen`, `/cancel`, `/timers/start` y `/inbox/:id/process`. No permitir PATCH genérico que eluda transiciones, cambie cliente de proyecto o edite color de etiqueta.

Propuesta de protocolo de confirmación: petición inicial devuelve `CONFIRMATION_REQUIRED` con efectos y revisión de los registros implicados. Reenvío explícito incluye esos efectos aceptados y revisiones. El servicio vuelve a validar dentro de la transacción; si cambió el estado, devuelve conflicto y exige revisar de nuevo. La confirmación no es permiso de autenticación.

CLI equivalente: `bitnode task move`, `task reopen`, `timer start`, `inbox process`, `backup create/restore`, entre otros. Modo interactivo muestra efectos; modo no interactivo exige flags explícitos por efecto, no un `--yes` que acepte consecuencias desconocidas. Salida `--json`, códigos estables y conflictos equivalentes a REST. Contratos concretos se especifican por unidad antes de implementar.

Errores propuestos: `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `CONFIRMATION_REQUIRED` 409, `BUSY` 503. Mensaje legible, código, campos y efectos cuando corresponda. No exponer SQL, rutas internas ni credenciales. Listados paginados con orden estable; filtros confirmados solamente.

## Concurrencia y operación local

SQLite en WAL con espera acotada para bloqueos. Escrituras breves con `BEGIN IMMEDIATE`; sin llamadas de red ni interacción humana dentro de transacciones. Reintentar adquisición de bloqueo de forma acotada, no reproducir una operación de resultado incierto. Colisiones devuelven conflicto o busy sin sobrescribir cambios.

Un candado de mantenimiento entre procesos coordina servidor y CLI: acceso normal compartido, migración/restauración exclusivo. Elegir mecanismo de bloqueo de sistema operativo verificable en macOS; no basta un archivo PID ni comprobar si existe `-wal`. Mantener adquisición antes de abrir SQLite y liberación al cerrar. Pruebas de dos procesos forman parte de aceptación.

Ruta propuesta configurable: `~/Library/Application Support/Bitnode/`, permisos restringidos para datos/certificados/backups. Ya existe un repositorio Git documental. El índice `.codegraph/`, creado por el subagente fuera de lo autorizado, se conserva por decisión explícita del usuario. No se han instalado dependencias ni autorizado implementación.

## Dinero, fechas y tiempo exactos

- Proponer importes y tasas como texto decimal canónico en SQLite y contratos; validar forma y usar `BigInt` en servicios, nunca flotantes ni `number` JSON para aritmética monetaria.
- Tasa en centésimas de COP por USD. Equivalente positivo `floor((importe × tasaCentésimas + 50) / 100)`; income/expense determina el signo. Totales exactos calculados por servicio, sin `SUM` flotante sobre texto ni cachés históricos.
- Días no se convierten a medianoche UTC. Tarea con solo día conserva día; con hora conserva instante. Eventos día completo conservan último día inclusivo; eventos con hora permiten inicio=fin.
- Confirmado P1: usar siempre America/Bogota, sin gestionar cambios de zona por ahora. Reloj inyectable, fechas reales y medianoches Colombia; no selector de zona ni flujos DST de otras zonas.
- Temporizador persistido cuenta hasta `min(ahora, inicio+12h)`. Worker del servidor materializa límites; toda entrada de CLI/arranque reconcilia intervalos vencidos idempotentemente. Con app apagada se materializa al volver.
- Dividir por medianoches civiles Colombia y redondear hacia arriba cada tramo positivo. Confirmado P6: tramo cero no genera entrada ni minuto artificial. Los días ya guardados permanecen.
- Confirmado P10: iniciar timer de tarea Nueva la pasa a En curso en la misma operación; si falla el inicio no cambia estado. Bloqueada/Revisión conservan estado.
- Edición manual de entradas no recalcula silenciosamente minutos. Propuesta: guardar metadatos de procedencia para distinguir minutos corregidos del intervalo original.

## Búsqueda y Markdown

Una función versionada normaliza mayúsculas y acentos vocálicos preservando ñ. No quitar indiscriminadamente marcas Unicode. Usarla tanto en claves únicas como en índices; cubrir `Niño/nino`, `á/a` y ñ compuesta/descompuesta con tests.

Proponer FTS5 sobre columnas de texto normalizadas con `unicode61 remove_diacritics 0`, conservando texto original aparte. Cada término exige coincidencia completa o de prefijo; todos los términos pueden aparecer en campos distintos del mismo registro. Escapar entrada y construir expresión FTS, nunca concatenar sintaxis de usuario sin control.

Índice para notas/tareas/proyectos/clientes/contactos/eventos, no Inbox/tiempo/finanzas. Transacciones actualizan índices; filtros de archivo/estado/contexto se aplican antes de paginar. AND/OR de etiquetas es un filtro independiente, AND por defecto. Confirmado P8: orden alfabético por nombre/título, no relevancia. La clave normalizada y desempate técnico estable se detallan en diseño.

Renderizar Markdown sin HTML peligroso; sanear salida y URLs, rechazar protocolos ejecutables. Recursos UI empaquetados localmente, sin fuentes/CDN externas ni carga automática de contenido remoto para funcionar offline.

## Contraseña, LAN y certificados

Proponer Argon2id con parámetros medidos en macOS, token de sesión aleatorio criptográfico guardado solo como hash en servidor y cookie `HttpOnly`, `Secure`, `SameSite=Strict`, sin expiración por antigüedad. Reset de contraseña invalida sesiones mediante versión de credencial. Cerrar navegador no garantiza invalidación.

Login con limitación persistente de intentos y mensajes que no revelen detalles. Verificar Origin y protección CSRF en mutaciones; CORS deshabilitado salvo necesidad explícita. Scripts REST usan login y cookie de sesión, no tokens personales.

HTTPS para localhost/LAN. Asistente local propone CA/certificado con SAN de hosts/IP seleccionados, explica confianza por dispositivo y renovación; no instalar confianza en el sistema sin confirmación. Privada con permisos restringidos, nunca en backup de dominio por defecto. Sin degradación silenciosa a HTTP en LAN.

CLI opera bajo permisos del usuario macOS, sin sesión HTTP porque no llama al servidor. Es una frontera diferente: la contraseña web no cifra SQLite ni protege de procesos con acceso local al archivo. Esto debe explicarse en setup.

## Backups, retención y actividad

Backup manual mediante API de backup consistente de SQLite, no copiando solo `.db` mientras WAL está activo. Proponer manifiesto con versión/checksum, verificar apertura/integridad y escribir temporal antes de publicar. Incluir datos necesarios para restauración, pero no sesiones utilizables: restaurar invalida sesiones. Reemplazo de backup exige confirmación.

Restauración con servidor detenido y candado exclusivo sin otros procesos en datos. Verificar versión soportada, checksum e integridad antes de reemplazo atómico; conservar copia previa recuperable ante fallo. No aceptar una base más nueva que el ejecutable ni ejecutar migración destructiva automática.

Purgas idempotentes y acotadas en servidor y arranque/CLI, bajo transacción. Tareas eliminadas no tienen recuperación aunque se retengan; notas/eventos sí. Actividad retiene un año, sin event sourcing. Confirmado P2: borrar definitivamente una nota elimina también su actividad, no solo oculta texto. Confirmado P3: plazos completos desde la eliminación/acción. No generalizar política de notas a otras familias.

Confirmado P11/P12: restore conserva contraseña actual, invalida sesiones y cierra/guarda los timers de la copia sin reiniciarlos. Confirmado P9: Inbox página propia, acceso global únicamente para agregar capturas.

## Acuerdos posteriores y validaciones pendientes

| Área | Estado |
|---|---|
| Duplicados de URLs | Confirmado P4: permitidos. Mantener validación sintáctica; sin unicidad ni deduplicación automática. |
| Retenciones | Confirmado P3: 30 días completos y un año desde cada acción de Actividad. Convención técnica de aniversario/29 de febrero en dominio. |
| Restaurar vínculos | Confirmado P5: conservar solo existentes, no reconstruir vínculos purgados. |
| Zona | Confirmado P1: Colombia fija, sin cambios de zona. |
| Tramo cero | Confirmado P6: sin entrada ni minuto artificial. |
| Actividad de nota borrada | Confirmado P2: eliminar también sus filas de Actividad. No conservar placeholder redactado ni extender a otras entidades. |
| Presentación | P7 sin resolver: desempate final de Hoy, horas del día y conteo por tarea/día. P8 resuelto: búsqueda alfabética. |
| Inbox/timer/restore | P9 página propia/global solo agregar; P10 Nueva→En curso al iniciar timer; P11 contraseña actual; P12 cerrar timers de copia. |
| Viabilidad | Probar driver/FTS5, bloqueos macOS, fechas Colombia, empaquetado y HTTPS local en unidades dedicadas. |

No hay pruebas funcionales en esta etapa. Los tests se escriben y ejecutan por unidad en el plan; ningún mockup de Stitch demuestra invariantes del backend.
