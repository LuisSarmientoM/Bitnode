# T5 Clientes y contactos: registro de avance

Registro de la unidad [T5](plan-implementacion-local.md). Rama `feat/clients-contacts-t5`. **T5 no está completa.** Autorizado: web/API, Clientes antes de Contactos.

## Corte 1: dominio y persistencia de Clientes

Sin HTTP, UI ni CLI. Probado solo con SQLite temporal/en memoria; no se migró ninguna base real.

| Unidad | Estado |
|---|---|
| Validación y normalización (`packages/core/src/clients.ts`) | Hecha |
| Migración `user_version 3`: `clients`, `client_tags` (`packages/db/src/clients.ts`) | Hecha |
| Crear, editar, listar, obtener, archivar, reactivar, borrar, asignar etiquetas existentes | Hecho |
| Pruebas core y SQLite (`clients.test.ts` en ambos paquetes) | Hechas |

## Decisiones

- `fullName` obligatorio y único por clave normalizada; `shortName` opcional con unicidad propia, independiente del nombre completo. Se usa `clientNameKey`, independiente de la búsqueda (ñ distinta de n, acentos vocálicos equivalentes).
- `scope` (`work`/`personal`) obligatorio al crear, sin default y no editable por `update`: el cambio será una acción confirmada aparte.
- Texto opcional vacío se guarda como `null`. Límites: nombres 500 puntos de código, observaciones 1 MiB UTF-8 (propuestos en contratos).
- `expectedRevision` es obligatorio en editar, archivar, reactivar, etiquetar y borrar. Un cambio sin efecto real no incrementa la revisión. Archivar un cliente ya archivado (o reactivar uno activo) es un no-op.
- Borrar solo sin asociaciones. Hoy la única asociación implementada es `client_tags`; las demás se añaden con su módulo.
- Asignar etiquetas con el mismo conjunto (reordenado, duplicado o vacío sobre vacío) es no-op: valida `expectedRevision` primero y no cambia revisión ni `updatedAt`.
- Claves de unicidad con `clientNameKey` (core), independiente del normalizador de búsqueda: mismas equivalencias, solo recorta espacios exteriores y no colapsa los interiores. La clave se guarda en SQLite: cambiarla exige migrar claves.
- CHECK en SQLite: `full_name` 1..500, `short_name` nulo o 1..500, `observations` nulo o <= 1 MiB UTF-8 (`length(CAST(... AS BLOB))`).
- La migración corre en la misma transacción `immediate` que las anteriores; si falla no cambia `user_version`. Una base con versión mayor a 3 se rechaza.
- Errores: `VALIDATION_ERROR`, `NOT_FOUND`, `REVISION_CONFLICT`, `DUPLICATE_NAME`, `HAS_ASSOCIATIONS`. REST debe mapear los tres últimos a `CONFLICT` con `reason` (`REVISION_MISMATCH`, `DUPLICATE_NAME`, `HAS_ASSOCIATIONS`).

## Pendiente de T5

- Cerrar los casos límite y la revisión integrada de la UI de cambio de ámbito, etiquetas y borrado, ya implementada.
- Bloqueo de archivo por proyectos activos/pausados y de borrado por proyectos, notas, eventos y finanzas (dependen de T6, T12, T14 y T15).
- La búsqueda local de Clientes está integrada en web/API. La búsqueda global y FTS5 de T17 quedan fuera.
- Contactos, vínculos contacto-cliente y etiquetas de contactos.
- Completar la verificación final de Clientes y su revisión nativa. No se ha iniciado Contactos.
- La CLI queda excluida de T5 por decisión del usuario; no es pendiente.

## Evidencia

| Fase | Comando | Resultado |
|---|---|---|
| RED | `npx tsx --test packages/core/test/clients.test.ts packages/db/test/clients.test.ts` | exit 1: falta `clients.ts` y `db.clients` |
| GREEN | mismo comando | 11 pruebas pasan, 0 fallan |
| Regresión | `npx tsx --test packages/core/test/*.test.ts packages/db/test/*.test.ts apps/server/test/*.test.ts apps/web/test/*.test.ts` | 52 pasan, 0 fallan. Antes de actualizar dos aserciones de versión (`local.test.ts`: 2→3; `notes.test.ts`: futura 3→4) fallaban 2, consecuencia esperada del nuevo `user_version` |
| Tipos | `npx tsc --noEmit -p tsconfig.json` | exit 0 |

