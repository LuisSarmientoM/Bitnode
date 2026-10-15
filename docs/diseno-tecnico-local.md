# Diseño técnico local de Bitnode

Diseño documental del producto completo, basado en la [propuesta técnica](propuesta-tecnica-local.md). Define cómo construirlo, no autoriza comenzar código, instalar dependencias ni aprobar decisiones de producto pendientes. La organización de tres apps y dos paquetes ya está aprobada.

## Cómo revisar

1. Revisar arquitectura y decisiones de esta página.
2. Leer [dominio](diseno-tecnico/dominio.md) y [datos](diseno-tecnico/datos.md) juntos. Las restricciones de SQLite no sustituyen los casos de uso.
3. Revisar [contratos](diseno-tecnico/contratos.md), [frontend](diseno-tecnico/frontend.md) y [operación](diseno-tecnico/operacion.md) según el área.
4. Resolver las [preguntas finales](#preguntas-finales), sin reabrir las 46 rondas. Los experimentos técnicos tienen su propia [matriz de verificación](diseno-tecnico/verificacion.md).

| Documento | Resultado de diseño |
|---|---|
| [Datos](diseno-tecnico/datos.md) | Esquema, restricciones, índices, búsqueda, consultas y revisiones. |
| [Dominio](diseno-tecnico/dominio.md) | Casos de uso, transiciones, transacciones, tiempo y dinero exactos. |
| [Contratos](diseno-tecnico/contratos.md) | REST/CLI, DTO, errores, confirmaciones y paginación. |
| [Frontend](diseno-tecnico/frontend.md) | Angular, navegación, formularios, estado, accesibilidad y flujos por módulo. |
| [Operación](diseno-tecnico/operacion.md) | Configuración, HTTPS, sesiones, concurrencia, migraciones, backups y distribución. |
| [Verificación](diseno-tecnico/verificacion.md) | Casos de aceptación por T1–T20, puertas y evidencia necesaria. |

## Autoridad y estado

| Marca | Significado |
|---|---|
| Confirmado | Regla del producto en [revisión de alcance](revision-alcance-local.md), con detalle en [historial](archivo/alcance-local.md). |
| Aprobado | Decisión explícita del usuario, como organización mínima y paleta. |
| Propuesta técnica | Diseño seleccionado para revisión, reversible antes de implementar. No es una aprobación del usuario. |
| Pendiente de producto | Alternativas que cambian comportamiento visible o retención. No implementar con un default silencioso. |
| Validación experimental | Requiere prueba real; la documentación o una fuente externa no demuestra viabilidad local. |

Todo mecanismo nuevo de este conjunto es propuesta técnica salvo referencia expresa a un acuerdo. Los nombres de tipos, rutas, campos auxiliares, límites y parámetros no quedan aprobados por estar detallados. Los estados de UI no prueban funcionamiento de backend.

## Arquitectura y límites

```text
Navegador Angular
    | HTTPS, mismo origen, cookie de sesión
    v
NestJS: estáticos + /api/v1 + autenticación
    |                                      CLI autónoma
    | comando tipado y actor HTTP           | comando tipado y actor local
    +---------------------+-----------------+
                          v
                 packages/core
              casos de uso y puertos
                          |
                          v
                 packages/db
           Drizzle + SQLite + mantenimiento
```

| Directorio aprobado | Contenido propuesto | No depende de |
|---|---|---|
| `apps/web` | Features Angular, componentes, cliente REST y DTO web. | db, Node, NestJS, driver SQLite. |
| `apps/server` | Controladores, guards, DTO HTTP, TLS, estáticos y worker de mantenimiento. | CLI, componentes web. |
| `apps/cli` | Parser, entrada interactiva, JSON y códigos de salida. | NestJS, servidor en ejecución. |
| `packages/core` | Tipos de dominio, comandos, resultados, errores, políticas y puertos. | Framework web, SQL, Drizzle, sistema de archivos. |
| `packages/db` | Esquema, migraciones SQL, repositorios, unidad de trabajo, FTS y adaptador de bloqueo. | Angular, NestJS. |

Servidor y CLI construyen los mismos servicios. La composición abre un entorno de datos y suministra unidad de trabajo, reloj, zona, generador de IDs y actor de operación. La fábrica de dominio vive en core y recibe puertos; el bootstrap de cada app conecta db. No introducir un tercer paquete de composición por anticipación.

Las operaciones de certificados, archivos y contraseña pertenecen a servicios de aplicación de sus adaptadores con puertos comprobables. No introducir rutas de archivo en el dominio de clientes/tareas. Los servicios de mantenimiento de db no se exponen automáticamente a web.

DTO HTTP y CLI se mantienen en sus adaptadores y se traducen a comandos de core. No importar todo core al navegador: puede arrastrar dependencias Node en el futuro. Comprobar paridad con fixtures de contrato. Extraer `contracts` solo con reutilización demostrada. Fixtures permanecen junto a cada suite, sin `testing` preventivo.

Workspace npm y TypeScript, builds por paquete y referencias explícitas. Fijar versiones estables compatibles al autorizar T1, junto con versión Node y arquitecturas macOS. No añadir Nx, microservicios, Redis, ORM alternativo, bus de eventos o publicación independiente.

## Decisiones de diseño

| ID | Propuesta | Motivo y puerta |
|---|---|---|
| DT-01 | UUID de aplicación; milisegundos UTC; días ISO separados. | CLI/REST comparten identidad; evita convertir días civiles a instantes. T3. |
| DT-02 | Revisión por registro + unidad de trabajo `BEGIN IMMEDIATE`. | Evita sobrescritura web/CLI y TOCTOU de reglas compuestas. T2/T8. |
| DT-03 | FK compuesta diferible para padre/proyecto. | Trasladar rama sin quitar integridad ni duplicar proyecto en notas/tiempo. T8/T11. |
| DT-04 | Decimales canónicos como texto y `BigInt` para dinero. | Evita pérdida en JSON, SQLite y totales. T3/T14. |
| DT-05 | Preview de efectos recalculado, comparado y confirmado en transacción. | El consentimiento no autoriza consecuencias nuevas después de una carrera. T8. |
| DT-06 | Temporizador consumido + entradas únicas por intervalo/tramo. | Dos procesos no materializan dos veces; no redondear por refresco. T10. |
| DT-07 | FTS5 con texto normalizado propio, ñ preservada. | Prefijos y todos los términos sin ampliar a fragmentos internos. T17. |
| DT-08 | Cookie opaca, Argon2id, CSRF y mismo origen HTTPS también local. | Una frontera HTTP; CLI sigue protegida por permisos macOS. T4. |
| DT-09 | `flock` compartido/exclusivo sobre archivo estable separado de SQLite. | Restaura/migra solo sin procesos activos. Binding nativo y crash behavior por probar. T2. |
| DT-10 | Backup SQLite consistente, copia depurada sin sesiones; restore CLI exclusivo. | Backup app/CLI confirmado; restore nunca con conexiones abiertas. T19. |
| DT-11 | Angular sin escrituras optimistas en operaciones compuestas. | No mostrar cierre, traslado o descarte antes de commit. UI por grupo. |
| DT-12 | Logs operativos mínimos separados de Actividad. | No ampliar el timeline del producto ni filtrar Markdown, credenciales o rutas. T4/T18. |

Las respuestas P1–P12 quedan registradas más abajo. P7 sigue pendiente de aclaración. Son acuerdos de comportamiento, no aprobación global de los mecanismos técnicos ni autorización de implementación. La política P2 resuelta afecta a notas; no se extiende por inferencia a otras entidades.

## Exclusiones que se mantienen

Sin sincronización, integraciones, MCP de producto, múltiples usuarios, roles, tokens personales, recurrencia, dependencias entre tareas, adjuntos, notificaciones, RAG, exportaciones de dominio, cotizaciones externas, cifrado propio ni soporte Linux/Windows. Stitch no es dependencia de Bitnode. Este trabajo no usa ni modifica proyectos Stitch.

## Preguntas finales

Se acumularon durante la ausencia del usuario. No se aplican alternativas por silencio. Las decisiones se recogen mediante `ask_user_question` después de explicar el efecto visible.

"Purga" significa borrar definitivamente los datos que la app conservaba temporalmente después de una eliminación. No es archivar. Notas/eventos pueden recuperarse durante 30 días; tareas eliminadas no pueden recuperarse, aunque se conserven esos 30 días. Actividad tiene su propio plazo de un año.

Acuerdos posteriores: usar Colombia, `America/Bogota`, y las decisiones cerradas de esta tabla. Sustituyen las alternativas anteriores que contradigan esos acuerdos. Los escenarios de cambio de zona quedan fuera de esta versión. "Eliminar una nota definitivamente" incluye quitar su actividad, no conservar una fila con texto oculto.

| ID | Acuerdo o punto pendiente | Estado |
|---|---|---|
| P1 | Siempre horario Colombia, America/Bogota. Sin manejo de cambios de zona. | Cerrado. |
| P2 | Al eliminar definitivamente una nota, eliminar también sus entradas de Actividad. No conservar su texto ni un registro de esa nota ya borrada. No afecta a archivo o papelera antes del borrado definitivo. | Cerrado para notas; no generalizar a otras familias. |
| P3 | 30 días completos desde eliminación y un año desde la acción para Actividad, sin cambiar los plazos acordados. El detalle técnico del 29 de febrero se documenta en dominio. | Cerrado. |
| P4 | Permitir URLs repetidas en una tarea. Mantener validación sintáctica, sin unicidad ni deduplicación automática. | Cerrado. |
| P5 | Al restaurar nota/evento, conservar solo vínculos que aún existen. No reconstruir vínculos purgados ni recuperar tareas eliminadas. | Cerrado. |
| P6 | No generar entrada ni minuto artificial si el tramo dura exactamente cero. Todo tramo positivo sigue redondeando hacia arriba. | Cerrado. |
| P7 | Dos tareas pueden tener el mismo estado, prioridad y límite. Falta elegir qué orden usar entre ellas. La pregunta original también incluía todas las horas de Hoy y conteo único por tarea/día; ninguna de esas partes quedó aprobada por silencio. | Pendiente T16, no T1. |
| P8 | Resultados de búsqueda en orden alfabético por nombre/título. No ordenar por relevancia FTS. Normalización y desempate estable son mecanismos técnicos propuestos. | Cerrado. |
| P9 | Inbox tiene página propia para consultar/procesar. Desde cualquier pantalla solo está disponible agregar capturas, no la bandeja completa. | Cerrado. |
| P10 | Iniciar temporizador en tarea Nueva la pasa a En curso en la misma operación. Bloqueada y En revisión conservan estado; cerradas siguen requiriendo reapertura confirmada. | Cerrado. |
| P11 | Restaurar backup conserva la contraseña actual e invalida sesiones. En un equipo sin identidad local se requiere setup, no recuperar contraseña antigua de copia. | Cerrado. |
| P12 | Al restaurar backup, cerrar y guardar sus temporizadores, sin dejarlos activos ni reiniciarlos. El corte exacto propuesto se documenta en operación. | Cerrado. |

Los límites de payload, paginación y normalización detallada siguen como propuestas técnicas. Se revisan junto a su unidad, sin otra ronda general de producto. No implementar soporte DST de otras zonas para esta versión limitada a Colombia.

## Estado y siguiente paso

Diseño documental desarrollado. Sin esquema desplegado, código de aplicación, dependencias instaladas, build ni pruebas funcionales. Las verificaciones documentales y limitaciones se registran en [verificación](diseno-tecnico/verificacion.md).

Antes de T1: autorizar implementación, fijar versiones/arquitecturas y validar base ejecutable. Antes de cada unidad: resolver solo sus pendientes, validar infraestructura aplicable y revisar diseño visual correspondiente. La autorización de diseño no equivale a autorización de ejecución, commits o publicación.
