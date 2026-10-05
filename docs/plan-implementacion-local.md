# Plan de implementación local

Construir por unidades verificables, no implementar todo el alcance en un único cambio. Primero se revisa la [propuesta técnica](propuesta-tecnica-local.md) y se diseña la UI con el [brief de Stitch](diseno-ui-stitch.md), fuera de esta sesión. Este plan no autoriza por sí mismo instalar dependencias ni escribir código.

## Orden y condiciones de avance

1. Revisar arquitectura y cerrar solo los pendientes necesarios para la siguiente unidad.
2. Diseñar en Stitch Hoy, detalle de tarea e Inbox con tema oscuro compacto. Traer exportaciones y revisar flujos antes del frontend de dominio.
3. Autorizar inicio de implementación. Crear base técnica y completar unidades sucesivas con tests y evidencia.

El trabajo de diseño puede avanzar mientras se valida infraestructura del backend, una vez autorizada esta. Ninguna pantalla de producto se da por terminada sin diseño revisado y prueba en navegador. No hay fechas estimadas ni avance funcional reclamado en esta etapa.

## Unidades propuestas

Cada fila delimita una capacidad; si aún tiene demasiado riesgo o revisión, se divide antes de escribir código. Tests, contratos y documentación mínima acompañan cada unidad.

| Unidad | Entrega | Aceptación y dependencia |
|---|---|---|
| D1. Diseño inicial | Hoy, tarea e Inbox en Stitch; tokens iniciales y estados alternativos. | Sin funciones fuera del alcance; revisión del usuario fuera de esta sesión. |
| D2. Diseño restante | Clientes/proyectos/contactos, notas, tiempo, finanzas, calendario, actividad, búsqueda, papelera y configuración. | Mismo sistema visual; revisar por grupos, no una aprobación ciega de todas las pantallas. Depende de D1. |
| T1. Base ejecutable | Workspace, Angular vacío servido por NestJS, CLI mínima, configuración y scripts. | Arranque macOS, build, CLI sin servidor, recursos locales. Requiere autorización de implementación. |
| T2. Base persistente | Driver, migración inicial, FKs/WAL, fábrica compartida, bloqueos de mantenimiento. | FTS5 disponible, migración exclusiva, dos procesos acceden sin corrupción, busy acotado. Depende T1. |
| T3. Tipos y reglas comunes | Reloj/zona, normalización, dinero exacto, errores y revisiones. | Ñ/n distintos, acentos equivalentes, límites monetarios sin flotantes, fechas inválidas y DST cubiertos. Depende T2. |
| T4. Acceso local seguro | Bootstrap CLI, contraseña, sesiones, reset, CSRF y HTTPS guiado. | localhost/LAN autenticados, intento sin sesión rechazado, reset invalida, ningún fallback HTTP LAN. Depende T2. |
| T5. Clientes y contactos | Campos, scopes, archivo, vínculos y etiquetas básicas. | Scope explícito, unicidad de clientes, nombres de contactos duplicados permitidos, sin borrado individual de contactos. Depende T3. |
| T6. Proyectos | Cliente fijo, estados, fechas, unicidad por cliente. | Cliente archivado bloquea creación/reactivación; fechas invertidas avisan, no bloquean. Depende T5. |
| T7. Tareas básicas | Crear/editar/listar, prioridad, referencias y fechas separadas. | Toda tarea nueva, proyecto obligatorio; destino cerrado rechazado; planificación posterior al límite avisa. Depende T6. |
| T8. Jerarquía y transiciones | Subtareas, ciclos, cierre/cancelación y reapertura confirmada. | Misma rama/proyecto, no ciclos; completar con hijas abiertas falla; reabrir ancestros y proyecto exige consentimiento. Depende T7. |
| T9. Tiempo manual | Entradas, edición, traslados, totales derivados. | Mínimo 1 min; destinos cerrados permitidos, tareas eliminadas no; fecha guardada inmutable ante cambio de zona. Depende T8. |
| T10. Temporizadores | Persistencia, exclusión por destino, reconciliación y cierre integrado. | Dos procesos no inician duplicado; reinicio y tope12h, medianoche/DST, cierre atómico y solapamientos. Depende T9. |
| T11. Traslado y eliminación de tareas | Mover rama, separación de hija, retención irrecuperable y purga. | Detener/guardar tiempo; atribución al destino; tiempo eliminado fuera de totales y solo lectura; purga desvincula sin borrar notas/eventos. Depende T10; última aceptación con T12/T15. |
| T12. Notas y etiquetas | Markdown, título generado persistente, vínculos independientes, archivo y papelera. | Contextos cruzados admitidos, scopes derivados por cualquier vínculo, color fijo incluso ausencia, restaurar nota activa. Depende T8 y T5. |
| T13. Inbox | Capturar/editar/descartar y procesar a tarea/nota. | Editar combinación; captura se elimina solo al guardar destino; prueba de fallo conserva captura si se aprueba esa propuesta. Depende T7/T12. |
| T14. Finanzas | COP/USD, tasas, edición/baja y totales. | Enteros positivos, redondeo por movimiento, pendiente visible, moneda limpia tasa, edición tasa confirmada. Depende T3/T6. |
| T15. Eventos | Rango con hora o días inclusivos, contexto único y papelera. | Cero duración permitido; fin anterior falla; traslado de tarea actualiza contexto derivado. Depende T8. |
| T16. Hoy y calendario | Consultas y UI con planificación/límite separados. | Selección Hoy persistente, filtros scope/cliente/proyecto; bloques separados; arrastrar solo planificación, cerradas como conteos. Depende T7/T8/T15 y diseños aprobados. |
| T17. Búsqueda | FTS5, prefijos, filtros de contexto y etiquetas. | Todos los términos en campos distintos; ñ preservada; exclusiones por defecto; notas libres solo Todos. Depende T5–T8/T12/T15. |
| T18. Actividad | Lista y detalle antes/después, agrupación y retención. | Solo acciones aprobadas; política tras purga resuelta; eventos de actividad transaccionales desde unidades previas. |
| T19. Backup/restauración y mantenimiento | Backup consistente, validación, recuperación y purgas. | WAL activo respaldado; restore falla con cualquier proceso en datos; prueba de fallo/rollback; purgas idempotentes. Depende T2 y reglas de retención aprobadas. |
| T20. Distribución y recorrido completo | Instalación macOS documentada, assets offline y recorrido de usuario. | Build limpio, actualización/migración, CLI sin servidor, LAN desde otro dispositivo, restauración real y funcionamiento sin Internet. Depende unidades anteriores. |