## Correcciones tras verificación independiente

| Corrección | RED | GREEN |
|---|---|---|
| B1 `setTags` no-op; CHECKs v3; clave propia; mensaje de revisión de clientes; rollback tras `CREATE TABLE clients` con fixture v2 explícito | `npx tsx --test packages/core/test/clients.test.ts packages/db/test/clients.test.ts`: exit 1, 16 pruebas, 4 fallan (clave, mensaje, CHECKs, `setTags`) | mismo comando: exit 0, 16 pasan |
| Regresión de paquetes | | `npx tsx --test packages/core/test/*.test.ts packages/db/test/*.test.ts`: exit 0, 33 pasan |

No se repitieron la suite completa ni `tsc` en esta ronda. El usuario autorizó después una nueva ejecución del typecheck y de la suite del servidor, hasta 120 segundos por comando en segundo plano, una vez terminados los cambios en curso. Autorización consumida: typecheck exit 0 y suite del servidor con 23 pruebas aprobadas, cero fallos y exit 0. Se ejecutaron con máximo de 120 segundos por comando y terminaron en 7 y 9 segundos, respectivamente.

La reverificación independiente de las correcciones no encontró bloqueantes en core/db. Revisó código, pruebas y logs; no repitió comandos. Los logs muestran RED con cuatro fallos y GREEN con cero, pero no incluyen códigos de salida; los códigos anteriores son los reportados por el writer.

## Corte 2: API de Clientes

`apps/server/src/clients-controller.ts` añade listado, lectura, creación, edición, archivo, reactivación, etiquetas y borrado sin asociaciones. El mapper de conflictos es propio de Clientes para no cambiar el contrato de Notas.

- RED reportado: seis pruebas, cinco fallos por rutas inexistentes, exit 1.
- GREEN reportado: seis pruebas pasan, exit 0.
- Suite del servidor: timeout de 30 segundos, exit 124. No está aprobada aunque antes del corte mostrara 20 pruebas sin fallos.
- Typecheck final: timeout de 30 segundos, exit 124. El éxito anterior no verifica el código final.
- Las pruebas de autenticación y CSRF usan el middleware con una sesión simulada; no sustituyen una prueba HTTPS integrada.
- LSP usa configuración inferida para el controller y señala decoradores aunque el tsconfig raíz incluye el servidor y habilita `experimentalDecorators`. No se considera comprobación autoritativa de tipos.
- La integración web del cambio confirmado de ámbito sigue pendiente. No hay aprobación final de Clientes ni de T5.

## Corte 3: búsqueda de Clientes

`GET /api/v1/clients?q=` busca en nombre completo, nombre corto y observaciones. Todos los términos deben coincidir como prefijos de palabras, aunque estén en campos distintos. Ignora mayúsculas y acentos vocálicos y distingue ñ de n. La clave de unicidad permanece independiente.

El predicado parametrizado de SQLite se aplica antes de `count`, `LIMIT` y `OFFSET`, combinado con ámbito y archivados. No hay FTS5 ni índice de búsqueda en este corte; el coste crece con la colección. Una consulta sin palabras no filtra, igual que en Notas.

- RED reportado: 26 pruebas, 6 fallos, exit 1.
- Ejecución intermedia: 2 fallos por expectativas incorrectas en pruebas; no fue GREEN.
- GREEN final reportado: 26 pruebas pasan, exit 0. Comando: `npx tsx --test packages/core/test/clients.test.ts packages/db/test/clients.test.ts apps/server/test/clients.test.ts`.
- Lectura estructural del padre confirma que el mismo filtro se usa para resultados y total antes de paginar.
- LSP activo sobre seis archivos: dos confirmados limpios y cuatro inconclusos. No demuestra tipos limpios en todos los archivos.
- No se ejecutaron typecheck ni suite global en este corte. La repetición autorizada sigue reservada para la integración.

## Corte 4: cambio confirmado de ámbito

`POST /clients/:id/change-scope` requiere revisión vigente. Sin aceptación devuelve `CONFIRMATION_REQUIRED` con una vista previa, sin escritura. La aceptación devuelve el digest y todos los códigos y destinos mostrados. El servidor recalcula la vista previa dentro de la transacción de escritura antes de cambiar el ámbito.

