# Organización de Notas y acceso seguro

Implementación autorizada en tres entregas verificables, sin publicación ni push. Conservar datos locales y la interfaz mínima de Notas. No incluir carpetas, archivo, papelera, vínculos ni otros módulos.

## Entregas

| Unidad | Alcance | Estado |
|---|---|---|
| 1 | Búsqueda en título/contenido y orden de lista | Commit `909993e`; RDD aprobado y reconocido, 22 tests y 14 E2E aprobados. |
| 2 | Etiquetas inmutables, asignaciones y filtros Todas/Cualquiera | Commit `10dfe33`; RDD reconocido, 25 tests y 15 E2E aprobados. |
| 3 | T4: contraseña, sesiones, reset CLI, CSRF y HTTPS guiado | Credenciales `9fc6b76`, HTTP `92ffb42`, CA `afeac1f` y arranque `b0dde33`, con RDD reconocido. Login web y regresiones HTTPS aprobados; pendiente su revisión nativa. CA de dispositivos y LAN física no configuradas. |

## Búsqueda y orden

Escribir la consulta y pulsar Aplicar. Vaciarla y aplicar vuelve a la lista completa. Los filtros aplicados se conservan al paginar y guardar. Aplicarlos con cambios sin guardar pide confirmación; cancelar conserva el borrador y los resultados actuales.

`GET /api/v1/notes` admite `q` y `sort=updated|title|created`, además de la paginación existente. La consulta admite hasta 500 puntos Unicode. Valores repetidos, no textuales u órdenes desconocidos devuelven 400. Con consulta se fuerza orden por título; sin consulta se conserva última modificación por defecto y se permiten título o creación descendente. El ID desempata de forma estable.

La búsqueda exige todos los términos, con palabras completas o prefijos, en título y contenido combinados. No interpreta operadores. Normaliza mayúsculas y acentos vocálicos, conserva ñ y no modifica el Markdown guardado.

Esta primera entrega usa funciones deterministas de SQLite y filtra antes de contar y paginar. No cambia schema1, no agrega dependencias ni implementa el índice FTS5 global de T17. Recorre las notas; no se ha validado rendimiento para colecciones grandes.

## Evidencia de unidad 1

- RED: `npx tsx --test packages/core/test/note-query.test.ts`, exit 1 porque faltaba el módulo nuevo.
- GREEN: `npm test`, 22 pruebas aprobadas. Cubren normalización, prefijos, términos entre campos, ñ, paginación filtrada, edición y parámetros API inválidos.
- `npm run typecheck`, exit 0 tras corregir accesos posiblemente vacíos en pruebas nuevas.
- `npm run test:e2e`, exit 0, 14 recorridos Chromium, incluido build Angular y búsqueda móvil/escritorio con protección del borrador.
- Captura móvil revisada: `test-results/notas-busqueda-mobile.png`. Sin desbordamiento horizontal a 390px.
- LSP activo no confirmó limpieza de todos los archivos; Nest se comprobó con configuración inferida. TypeScript del proyecto y build Angular son la evidencia de tipos y plantillas.

La reversión de unidad 1 retira `note-query.ts`, sus pruebas y el recorrido `search.spec.ts`, y revierte la integración de consulta/controles en repositorio, API y UI. No requiere reversión de datos ni de esquema.

## Reglas de unidad 2

Etiquetas planas con nombre único normalizado, color opcional inmutable desde creación, incluso su ausencia. No renombrar, fusionar ni borrar. Quitar una asignación no borra la etiqueta. Modificar asignaciones usa la revisión de la nota. Filtro Todas por defecto y Cualquiera alternativo.

`GET/POST /api/v1/tags` lista/crea etiquetas; no hay PATCH/DELETE. `tagIds` en POST/PATCH de Notas guarda asignaciones y contenido en una transacción, en lugar del PUT independiente propuesto para el producto completo. Nombre de 1–100 puntos Unicode, color `#RRGGBB` opcional y hasta 100 IDs por nota. Duplicado de nombre normalizado devuelve 409. Lista acepta `tagIds` separados por coma y `tagMode=all|any`. UI agrupa los controles en desplegables.

