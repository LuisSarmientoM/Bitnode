# Stitch v2 — Exportaciones y estado

Proyecto Stitch activo: `6105920283929023272` · "Bitnode Productividad Personal v2" (PROJECT_DESIGN, escritorio).
Design system: `assets/11771785892601738232` · "Bitnode Native Utility" — DARK, ROUND_FOUR, primary `#07B478`, secondary `#518166`, tertiary `#FF9676`, neutral `#717973`, Inter (body), Space Grotesk (headline), JetBrains Mono (labels).

El proyecto anterior (`2279618890073351760`, 11 pantallas) fue eliminado el 2026-10-05. La v2 completa cubre todos los grupos del brief (docs/diseno-ui-stitch.md); generación por **CLI** (`@google/stitch` 0.11.0, api_key en `~/.stitch.json`, proyecto pinneado en `.stitch.json` local). Cada pantalla verificó 0 violaciones en su HTML (sin SQLite, cifrado, versiones, facturación, avatares ni texto corrupto). Ver "Normalización de paleta" más abajo: los IDs activos son los listados en esa tabla.

## Pantallas (15)

| Grupo | Pantalla | Screen ID | Notas |
|---|---|---|---|
| Hoy | Bitnode - Productividad Personal (Hoy con contenido) | `4c762326fa0d46b194e3ceabd7ca1157` | Header de una fila; listas por grupo; hover con motivo + Desbloquear/Pausar |
| Hoy | Bitnode - Hoy (Estado Inicial) | `7ab6e1ae25ec4ca4b972ae039c12d584` | Variante B: barra de captura integrada |
| Organización | Bitnode - Clientes | `40833306d8ef4522b0bfe92a0e5d5e20` | Scope obligatorio sin default; archivados ocultos con toggle |
| Organización | Bitnode - Contactos | `ed17d4fe3bfd440d99ae6f500ec6c7c4` | Duplicados válidos; libres y multi-cliente |
| Organización | Bitnode - Proyectos | `33c1c4e4525c4ceb947123c7e7026cf2` | Cliente fijo; fechas solo día; conteo de tareas |
| Conocimiento | Bitnode - Notas | `78b4ba98e4724e1fbb4b12fd588310ba` | Lista + editor Markdown; vínculos explícitos; título generado |
| Tiempo | Bitnode - Tiempo | `381642d779804c85bb0f1f82deda328d` | 2 temporizadores simultáneos; límite 12h; entrada "Tarea eliminada" solo lectura |
| Finanzas | Bitnode - Finanzas | `3c6e5bbedc6c4bf0857fab0b8fb942e5` | COP/USD con equivalente o "Pendiente de tasa"; total solo COP; editar tasa |
| Calendario | Bitnode - Calendario | `e0f3bdc6d1104df2b945d88e247f2806` | Marcadores distintos; conteos de cerradas; evento multi-día inclusivo |
| Consulta | Bitnode - Búsqueda global | `63d82f282f4c438aa3e79719dbec0c10` | Todos los términos; grupos por entidad; archivados con toggle |
| Recuperación | Bitnode - Papelera | `18d11bd989ad41cc81a6ccf97dcff2b0` | Notas/eventos restaurables; tareas en sección separada sin restaurar |
| Operación | Bitnode - Login | `ed58046fbffa4927ab1a5df2d8a89e74` | Contraseña local; error de ejemplo; sin OAuth ni recordarme |
| Operación | Bitnode - Configuración | `6927299809544e17a57b320c46a4c74b` | LAN + HTTPS local; backup manual; restore por CLI con servidor detenido; General |
| Tarea | Bitnode - Detalle de Tarea (Vista Base Corregida) | `d12364d455ff42958628042a2dee98dc` | **activa**: detalle completo visible sin modal; motivo de bloqueo coherente; pie limpio |
| Tarea | Bitnode - Detalle de tarea (Traslado) | `49f1ef1e2ff246e791e103f83fb189a7` | estado de confirmación de traslado: modal centrado con checklist de 4 puntos |
| Tarea | Bitnode - Detalle de Tarea (sustituida) | `c7ba406b0f9743be946c0252b28ec1ff` | A eliminar: era solo el modal tapando el detalle |

