# Operación local, seguridad y recuperación

[Índice del diseño](../diseno-tecnico-local.md). Estos mecanismos son propuestas técnicas con pruebas obligatorias en macOS. Ninguna instalación, emisión de certificado, migración ni restauración se ha ejecutado.

## Configuración y rutas

Configuración común de servidor/CLI, no una configuración diferente por adaptador. Proponer `~/Library/Application Support/Bitnode/` para datos y `~/Library/Application Support/Bitnode Backups/` como destino manual predeterminado fuera de datos activos. Ambas son carpetas del mismo disco salvo elección distinta; no afirmar redundancia de disco.

```text
Bitnode/
  config.json             rutas, listen, SAN conocidos y parámetros no secretos
  maintenance.lock        inode estable de coordinación, nunca borrar/reemplazar
  bitnode.db              base activa
  bitnode.db-wal/-shm      administrados por SQLite, no manipulación normal
  tls/                    CA/certificado y claves con permisos restringidos
  recovery/               journal y copia previa de restore, acceso local restringido
```

Config propuesta: dataDir, backupDir, listenHosts, port, allowedOrigins, tlsPaths y logging mínimo. No contraseñas ni API keys. Precedencia explícita defaults→archivo compartido→override CLI local; overrides de ruta cambian raíz de datos y deben mostrarse antes de setup/restore. Servidor iniciado con raíz distinta no puede parecer dueño de la base default.

Resolver ruta física canónica antes de calcular bloqueo/abrir DB. No permitir dos aliases/symlinks de archivo DB ni hardlinks con WAL compartido accidental. Validar dueño/permisos y rechazar raíz de red/nube sincronizada como configuración soportada. Uso inicial en filesystem local macOS. Carpetas 0700 y archivos sensibles 0600, umask restrictiva al crear. No chmod recursivo sobre carpetas arbitrarias del usuario.

Configuración de escucha propuesta: HTTPS en loopback y LAN seleccionada explícitamente durante setup; puerto elegido y validado libre, no fijar número como acuerdo. No bind público silencioso ni exposición Internet/Tunnel. Setup sin identidad/config completa no sirve dominio a la LAN.

## Bloqueo entre procesos

Candidato `flock(2)` nativo con LOCK_SH/LOCK_EX y LOCK_NB, sobre maintenance.lock estable, distinto de .db. Node no ofrece este contrato de forma portátil por sí solo: seleccionar binding pequeño mantenido o adaptador nativo y probarlo en T2 antes de aprobar dependencia. No simular bloqueo con PID, existencia de archivo o presencia de WAL.

| Operación | Bloqueo de mantenimiento | Conexión |
|---|---|---|
| Servidor normal | Compartido durante toda vida de conexiones/worker | WAL y FK activas. |
| CLI normal | Compartido desde antes de abrir hasta después de cerrar todas | Misma configuración y reglas. |
| Backup consistente | Compartido en base fuente; conexión privada destino | No reemplaza base activa. |
| Migración/restore/rebuild destructivo | Exclusivo desde antes de abrir/verificar hasta terminar/cerrar | Falla si servidor o CLI mantiene acceso. |

El archivo de lock nunca se borra ni rota, aunque parezca huérfano: unlink permitiría dos inodes bloqueados independientemente. El descriptor no se hereda a hijos; cierre último libera flock. No usar descriptor DB como archivo de coordinación. Crash debe liberar bloqueo mediante OS, sin reclaim manual de PID.

Servidor debe apagarse para restore; no hay modo de mantenimiento web. Migrar con servidor activo devuelve BUSY/instrucción detener, sin anunciar upgrade SH→EX que pueda deadlock. Al arranque normal, adquirir SH y leer versión. Si necesita migración, cerrar/liberar y pedir comando explícito exclusivo; no operar schema incompatible.