Schema2 agrega `tags` y `note_tags` sin cambiar las notas existentes. Migración y asignaciones se verifican con SQLite temporal; no se ejecutaron sobre los datos del usuario. La versión anterior del ejecutable rechaza schema2: no intentar downgrade de la base; conservar copia previa antes de arrancar la nueva versión con datos reales.

RED: dos pruebas fallaron por `createTag` inexistente. GREEN focalizado: tres pruebas de migración, unicidad, rollback y filtros. La primera suite completa agotó 30s sin causa confirmada; el usuario autorizó otra ejecución y aprobó 25 pruebas y typecheck. E2E detectó TS5097 y luego un selector de etiqueta ambiguo; se corrigieron. Verificación final: `npm test && npm run typecheck && npm run test:e2e && git diff --check`, exit 0, 25 pruebas y 15 E2E/build aprobados. Captura móvil de etiquetas revisada. RDD `review-aba2104d311526f3` aprobado y reconocido; commit `10dfe33`.

## T4

El usuario confirmó una sola contraseña para Mac y dispositivos de la misma red, sin cuentas, roles, OAuth ni servicios externos. Eligió CA local guiada. Autenticar tanto loopback como LAN, invalidar sesiones al reset y no degradar a HTTP LAN. No instalar confianza de certificados, modificar Keychain ni abrir firewall sin autorización concreta. Validar seguridad independientemente y con pruebas de API/navegador. No afirmar acceso desde otro dispositivo sin prueba real allí.

La base T4 incluye `apps/server/src/auth-store.ts`, `apps/cli/src/auth.ts`, `apps/server/test/auth.test.ts` y scripts `auth:setup`/`auth:reset`. Identidad en `<BITNODE_DB>.auth.sqlite`, permisos 0600, Argon2id de Node, token de sesión almacenado como SHA-256, reset transaccional y límite global de diez intentos en quince minutos. Sesiones sin TTL por acuerdo previo. El middleware HTTP usa una cookie de sesión de navegador sin vencimiento persistente. No usa dependencias nuevas ni modifica las notas.

RED de auth observado por módulo ausente; GREEN focalizado 2/2 y typecheck exit 0. Setup y reset se ejecutaron en PTY real contra identidad temporal, exit 0 y sin eco de contraseña. No se configuró identidad real del usuario. El verificador independiente ejecutó las pruebas focalizadas y typecheck sin bloqueantes, y confirmó ausencia de mutaciones del repositorio. La revisión nativa high `review-0373107c85a90b35` quedó aprobada y reconocida sobre el commit `9fc6b76`, aislado en un worktree para excluir los cambios HTTP concurrentes. Los revisores anotaron sin bloquear el posible bloqueo global de intentos y el consumo de intentos cuando el hash está ocupado. Se conservan como límites las carreras de reemplazo del archivo por un proceso local con acceso al directorio y la falta de pruebas específicas de permisos/concurrencia.

Los primeros intentos de verificación no arrancaron por un modelo antiguo. Se localizó la referencia en el perfil `Max` de Gentle Shell. `/reload` conserva ese perfil por diseño; el usuario adoptó `No-opencode` mediante Enter en `/gentle:profiles` y el verificador terminó correctamente. No se modificaron los archivos de configuración.

### Middleware HTTP

`createApp` acepta `auth` y `httpsOptions`. Si recibe auth sin TLS, rechaza el arranque. Solo los endpoints de pre-sesión y login son públicos dentro de la API. El resto exige la cookie `__Host-bitnode`, con Secure, HttpOnly, SameSite=Strict y Path=/, sin Max-Age ni Expires. Toda mutación exige Origin exacto y `x-csrf-token`, incluido DELETE. Logout invalida la sesión en SQLite y borra la cookie.

