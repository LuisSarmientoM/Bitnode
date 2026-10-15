# Stitch — Exportaciones y estado

Proyecto Stitch: `2279618890073351760` · "Bitnode Productividad Personal" (TEXT_TO_UI_PRO / escritorio).
Design system: `assets/3283356300574587004` · "Bitnode Native Utility" — DARK, ROUND_FOUR, primary `#07B478`, secondary `#518166`, tertiary `#FF9676`, neutral `#717973`, Inter (body), Space Grotesk (headline), JetBrains Mono (labels/valores).

Estado de revisión: pendiente de aprobación del usuario. Capturas 512×410 no verifican medidas CSS exactas; usar HTML de referencia cuando esté disponible.

## Pantallas

| Pantalla | Screen ID | Iteraciones locales | Estado |
|---|---|---|---|
| Bitnode - Vista Hoy (Simplificada) | `43cd28098fa341c082fe8cd4ce55d835` | **versión activa**: lista reconstruida y visible (3 secciones, filas compactas, hover en la primera) | Revisión pendiente |
| Bitnode - Vista Hoy (base anterior) | `d75cd6034d5a4d4db51b5ce3da6ec52f` | sustituida por la Simplificada | Descartada como versión activa |
| Bitnode - Hoy (Estado Inicial - Centrado) | `e69c55c346ed494f901841a0575766d3` | variante 1 | Pendiente de elección |
| Bitnode - Hoy (Estado Inicial - Captura Rápida) | `ead4b991eddd4f27854c76fec52eb2ec` | **ELEGIDA por el usuario**; texto del estado vacío corregido | Variante activa para Hoy vacío |
| Bitnode - Detalle de Tarea y Traslado (Limpio) | `9be8fe6627d345bea8978d1bd0035a54` | versión actual tras feedback: dos niveles (esencial + plegables), Markdown colapsado con "Mostrar más", temporizador compacto, acciones Editar/Trasladar/Eliminar; modal de traslado sin SQLite | Revisión pendiente |
| Bitnode - Detalle de tarea (base anterior) | `fbd9c0d0bc654683a50f6dfa1a61a1a7` | sustituida por la Limpio | A eliminar |
| Bitnode - Detalle de Tarea (Simplificado intermedio) | `991055ce7a924c68b72b8af19aa36af9` | sustituida por la Limpio | A eliminar |
| Bitnode - Inbox (Minimalista) | `377d9b120cbe4faba747469f683188cc` | **versión activa**: sin badges ni contadores, solo punto + título + fecha + origen; acciones en hover (fila 1), error sutil en fila 2 | Revisión pendiente |
| Bitnode - Inbox (Vista Limpia) | `8b585f444c3647788ace5b29c76e6dd0` | sustituida por la Minimalista | A eliminar |
| Bitnode - Inbox (Simplificado) | `1e32689c7981449f8e12cf6dfe35d59d` | sustituida por Vista Limpia | A eliminar |
| Bitnode - Inbox (base) | `38863c4f6b0047e89065a7b6d169f341` | descartada | A eliminar |
| Bitnode - Inbox (iter texto) | `c31efda452f34afeba06148fd44bcbe0` | descartada | A eliminar |

## Archivos

- `hoy/hoy-iter1.*` — captura y HTML de la primera generación de Hoy (con violaciones: banner cifrado, SQLite, métricas de facturación, avatar, texto corrupto).
- `hoy/hoy-vacia-A.*` / `hoy/hoy-vacia-B.*` — variantes de estado vacío (A centrada, B con barra de captura integrada).
- `tarea/tarea-iter1.*` — detalle de tarea con modal de traslado (con violaciones: V1.4.2, SQLite en modal, textos corruptos).
- `inbox/inbox-iter1.*` / `inbox/inbox-iter2.*` — Inbox completa con los cuatro flujos del brief.

Nota: las URLs firmadas de Stitch no son copia estable; estos archivos locales son la referencia guardada. Regenerar capturas post-corrección desde Stitch al retomar la revisión.

## Correcciones aplicadas (log)

Hoy, edit 1: banner de cifrado, SQLite del sidebar, Resumen Hoy sin facturación (solo temporizadores y tiempo), tarjeta roja de reglas violadas, texto corrupto, avatar → Configuración.
Hoy, edit 2: SQLite Local 2.4 MB (sidebar) y "Motor SQLite local conectado" → "Datos en este equipo".
Tarea, edit 1: badge de versión, línea SQLite/ERROR del modal, ítems del modal reescritos en español coherente, planificación 19:00 + aviso "planificación posterior al límite", sin Restaurar tarea.
Inbox, edit 1: encabezado de lista → "4 capturas pendientes · Ordenadas por fecha de captura"; subtítulo del logo; barra de estado → "Datos en este equipo".

## Feedback de revisión (aplicado 2026-10-05)

- Variante B elegida para Hoy vacío; texto corregido.
- Hoy: filas de tarea simplificadas (detalle en hover, mostrado en la primera tarea); header de una sola fila; versión fuera del sidebar. Ojo: la simplificación partió de una exportación rancía y reintrodujo banner/SQLite/reglas violadas; se limpiaron de nuevo en la versión Simplificada.
- Inbox: captura instantánea como modal "Nueva captura" (⌘N), lista compacta con una línea de vista previa, acciones principales "Crear tarea"/"Añadir a existente", secundarias en "⋯", panel "Añadir a existente" a dos columnas.
- Detalle de tarea: misma simplificación aplicada (estructura en dos niveles, secciones plegables cerradas, acciones unificadas). Regresiones de SQLite/versión limpiadas; HTML final sin "sqlite" ni badges de versión.
- Hoy: sección Bloqueadas con motivo de bloqueo visible por fila ("Motivo: …") y hover en la primera bloqueada con Desbloquear/Registrar tiempo.
- Inbox: minimalista — sin badges, sin contadores, solo punto + título + fecha + origen; acciones en hover; pie con solo "Datos en este equipo".
- Regla de diseño general aprendida: detalle dentro de hover/modal, no en la fila.

## Pendiente al retomar

1. **Borrar las 7 pantallas descartadas** (el MCP oficial no tiene delete_screen): hacerlo manualmente en la UI de Stitch o recreando el proyecto. Descartadas: `d75cd603…` (Hoy base), `e69c55c3…` (Hoy vacío A), `fbd9c0d0…` (tarea base), `991055ce…` (tarea simplificado), `38863c4f…` (inbox base), `c31efda4…` (inbox iter texto), `8b585f44…` (inbox vista limpia). Activas: `43cd2809…`, `ead4b991…`, `9be8fe66…`, `377d9b12…`.
2. Los estados de modal/panel de combinación de Inbox se documentarán en pantallas separadas si el usuario los pide.
3. Continuar grupos: Organización, Conocimiento, Tiempo, Finanzas, Calendario, Consulta, Recuperación, Operación (ver docs/diseno-ui-stitch.md).