SQLite configurado en cada conexión: foreign_keys ON, journal_mode WAL, synchronous FULL propuesto para durabilidad, busy_timeout acotado. Validar valores efectivos, no confiar en defaults. SQLITE_BUSY por adquisición se maneja sin replay; proponer 2s de espera total y como máximo 3 intentos de adquisición con jitter dentro del presupuesto, no retries adicionales del cliente. SQLITE_LOCKED puede indicar bug/conexión mal usada, no tratarlo como BUSY universal.

Un BEGIN IMMEDIATE exitoso elimina carreras de escritura entre web/CLI, pero no evita mantener una transacción demasiado larga. Objetivo técnico <100ms para comando corriente, medir bajo carga local y datos de prueba. Operaciones largas de mantenimiento van por fases fuera de transacción activa, con bloqueos de archivos y pasos durables separados.

Lecturas cortas; checkpoints no se fuerzan por cada HTTP request. Checkpoint de respaldo periódico fuera de transacciones largas; monitorizar WAL/tamaño sin borrar sidecars. No asumir que `-wal` ausente demuestra ausencia de conexiones.

## Arranque y apagado

1. Leer config no sensible, canonicalizar raíz y validar permisos.
2. Adquirir lock apropiado. Si hay journal de recuperación inconclusa, no abrir base normal.
3. Verificar schema compatible y checksums de migración; driver/FTS disponibles.
4. Construir conexiones y servicios; reconciliar timers vencidos/purgas con políticas ya aprobadas.
5. Servidor valida TLS/origins, abre socket y marca ready. CLI ejecuta su comando autónomo.
6. Al parar, dejar de aceptar peticiones, terminar escrituras en curso, cancelar worker, cerrar conexiones y después liberar SH. No detener timers abiertos por parar servidor.

Purgas y reconciliación tienen lotes/budgets; errores no se ocultan como éxito. P2/P3 ya están resueltas: respetar plazos completos y borrar actividad ligada a notas eliminadas definitivamente. No extender P2 a otras familias por defecto. Servidor/CLI usan America/Bogota, sin configuración de cambio de zona.

Servicio macOS de usuario opcional mediante launchd, no daemon root. Instalación/arranque automático requiere decisión local expresa; servidor manual por defecto. Ejecutable y config usan rutas absolutas en servicio para no depender del cwd. Un supervisor no ejecuta migrations silenciosamente al reiniciar.

## Identidad, sesiones y CSRF

Bootstrap exclusivamente CLI local, prompt de contraseña oculto y confirmación; no bootstrap público si falta identidad. Reset CLI con permisos de datos no necesita anterior, incrementa credential_version y elimina/invalida sesiones en transacción. La contraseña web no cifra DB ni limita procesos con acceso al archivo.

Argon2id, sal aleatoria por hash y parámetros almacenados en formato de la biblioteca. Referencia mínima OWASP 19MiB/t2/p1, calibrar coste en arquitecturas soportadas y limitar hashes concurrentes para no bloquear event loop ni memoria. Propuesta de UX 250–750ms a medir, no benchmark observado. Nunca almacenar contraseña reversible, incluirla en logs o enviarla a servicios externos.

Token sesión aleatorio de 256 bits; guardar SHA-256 del token, no token original. Cookie `__Host-bitnode`, Secure, HttpOnly, SameSite=Strict, Path=/, sin Domain, Expires ni Max-Age. Sin expiración por antigüedad en servidor según acuerdo. Logout invalida hash y limpia cookie; reset invalida todas por versión. Cerrar navegador no garantiza invalidez ni impide restaurar cookies: explicar limitación, no prometer detección de cierre.

Propuesta de flujo:

| Ruta | Comportamiento |
|---|---|
| `GET /auth/pre-session` | Pre-sesión corta en memoria servidor, nonce CSRF y cookie Secure/HttpOnly, no sesión autenticada. no-store. |
| `POST /auth/login` | Origin/Host permitidos, JSON, token de pre-sesión y contraseña; throttle; destruir pre-sesión, generar nueva sesión. |
| `GET /auth/session` | Verificar sesión, devolver estado/token CSRF y datos mínimos. No cookie/token de sesión en body. |
| `POST /auth/logout` | CSRF+Origin, invalidar sesión y cookie. |