El login requiere JSON y un CSRF de pre-sesión vinculado a una cookie separada. La pre-sesión dura diez minutos y admite hasta 128 entradas en memoria. Cada intento la consume, así que un fallo requiere pedir otra antes de reintentar. No hay excepción para localhost, User-Agent ni ausencia de Origin. Las rutas normalizadas de API llevan `Cache-Control: no-store`, incluidos alias en mayúsculas.

El escritor no capturó RED del middleware inicial. El padre sí observó RED del defecto de caché en `/API/v1/auth/session`, por falta de no-store, y GREEN tras corregirlo. `npx tsx --test apps/server/test/auth-http.test.ts apps/server/test/lan.test.ts`: seis pruebas aprobadas. `npm test`: 31 aprobadas. `npm run typecheck` y `git diff --check`: exit 0. Se usaron certificados y SQLite temporales en loopback, sin Keychain, firewall ni datos reales. El verificador independiente repitió las seis pruebas y typecheck con exit 0, sin bloqueantes ni mutaciones del repositorio. Anotó como límites la expulsión de pre-sesiones al alcanzar el tope y el parseo de JSON antes de exigir sesión. Commit `92ffb42`; RDD high `review-75534612f978d716` aprobado y reconocido, sin correcciones. Avisos no bloqueantes sobre inundación de pre-sesiones, cobertura adicional y observabilidad de errores 500.

Revertir esta unidad elimina `auth-http.ts` y su prueba y retira las opciones y el montaje de auth en `app.ts`; no toca notas ni identidad. Las pruebas HTTPS ejercitan login, sesión, mutaciones y logout reales en loopback. No prueban confianza de CA en navegador ni acceso LAN físico.

### Preparación de certificados

`npm run tls:setup` prepara `<BITNODE_DB>.tls`, o `.data/bitnode.sqlite.tls` por defecto. Usa OpenSSL del equipo, sin dependencias npm nuevas. Para incluir la IP privada que tendrá el servidor, ejecutar con el mismo `BITNODE_DB` y `BITNODE_LAN_HOST` previsto para arrancar. Cambiar de IP requiere otro certificado con ese SAN; no basta con cambiar la variable.

La carpeta debe ser nueva. El comando no sobrescribe certificados ni claves existentes y no abre el puerto del servidor. Genera una CA de diez años y un certificado de servidor de 397 días, RSA de 2048 bits y SHA-256, con SAN para localhost, 127.0.0.1 y la IP LAN opcional. Carpeta 0700 y claves 0600. La carga rechaza archivos simbólicos, propietarios/permisos de clave incorrectos, pareja clave/certificado distinta, fechas inválidas, firma de otra CA o SAN ausentes.

El comando imprime la ruta de `ca.pem` y su huella SHA-256, nunca las claves. Guarda `ca-key.pem` y `server-key.pem` solo en este Mac o en una copia privada. No los transfieras a los dispositivos. Solo se comparte `ca.pem`, por un canal controlado, y se compara su huella con la impresa en el Mac. Confiar en esta CA permite aceptar certificados que firme su clave; no importarla en equipos ajenos.

La confianza se instala manualmente, después de decidirlo expresamente:

1. En el Mac, importar solo `ca.pem` en Acceso a Llaveros, comprobar la huella y habilitar confianza para SSL de esa CA.
2. En otro dispositivo, importar la CA mediante el mecanismo de certificados del sistema. En iOS, instalar el perfil y después habilitar esa raíz en Ajustes, General, Información, Ajustes de confianza de certificados. Comparar la huella antes de confiar.
3. Cuando el servidor HTTPS esté integrado, abrir la URL con un nombre o IP incluido en sus SAN. No continuar ignorando un error del certificado.

No hay renovación automática. No borrar la carpeta para resolver un error sin planear antes la renovación y la confianza de los dispositivos. Ningún comando de esta unidad modifica Keychain, almacenes de confianza ni firewall.