## Reglas de diseño acumuladas (validadas con el usuario)

1. Detalle dentro de hover/modal/plegables, nunca en la fila.
2. Encabezado de una sola fila; sidebar con solo "Configuración" en el pie.
3. Listas separadas por grupo; motivo de bloqueo visible en bloqueadas.
4. Sin badges decorativos, contadores, banners, SQLite, versiones ni métricas de ingresos.
5. Una vista por estado; los modales/paneles se documentan en pantallas separadas si se diseñan.

## Normalización de paleta (2026-10-05)

El usuario detectó que cada pantalla derivaba su propia paleta (fondos de #090f15 a #1c2128): cada generación definía su propio objeto colors en el <script id="tailwind-config">. Paleta canónica fijada y aplicada a TODAS las pantallas:

surface `#121314` · surface-container `#181a1b` · surface-container-high `#1e2022` · surface-container-highest `#26292b` · on-surface `#e2e4e2` · on-surface-variant `#9ca19d` · outline-variant `#2a2e31` · primary `#07B478` · secondary `#518166` · tertiary `#FF9676` · neutral `#717973`

Vía de aplicación: 9 por MCP edit_screens (crea pantalla nueva — IDs actualizados abajo), 7 por CLI `stitch edit screen` (actualiza in-place, sin duplicados). Inbox fue la última en recibirlo.

### IDs activos tras la normalización

| Pantalla | ID activo | Nota |
|---|---|---|
| Hoy con contenido | `4c762326fa0d46b194e3ceabd7ca1157` | in-place, ya era canónica |
| Hoy vacío | `b70f62181bad46d793e7f3d97c873e01` | License MCP; sustituye a `7ab6e1ae…` |
| Detalle de Tarea | `baeab8fcd0ba49ecab83e25051e473c5` | MCP; sustituye a `d12364d4…` |
| Detalle (Traslado) | `49f1ef1e2ff246e791e103f83fb189a7` | CLI in-place |
| Inbox | `5f6ad5d67d69461eba85ad956e0521ae` | CLI in-place |
| Clientes | `1af879a270bd45ce98fab249e9add022` | MCP; sustituye a `40833306…` |
| Contactos | `55bab0d30aa7481d8085486fb80e2121` | MCP; sustituye a `ed17d4fe…` |
| Proyectos | `33c1c4e4525c4ceb947123c7e7026cf2` | CLI in-place |
| Notas | `78b4ba98e4724e1fbb4b12fd588310ba` | CLI in-place |
| Tiempo | `7f2ccff844e2446ca8a37d804513e6d2` | MCP; sustituye a `381642d7…` |
| Finanzas | `9604203ca9044a45992d7448ff4d9522` | MCP; sustituye a `3c6e5bbe…` |
| Calendario | `e0f3bdc6d1104df2b945d88e247f2806` | CLI in-place |
| Búsqueda | `49e1f67337f747f9b3a939fe97fe8f35` | MCP; sustituye a `63d82f28…` |
| Actividad | `672610481a504491a7eecac39293196f` | MCP; sustituye a `604f7802…` |
| Papelera | `121f26d4a9be43d8a193f9b4dd1167a2` | MCP; sustituye a `18d11bd9…` |
| Login | `ed58046fbffa4927ab1a5df2d8a89e74` | CLI in-place |
| Configuración | `6927299809544e17a57b320c46a4c74b` | CLI in-place |

Los IDs sustituidos permanecen en el canvas como instancias viejas (Stitch no permite borrar pantallas ni por API ni por CLI); en la UI web se pueden ocultar/borrar a mano.

### Lección de proceso

Incluir el objeto colors canónico EN el prompt de cada `stitch generate screen` futuro para evitar deriva desde el origen.

## Pendiente

1. Aprobación visual final del usuario sobre las pantallas nuevas (Clientes/Contactos/Proyectos/Notas/Tiempo/Finanzas/Calendario/Búsqueda/Actividad/Papelera/Login/Configuración).
2. Estados alternativos por pantalla (vacío por filtro, error, conflicto) si se solicitan.
3. Pasar a Angular: extraer tokens y componentes; HTML de Stitch es referencia visual, no implementación.