Cada unidad de dominio comprende core, repositorios, REST y CLI; UI se añade cuando el diseño correspondiente esté revisado. Si se separa su UI como subunidad, registrar explícitamente que la capacidad web sigue incompleta. La actividad aplicable se emite desde su unidad de origen; T18 construye la consulta/presentación, no reconstruye historia retroactivamente.

## Método de ejecución

- Antes de cada unidad: contrato concreto, pendientes que la bloquean y alcance de revisión. No reabrir las 46 rondas.
- Tests deterministas primero cuando corresponda: registrar fallo real, implementar, comprobar casos alternativos y refactorizar. No inventar evidencia RED/GREEN.
- Tests de core con reloj/zona controlables; integración con SQLite real, no solo repositorios simulados.
- Contratos equivalentes REST/CLI, con servidor apagado para demostrar autonomía CLI.
- Pruebas multiproceso para exclusión, revisiones, migraciones y mantenimiento.
- Para UI: teclado, foco, contraste, formularios, estados error/vacío y navegador en escritorio y viewport estrecho. Mockups no sustituyen estas pruebas.
- Cambios de seguridad, restauración, concurrencia y dinero reciben verificación independiente proporcional al riesgo.
- Dejar cada entrega retomable desde sus archivos, tests y estado registrado. No prometer cobertura o funcionalidad sin ejecutar comprobaciones.

## Pendientes y puertas de aprobación

| Antes de | Resolver |
|---|---|
| T1 | Aprobar estructura/versiones concretas e inicio de código/instalaciones. |
| T3/T7 | Representación de fechas con hora, URLs, límites y formato de contratos. |
| T10 | Zona en intervalo abierto, tramo cero y procedencia de minutos corregidos. |
| T11/T12/T15/T18/T19 | Fronteras de retención, restauración de vínculos y contenido en actividad tras purga. |
| T13 | Edición al crear desde Inbox y tratamiento atómico de fallos. |
| T16/T17 | Defaults de desempate, ranking y conteos, sin ampliar funciones. |
| UI de cada grupo | Exportaciones de Stitch revisadas y aceptación de estados/flujos. |

## Estado real

- Completado: alcance consolidado y documentos de propuesta, plan y brief.
- Pendiente: revisión técnica, diseño real en Stitch, aprobación de propuestas menores e implementación.
- No ejecutado: tests funcionales, build, generación de pantallas, instalación o conexión de Stitch.