Evidencia: RED de `tls.test.ts` por módulo ausente, exit 1. GREEN de una prueba con TLS real confiando explícitamente en la CA, rechazo sin ella, SAN distinto, sobrescritura rechazada sin cambiar la CA, fecha simulada vencida, permisos y symlink. Typecheck incluye ahora ambas CLI, antes omitidas del tsconfig raíz. `npm run tls:setup` se ejercitó en un directorio temporal, exit 0, sin crear notas ni identidad real. La suite completa aprobó 32 pruebas y typecheck, con exit 0. El verificador independiente repitió TLS y typecheck sin bloqueantes ni cambios al repositorio. Advirtió que la CA no tiene restricciones de nombres y que su clave vive junto a la del servidor. La carga no valida EKU ni permisos de la clave de CA, que no necesita para servir HTTPS. La limpieza ante fallos de OpenSSL y un certificado firmado por otra CA no tienen prueba específica. Commit `afeac1f`; RDD high `review-1fe54fca1a487a51` aprobado y reconocido. El rango acumulado hasta ese commit también quedó aprobado y reconocido en `review-b56e4f86bbdb557a`, sin correcciones. Revertir esta unidad retira `tls.ts` de servidor y CLI, su prueba y el script; no borra certificados creados por un operador.

### Arranque protegido

`main.ts` usa `openRuntime`: valida puerto, LAN, certificados e identidad configurada antes de abrir la base de notas. Si falta TLS o contraseña, aborta sin crear ni migrar notas. El único servidor de producción es HTTPS con auth, también en loopback. La factoría `createApp` sigue admitiendo una aplicación sin auth para pruebas aisladas; producción no usa esa opción.

RED de `runtime.test.ts` por módulo ausente. GREEN comprueba puerto inválido, certificados ausentes, identidad ausente o vacía y SAN distinto sin crear notas. El recorrido positivo abre HTTPS real con confianza explícita en la CA y recibe 401 al consultar notas sin sesión. Cierre idempotente de servidor y ambas bases. El verificador independiente repitió runtime y typecheck con exit 0, sin bloqueantes ni cambios al código. Quedan sin prueba los fallos tardíos de listen/cierre y un arranque positivo LAN. El proceso real `main.ts` también rechazó TLS ausente con exit 1, sin crear notas ni identidad en un directorio temporal. Commit `b0dde33`; RDD `review-084d08df3c0c1892` aprobado y reconocido. Revertir esta unidad retira `runtime.ts` y su prueba y restaura el arranque anterior; eso reintroduciría el servidor sin protección y no es una alternativa segura de operación.

### Login web y verificación integrada

La web consulta la sesión antes de cargar notas. El formulario borra la contraseña de su estado al enviarla y obtiene una pre-sesión nueva en cada intento. CSRF vive solo en memoria. Un 401 o rechazo CSRF de la API de notas oculta la vista y pide entrar otra vez, sin borrar el borrador ni repetir la escritura. Por petición posterior del usuario, no hay botón de cerrar sesión ni handler de logout en la web. La API de logout conserva su invalidación de sesión y CSRF; el reset CLI invalida todas las sesiones. No prometer que cerrar el navegador invalide una sesión en el servidor.

RED observado en navegador: el servidor de prueba anterior permitía GET de notas sin sesión, 200 en lugar de 401. Tras integrar el mismo runtime de producción en el harness, GREEN de login y de borrador móvil, seguido de 17 E2E completos con build Angular. En esa versión incluían contraseña incorrecta y reintento, cookies __Host reales, CSRF/Origin ausentes, recarga, logout confirmado/cancelado, invalidación externa, guardado tras reautenticar, búsqueda, etiquetas, conflictos y editor móvil. La prueba posterior de logout usa la API y exige ausencia de su botón en la web. Capturas `login-notas-mobile.png` y `notas-desktop.png` revisadas; sin overflow móvil.