- Un digest o un conjunto de efectos distintos devuelve `CONFLICT / PREVIEW_CHANGED`, con vista previa actual y sin escritura. Una revisión vieja devuelve `REVISION_MISMATCH`.
- Cambiar al mismo ámbito es no-op y no incrementa revisión. `PATCH` sigue rechazando `scope`.
- Hoy solo existe el efecto de cambio del cliente. Al añadir Contactos deberán incorporarse sus vínculos al proveedor de impacto. No se inventan tablas de módulos futuros.
- Writer reporta RED exit 1 y GREEN exit 0 con 12 focales nuevas en core, SQLite y REST. No ejecutó typecheck ni suite global.
- El padre leyó código y pruebas, actualizó la aserción REST anterior que esperaba 404 y añadió comprobación de ausencia de escritura ante confirmación requerida. La ejecución integrada terminó con 18 pruebas aprobadas, cero fallos y exit 0: `npx tsx --test packages/core/test/client-scope.test.ts packages/db/test/client-scope.test.ts apps/server/test/client-scope.test.ts apps/server/test/clients.test.ts`.
- LSP advierte módulos Node ausentes bajo configuración inferida, aunque `tsconfig.json` incluye `packages/**/*.ts` y `types: ["node"]`. No se instalaron dependencias ni se cambió configuración por esos avisos; el typecheck real sigue pendiente.

## Corte 5: interfaz inicial y búsqueda

Componente `ClientsPage` y estado `ClientsStore` separados de Notas. El borrador de Clientes permanece en un servicio raíz si la sesión expira; Notas sigue montado al cambiar de módulo y su atajo de guardado no actúa desde Clientes.

- Lista, creación con ámbito obligatorio sin default, edición con lectura vigente, archivo/reactivación, filtros y paginación reales.
- Consulta escrita separada de consulta aplicada. Una búsqueda fallida conserva la consulta escrita y la lista anterior; filtros y paginación usan la consulta aplicada.
- El fallo de archivo se conserva en `actionError` tras refrescar. No hay reintento automático de escritura ni éxito falso.
- Ámbito como texto simple, sin chip decorativo. Estado solo se muestra al incluir archivados.
- Primera UI: writer reportó 10 E2E focales y 40 E2E de regresión aprobadas. No verifican las acciones añadidas después.
- Correcciones y buscador: RED inicial contaminado por datos fuera de la primera página. Un segundo RED mostró dos fallos del mensaje real de archivo. GREEN final reportado: 15 E2E de Clientes, exit 0; el runner compiló Angular con `build:web`.
- El padre leyó store, template y CSS y revisó las capturas `/tmp/bitnode-t5-shots/clients-desktop-list.png` y `clients-mobile-list.png`. La tabla móvil tiene scroll horizontal interno; no se afirma equivalencia pixel a pixel con Stitch.
- Capturas y tests usan datos ficticios en servidor temporal. No se abrió una base real.
- La integración UI de ámbito confirmado, etiquetas y borrado se entregó en el corte siguiente. Este corte inicial no verifica esas funciones.

## Corte 6: acciones de Clientes y comprobaciones integradas

La UI tiene acciones separadas para cambiar ámbito, asignar etiquetas y eliminar un cliente sin asociaciones. El ámbito usa preview/aceptación del backend y exige otro clic ante `PREVIEW_CHANGED`. Etiquetas solo se asignan al guardar; crear una etiqueta no la asigna implícitamente. El borrado muestra nombre y advertencia definitiva, conserva errores y no reintenta la escritura automáticamente.

- Último writer reporta 24 E2E de Clientes aprobadas, exit 0. Hubo un intento fallido de build al importar tipos de un módulo Node desde Angular; se sustituyó por una declaración local de transporte.
- El padre leyó store, parser de errores, template y pruebas y revisó capturas finales de etiquetas móvil y cambio de ámbito desktop.
- Typecheck del padre: `tsc --noEmit -p tsconfig.json`, exit 0, 7 segundos. Suite servidor del padre: `tsx --test apps/server/test/*.test.ts`, 23 pasan, cero fallos, exit 0, 9 segundos. Son las dos repeticiones únicas autorizadas tras timeouts previos; no se repitieron automáticamente.
- Las comprobaciones anteriores corresponden al código entregado hasta este corte. Los cambios posteriores no heredan esa cobertura.
- Endurecimiento terminado: la prueba UI sintetiza efectos y digest distintos como adaptador de prueba y comprueba el cuerpo exacto de la nueva aceptación y ausencia de envíos automáticos. No representa un proveedor de contactos real del backend.
- RED real de validación: tres previews mal formados habilitaban Confirmar. RED real de geometría: menú inferior a 706,5 px en viewport de 600 px. Ambos corregidos, con ocho focales aprobadas reportadas por el writer.
- El padre leyó la validación del preview y el ajuste vertical del menú y revisó `/tmp/bitnode-t5-shots6/clients-mobile-menu-bottom.png`; las tres acciones quedan visibles dentro del viewport.
- El archivo temporal `tests/e2e/zz-debug.spec.ts`, creado fuera de las superficies del writer, se eliminó tras leer y verificar su contenido exacto. No contiene trabajo de producto ni entra en los commits.