Las rutas siguen prefijo `/api/v1`. Pre-sesión técnica puede tener TTL corto propuesto de 10min sin cambiar duración de sesión de producto. Nonce/secret CSRF por sesión, cabecera `X-Bitnode-CSRF` obligatoria en toda mutación incluida logout. Login usa token previo y rota al autenticar para evitar fixation/login CSRF.

Comparación segura de hashes/secrets. Controlar Host/Origin contra config explícita y SAN; CORS deshabilitado. Rechazar Origin faltante en mutaciones HTTP excepto scripts que envíen Origin permitido y CSRF válido exactamente como navegador. No crear bypass REST por User-Agent, localhost o falta de Origin. Scripts usan pre-session→login→cookie jar→CSRF; no tokens personales.

Throttle persistente propuesto por bucket global más IP normalizada, con límites iniciales 10 intentos/15min y espera acotada. Revisar riesgo de bloqueo del propietario por LAN y recuperación CLI antes de fijar. Respuestas login genéricas, sin revelar si falta contraseña/identidad ni parámetros. Limitar tamaño contraseña antes de hash y limitar pre-sesiones para evitar DoS.

Headers de seguridad: no-store para API personal/auth, nosniff, frame-ancestors none y CSP self compatible con Angular empaquetado, sin scripts inline no autorizados ni unsafe-eval. No HSTS includeSubDomains automático para hosts locales ajenos; evaluar política local sin impedir recuperación de TLS.

## HTTPS local y LAN

HTTPS también en loopback como propuesta para mantener Secure/CSRF coherentes. CA local y certificado de servidor con SAN de nombres/IP seleccionados por usuario. Claves separadas en tls con 0600. No instalar confianza, abrir firewall o modificar Keychain por inferencia; comandos guiados explican alcance y piden autorización concreta.

En cada dispositivo LAN confiar explícitamente en CA/certificado. IP/hostname nuevos requieren renovar SAN y revisar allowedOrigins. No aceptar hosts arbitrarios por wildcard ni degradar a HTTP cuando falla certificado. UI no resuelve un error de confianza con excepción programática.

Validar expiración al arranque y status CLI; renovación local sin Internet. Separar CA key de server key y minimizar su uso. Backups de dominio no incluyen estas claves; restaurar en equipo nuevo exige setup TLS propio. Un certificado emitido o Keychain confiado durante diseño sería implementación no autorizada, no se ejecuta aquí.

## Migraciones

Migraciones versionadas, inmutables tras aplicar, con checksum. Comando db migrate exclusivo, servidor detenido. Verificar versión fuente, backup previo manual de seguridad y espacio disponible; un schema más nuevo que ejecutable se rechaza, sin downgrade automático.

Cada migración declara si es transaccional. DDL/datos/índices compatibles pueden usar una transacción; VACUUM/journal mode y cambios fuera de transacción requieren plan separado y journal de fase. No ejecutar scripts de migración incluidos en un backup recibido; el ejecutable lleva los suyos.

Preflight de colisiones al cambiar normalización; abortar con IDs/razón segura, no fusionar clientes/etiquetas por cuenta propia. Después foreign_key_check, integrity_check y FTS consistentes. Backup previo permite rollback de datos/schema como conjunto; no editar schema_migrations para fingir reversión.

## Creación de backup manual

Permitido desde app autenticada o CLI autónoma. Propuesta de directorio por backup con `manifest.json` y `data.sqlite`, publicado por rename de directorio temporal en el mismo filesystem destino. No comprimir/extraer archivos no solicitados ni introducir exportación JSON de dominio.