La prueba de navegador usa `ignoreHTTPSErrors` exclusivamente con una CA temporal; no instala confianza del sistema. TLS/runtime verifican explícitamente la cadena con esa CA. No afirmar que Chromium haya validado la confianza del Mac. El verificador independiente revisó el flujo completo y aprobó cinco pruebas HTTP/runtime y typecheck, sin bloqueantes ni cambios de código; no repitió el navegador mientras la suite del padre ocupaba el puerto. Typecheck raíz no incluye Angular; el build Angular de E2E sí comprueba tipos y plantillas. Se retiró el optional chain innecesario de `note.tags.length`; el build Angular posterior terminó con exit 0 y sin NG8107. LSP activo confirmó cuatro archivos y dejó dos inconclusos, sin diagnósticos de error.

Revertir esta unidad elimina el formulario y transporte CSRF de web, el fixture de login y `auth.spec.ts`, y restaura el harness anterior. Mantener el arranque protegido: revertir la UI dejaría la API cerrada, no habilitaría acceso anónimo. Revisión nativa de esta unidad pendiente.

### Ajuste visual posterior de etiquetas

El usuario rechazó el selector anterior. Las asignaciones ahora se ven como chips bajo el título, con una cruz para quitarlas sin borrar la etiqueta. «＋ Etiqueta» abre un selector de chips con `aria-pressed` y creación inline. Una paleta opcional sustituye el campo hexadecimal; Enter crea una etiqueta sin enviar el formulario de la nota. Los filtros usan los mismos chips y conservan Aplicar y Todas/Cualquiera. Sin cambios de API, esquema ni notas guardadas.

RED de dos E2E por presencia del botón de salida y del campo hexadecimal antiguos. GREEN focalizado de tres E2E y captura móvil revisada. El primer recorrido completo pasó 17 y falló uno por una expectativa de color en minúsculas; el contrato existente normaliza mayúsculas. Se corrigió la prueba, no los datos. El primer chequeo de tipos agotó 30 segundos; el usuario autorizó una sola repetición aislada a 60 segundos, que terminó con exit 0. Suite final de 18 E2E con build Angular aprobada, exit 0. Capturas `etiquetas-editor-mobile.png` y `etiquetas-selector-desktop.png` revisadas; Enter crea sin guardar la nota y el color coincide con el contrato. La altura del editor sigue siendo un problema separado reportado por el usuario. Revertir esta unidad restaura los controles anteriores y sus pruebas, sin tocar backend ni identidad. RDD sigue pendiente por herramienta local no disponible en el host cargado.

### Foco, scroll y tablas Markdown

Abrir una nota existente ya no enfoca ni selecciona automáticamente su título; crear una nueva sí. El formulario y CodeMirror comparten una altura acotada, con scroll interno del contenido en escritorio y móvil. Código fuente también ocupa el espacio disponible sin empujar Guardar hacia abajo.

El editor reconoce tablas GFM y las muestra con cabecera, filas y alineación. «Editar tabla» revela el bloque Markdown; salir del foco vuelve a mostrar la tabla. Las decoraciones no reescriben el documento. El widget crea elementos y texto DOM, sin `innerHTML`: omite HTML, no crea imágenes ni URLs activas y admite formato inline básico. El botón respeta solo lectura mientras se guarda.

RED de cuatro E2E por foco en una nota existente, Guardar fuera del viewport en ambas anchuras y ausencia de tabla; GREEN de los cuatro tras el arreglo. Una quinta prueba reprodujo un botón que no se deshabilitaba al guardar: la igualdad del widget ignoraba `readOnly`. Se incluyó ese estado y la suite final aprobó 23 E2E con build Angular y 33 pruebas de core/base/servidor/Markdown, todos con exit 0. LSP activo sobre cuatro archivos no encontró errores; quedan avisos de estilo. Capturas `editor-scroll-1280.png`, `editor-scroll-390.png` y `tabla-markdown.png` revisadas. El gesto táctil es sintético en Chromium; no demuestra funcionamiento en una PWA instalada ni en Safari/iOS real.