## Comprobaciones finales y entrega

Sobre el snapshot posterior al endurecimiento, el padre ejecutó `npm test`: 79 pruebas aprobadas, cero fallos, exit 0. También ejecutó `npm run build`: tipos y build Angular aprobados, exit 0. Son comprobaciones del nuevo código, no reintentos automáticos de un comando fallido.

El writer reportó la regresión E2E completa: 59 aprobadas y una omitida, exit 0. La omitida es el guion opcional de capturas, que requiere `CLIENTS_SHOTS_DIR`.

La revisión nativa sigue pendiente. El usuario autorizó organizar commits locales por cortes revisables, con pruebas junto al código, sin push ni publicación, y continuar mientras descansa. El diff acumulado supera 2600 líneas; no se congelará como una única revisión corta. No se declara Clientes ni T5 completados. Contactos no se ha iniciado.

### Corte local y bloqueo de inicio nativo

Se creó el commit local `e91470e961cf46543ca4577dc572a283febf4af3`, `feat(clients): validate client identities and confirmed scope changes`: cuatro archivos de core y sus pruebas, 347 líneas. El resto del trabajo permanece intacto y sin commit en `feat/clients-contacts-t5`. No se hizo push.

La revisión solicitada era solo para ese commit, con `committedOnly: true`, no para el árbol completo. Un primer START rechazó `HEAD^` por base no resoluble, sin crear lineage. Se resolvió la base completa `0fdfba5ca3a5cd8ab82f1b3d0e1ac3929112006d`. El segundo START rechazó el inicio con `native-start-retained-selection-candidate-mismatch` y `mutation_performed: false`, indicando `inspect-and-resolve-the-current-intended-untracked-selection`. No hay revisión iniciada ni aprobación heredable; no se ejecutó reset ni recovery.

La selección retenida por inspect corresponde al árbol de trabajo, mientras el corte solicitado es un rango de commits. No se repetirá el mismo START sin resolver esa diferencia. Tampoco se moverán ni descartarán los cambios para forzar el inicio.

### Commits locales de Clientes

Cada commit incluye el código y sus pruebas. Ninguno se ha publicado.

| Commit | Contenido | Líneas | Validación |
|---|---|---|---|
| `e91470e` | Core: validación, claves, búsqueda y preview de ámbito | 347 | Pruebas core dentro de `npm test` 79/79 |
| `83ffe17` | SQLite v3, repositorio, migración y pruebas | 511 | Pruebas db dentro de `npm test` 79/79 |
| `9998206` | REST de Clientes y pruebas | 317 | Suite servidor 23/23 y `npm test` 79/79 |
| siguiente | UI, E2E y este registro | ~1700 | Build exit 0 y E2E 59 aprobadas, 1 omitida |

Los commits intermedios no se ejecutaron por separado en un checkout aislado. Cada uno depende solo de los anteriores: core no usa db; db no usa server ni web; server no usa web. Las pruebas finales se ejecutaron sobre el mismo contenido de esos archivos.

El corte de UI supera el presupuesto habitual de 400 líneas. Dividirlo exigiría reconstruir versiones intermedias de `clients-page.ts` y de la E2E que nunca existieron ni se probaron, y los dos cortes posibles seguirían por encima de 400 líneas. Queda como excepción de tamaño pendiente de decisión del usuario para la revisión nativa.

## Advisories restantes

- Los límites de nombres y observaciones siguen siendo propuestos, no aprobados.
- Los CHECK de tamaño no corren sobre bases ya migradas a v3 durante el desarrollo; solo aplican a bases migradas desde v2.
- `list` ordena por clave normalizada, no por colación Unicode.