1. Seleccionar destino configurado o alternativo CLI explícito. Validar permisos/espacio, colisiones y que no pisa datos activos. Reemplazar copia existente requiere aceptación concreta.
2. Mantener SH fuente y usar API backup consistente SQLite en conexión destino privada. No copiar solo .db con WAL activo, ni mantener write lock fuente durante toda copia.
3. En copia temporal, quitar sessions/auth_throttle/local_identity y metadatos CSRF. Por P11, restore conserva contraseña actual. Excluir credenciales del backup es el mecanismo técnico propuesto para no reponer una contraseña antigua. Nunca tocar identidad/sesiones de base fuente.
4. Compactar copia con VACUUM y modo journal adecuado fuera de transacción para no dejar credenciales en páginas libres/WAL de artefacto. Temporal protegido y no publicable si falla depuración.
5. Validar integrity_check/foreign_key_check y schema esperado; verificar ausencia de sesiones/identidad operativas. Generar manifest con formatVersion, schemaVersion, appVersion, createdAt, checksum SHA-256 y tamaño de data.sqlite.
6. Cerrar conexión, sincronizar archivos y directorio donde soporte macOS; publicar sin sobrescritura accidental y sincronizar directorio padre. Probar crash/ENOSPC.

Checksum detecta corrupción accidental; no autentica un backup manipulable junto con su manifest. Cargar únicamente copias cuya procedencia el usuario acepta. No confiar en extensión .sqlite como formato válido ni ejecutar triggers ajenos como parte del análisis.

P11 confirmado: restore conserva la contraseña actual e invalida sesiones; en equipo sin identidad local requiere setup antes de servir. La exclusión de identidad del backup es el mecanismo técnico propuesto para cumplirlo y se verifica en T19. Manifest debe explicar que copia no contiene TLS, config máquina ni contraseña. Backup sigue sin cifrado propio y contiene texto/datos personales.

Backup consistente captura timers abiertos. Por P12, al restaurar se cierran y se guarda su tiempo, sin dejarlos activos ni reiniciarlos. Corte técnico propuesto: min(restoreNow,start+12h), usando Colombia y omitiendo tramos cero; verificar en T19 y mostrar efecto en confirmación de restore. No confundir con continuidad tras reinicio normal, donde los timers sí siguen hasta su límite.

## Restauración exclusiva y recuperación de fallo

Solo CLI local, servidor detenido, ninguna conexión de otro proceso. La API no tiene endpoint de restore. Confirmación explica sustitución de todos los datos, invalidación de sesiones, temporizadores de copia y contenido histórico que reaparecerá desde backup.

1. Validar manifest/tamaño/checksum en área staging restringida. Abrir copia con SQLite extensión deshabilitada, validar esquema canónico/versión/checksums, integridad y FKs. Rechazar schema nuevo; para antiguo preparar copia migrada con migraciones del ejecutable, nunca modificar original de backup.
2. Adquirir EX de maintenance.lock antes de abrir base activa, repetir controles y confirmar identidad de copia/destino. Si algún proceso tiene SH, fallar sin sustituir nada.
3. Si existe DB activa, abrir bajo EX, leer identidad actual en memoria, checkpoint TRUNCATE exitoso y crear copia previa consistente en recovery. Cerrar TODAS las conexiones antes de renombrar/reemplazar. No borrar WAL vivo ni ignorar fallo de checkpoint.
4. Preparar candidata en mismo filesystem de datos, insertar identidad actual con credential_version incrementada o dejar bootstrap requerido si no existía, borrar sesiones, cambiar datasetGeneration y cerrar/materializar timers de copia sin reinicio, conforme P12. Validar, cerrar y sincronizar candidata.
5. Crear journal durable con nombres internos acotados, checksums old/new y fase prepared. Registrar copia previa durable, sin secretos en journal.
6. Reemplazar archivo activo por rename atómico de candidata sobre bitnode.db, solo después de conexión cerrada y WAL limpio. El binding de publicación debe probarse en macOS. Conservar copia previa separada; no renombrar archivo activo mientras una conexión permanece abierta.
7. Registrar fase replaced, comprobar apertura/integridad de nueva DB bajo EX, cerrar, registrar complete y sincronizar directorio. Liberar EX solo tras completar. No anunciar éxito antes de verificación.