Revertir esta unidad retira `live-tables.ts`, su conexión al editor y sus pruebas, y restaura las reglas anteriores de foco y altura. No cambia API, esquema ni datos. El verificador independiente revisó código, CodeMirror y sondas del parser sin bloqueantes; no repitió navegador ni build. Señaló límites no bloqueantes: entidades HTML literales, tablas anidadas que pueden quedar como fuente o afectar visualmente la viñeta, coste de recorrer tablas en cada transacción y foco que no vuelve a la edición de tabla tras guardar. No se midió rendimiento con muchas tablas ni se verificaron Safari, pantallas muy cortas o PWA instalada. El HTML omitido en la tabla sigue intacto en el Markdown. RDD final sigue bloqueado por la herramienta.

### Ancho de columnas por cabeceras

Una captura real mostró que el reparto automático comprimía cabeceras mientras una celda larga ocupaba casi toda la tabla. El usuario eligió repartir el espacio según la cantidad de columnas, sin usar el cuerpo para calcular anchos. El mínimo de cada columna es el mayor entre su cabecera medida en una línea y su palabra más larga, con padding y borde, hasta el máximo común de 320 px. La palabra más larga se añadió después: con solo la cabecera, la captura mostró «1465106974» partido bajo «ID», y el usuario eligió contarla. Las celdas usan `overflow-wrap: break-word`, que solo parte un texto mayor que el máximo. El espacio restante se reparte entre las columnas que pueden crecer. Si no caben los mínimos, hay scroll horizontal dentro de la tabla, no en la página. Las columnas no superan el máximo aunque sobre espacio.

El widget usa `colgroup` y layout fijo, recalcula al cambiar el tamaño del contenedor y desconecta su `ResizeObserver` al destruirse. Las celdas se alinean arriba para que una fila alta no oculte valores cortos en el centro. No se modifica Markdown, API ni esquema. El tsconfig raíz incluye ahora las pruebas Node de `apps/web/test`; el build Angular sigue comprobando la aplicación.

RED de cuatro E2E y del módulo de reparto ausente. GREEN de seis casos unitarios. El primer recorrido de navegador pasó tres pruebas y agotó 30 s en la cuarta: la prueba intentaba pulsar la lista detrás del modal ya abierto tras redimensionar. Se diagnosticó con el trace y se corrigió ese paso. El usuario autorizó una ejecución nueva sin ampliar el límite; aprobó los cuatro E2E. La inspección visual detectó después el centrado vertical en filas altas: nueva aserción RED en escritorio y móvil, seguida del ajuste CSS a alineación superior. Typecheck de esta unidad terminó con exit 0, al igual que 39 pruebas, y la regresión completa aprobó 27 E2E. Después, la aserción de que el ID y la campaña quedan en una línea falló en ambas anchuras (RED) antes de medir la palabra más larga. El primer intento siguió partiendo el ID: la clase `cm-lineWrapping` de CodeMirror hereda `word-break: break-word`, que reduce min-content a letras sueltas, y la aserción también contaba la caja del `span`. Con `word-break: normal` en las celdas y el conteo de líneas solo sobre nodos de texto, la suite completa aprobó 27 E2E con build Angular, y 39 pruebas y typecheck terminaron con exit 0. Capturas `table-columns-1280.png` y `table-columns-390.png` revisadas: ID y campaña en una línea, palabras sin partir y scroll horizontal dentro de la tabla en móvil. LSP conserva dos avisos Node de configuración inferida y dos archivos inconclusos; no se usa eso como prueba de limpieza, el compilador raíz sí aprobó.

Para revertir solo este ajuste, retirar `table-widths.ts` y sus pruebas, la medición/colgroup del widget y las reglas CSS de anchos y alineación. No retirar el render seguro de tablas de la unidad anterior. RDD final sigue pendiente, sin heredar la revisión independiente ni los receipts anteriores.

**Implementación y pruebas de T4 en loopback completas. Pendiente revisión nativa final y aceptación operativa con CA confiada en el Mac y otro dispositivo LAN. No se ha instalado confianza, abierto firewall ni migrado notas reales.**