Crash entre rename y journal no se resuelve confiando en texto de fase: recuperación CLI exclusiva compara checksums/identidades old/new y archivos staging. Si candidata está activa y válida, puede finalizar; si no está válida, restaurar copia previa validada bajo EX y cerrar WAL propio antes de reemplazar. Si evidencia no determina estado, bloquear apertura normal y pedir selección local explícita, sin destruir las dos copias.

Journal se interpreta antes de abrir dominio en cada arranque. No recuperación automática destructiva sin conocer qué conjunto está activo. Mantener al menos última copia previa hasta que usuario confirme limpieza local; es mecanismo de restore, no programación automática de backups. No eliminar archivos ajenos ni sobreescribir destino arbitrario del manifest.

Un checkpoint exitoso y conexiones cerradas permiten tratar archivo principal como conjunto independiente; probar sidecars tras crash antes/después de publicación. Si el binding filesystem no ofrece garantías de fsync/rename requeridas, T19 queda bloqueado y se revisa estrategia de directorios generacionales, no se finge atomicidad.

Restore puede recuperar entidades ya purgadas desde un backup histórico, por naturaleza de la copia completa. Mostrarlo y ejecutar retenciones antes de exponer datos; si una nota vence y se borra definitivamente, quitar también su actividad según P2. El usuario gestiona conservación/borrado de backups manuales; purga de dominio no elimina textos de copias antiguas.

## Distribución y soporte

Distribución inicial propuesta como paquete local con Node compatible y comando bitnode, frontend compilado y dependencias nativas verificadas. No prometer binario autónomo antes del spike de empaquetado. Soporte macOS arm64/x64 por validar; minimum macOS/Node y firma/notarización se deciden T20 según estrategia elegida, no se inventan aquí.

Build reproduce assets desde lockfile; frontend no usa Internet runtime. Driver better-sqlite3/Argon2/locking pueden requerir binarios nativos por arquitectura; smoke test limpio sin toolchain previo si esa es promesa de instalación. Si se necesita toolchain, documentarlo antes de anunciar instalación de un paso.

Actualización con servidor detenido, migración explícita y copia previa. CLI identifica incompatibilidad schema; no actualizar dependencias al arrancar. Servicio opcional utiliza mismo ejecutable/config; logs no capturan stdout JSON CLI ni secretos.

Logs técnicos estructurados y acotados: requestId, operación, código, duración, busy y versión de schema. Sin cuerpos Markdown, contenido financiero, contraseñas/cookies, SQL parametrizado completo, IP persistida en logs o rutas privadas. No telemetría remota ni Prometheus obligatorio para app personal. Diagnóstico CLI seguro de versión/bloqueo/driver, no dump de datos.

## Referencias técnicas

Fuentes consultadas durante diseño, no pruebas del sistema:

- [SQLite foreign keys](https://www.sqlite.org/foreignkeys.html), secciones 4.2 y 4.3, diferimiento y RESTRICT inmediato.
- [SQLite corrupción](https://www.sqlite.org/howtocorrupt.html), secciones 2.5/2.6, no reemplazar archivos abiertos ni usar aliases inconsistentes.
- [SQLite backup API](https://www.sqlite.org/backup.html) y [WAL](https://www.sqlite.org/wal.html), respaldo consistente y sidecars.
- [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), Argon2id y calibración.
- [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) y [sesiones](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), protección de login y cookie.
- [flock macOS histórico](https://www.manpagez.com/man/2/flock/osx-10.4.php), orientación SH/EX y descriptores. No certifica binding ni versión macOS actual; prueba real obligatoria.
