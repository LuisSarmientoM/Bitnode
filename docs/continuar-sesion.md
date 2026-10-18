# Continuar Bitnode

**T5 está completado en web/API e integrado en `main` hasta `66efb38`**, por decisión del usuario. Clientes y Contactos incluyen búsqueda, filtros, archivo/reactivación, etiquetas, vínculos y cambio confirmado de ámbito con impacto en contactos. La navegación móvil usa un menú hamburguesa flotante y permanece estable durante las cargas de notas. La CLI de T5 quedó excluida. Evidencia y límites en [cierre de T5](clientes-contactos-t5.md).

**T6, Proyectos, y T7, Tareas básicas, están completados en web/API y publicados en `main` hasta `4f8c1ae`**, por decisión del usuario y sin versión nueva. T6 aporta cliente fijo, estados, fechas con aviso, bloqueos en Clientes, REST y página web (schema v5). T7 aporta crear/editar/listar tareas con proyecto activo o pausado obligatorio, prioridad, referencias, planificación y límite separados con aviso no bloqueante, bloqueo de cerrar o borrar proyectos con tareas y página web (schema v6). La CLI quedó excluida en ambos. Ver [registro de T6](proyectos-t6.md) y [registro de T7](tareas-t7.md).

**T8, Jerarquía y transiciones, está completada en web/API en la rama local `feat/tasks-t8`**, sin push ni merge. Incluye subtareas multinivel, cambiar y quitar padre dentro del mismo proyecto, estados con finalización, cancelación en cascada y reapertura con efectos confirmados (ancestros y proyecto), y su UI en la pantalla de Tareas. A petición del usuario, la lista muestra las subtareas como árbol expandible, colorea cada estado (Nueva azul, En curso amarillo, Bloqueada rojo, En revisión violeta, Completada verde, Cancelada gris) y permite cambiar el estado desde la propia insignia. Usa schema v7, que el binario anterior no abre. Cada uno de sus commits tiene revisión nativa aprobada y reconocida. Ver [registro de T8](tareas-t8.md).

T4 y la organización de Notas se publicaron como `v0.3.0`; el merge de T5 no creó otra versión. Notas conserva búsqueda local, orden, etiquetas/filtros y tablas GFM editables. T4 aporta contraseña compartida, sesiones, reset CLI, CSRF, CA local guiada y HTTPS obligatorio. Ver [README](../README.md) y [organización y T4](organizacion-notas-t4.md).

Última evidencia sobre `dfb2d17`: 153 pruebas de aplicación aprobadas y typecheck correcto. La suite E2E completa pasó con 93 aprobadas y 3 omitidas tras ajustar una expectativa de navegación de Contactos que no incluía Tareas. Esta entrega incluye el ajuste E2E y el registro de revisión, con publicación en `main` autorizada por el usuario. La revisión nativa de T7 (`review-9b9c9801b9481ea8`, de `132f18f` a `4f8c1ae`) está aprobada y reconocida. T6 también tiene sus tres unidades de código aprobadas y reconocidas: `review-7395f0af40cf4e1b`, `review-05b1c6c7439829ca` y `review-cba189302831df7d`. Son candidatos históricos separados, no una aprobación global del `main` actual ni del ajuste E2E. Rangos y observaciones no bloqueantes en [revisión de T6](proyectos-t6.md#revisión-posterior-a-la-publicación). T5 no tiene aprobación nativa; su [registro](clientes-contactos-t5.md#verificación-del-cierre) distingue los snapshots.

Siguen pendientes la confianza de la CA y el acceso desde otro dispositivo LAN, PWA instalada real, CLI general, tiempo y temporizadores de tareas (T9+), mover tareas entre proyectos (T11) y las capacidades globales de archivo, papelera y vínculos de Notas. Las pruebas usaron certificados y datos temporales, sin instalar confianza. La base real local se migró a schema v6 al probar T7, con copia previa en `.data/bitnode.sqlite.backup-v5-before-t7`. No confundir esta entrega con el alcance completo de las 46 rondas.

## Publicación inicial

El usuario autorizó versionar y subir el proyecto a `https://github.com/LuisSarmientoM/Bitnode.git`. Se publicó `v0.1.0` con código, documentación y diseños, excluyendo datos locales y configuración de herramientas. SQLite ya está integrado; `npm run db:init` permite inicializarlo sin servidor y conserva las notas existentes. Ver [historial de versiones](../CHANGELOG.md).

## Documentos activos

| Documento | Función y estado |
|---|---|
| [Revisión del alcance](revision-alcance-local.md) | Producto confirmado y detalles menores aún propuestos. |
| [Propuesta técnica](propuesta-tecnica-local.md) | Organización mínima aprobada; resumen de arquitectura y propuestas. |
| [Diseño técnico detallado](diseno-tecnico-local.md) | Datos, reglas, contratos REST/CLI, Angular, seguridad, operación y matriz de pruebas. P1–P6 y P8–P12 resueltas; P7 pendiente de explicación/decisión. Sin aprobación global del diseño técnico. |
| [Plan de implementación](plan-implementacion-local.md) | T4 a T8 completados en sus alcances registrados; T9 es la siguiente unidad. No autoriza código ni instalaciones. |
| [Registro de T8](tareas-t8.md) | Jerarquía y transiciones web/API en rama local, evidencia, revisiones y límites conocidos. |
| [Registro de T7](tareas-t7.md) | Tareas básicas web/API publicadas, evidencia, diferencias con el diseño y límites. |
| [Cierre de T6](proyectos-t6.md) | Proyectos web/API publicados, evidencia y dependencias con T15. |
| [Cierre de T5](clientes-contactos-t5.md) | Clientes y Contactos web/API integrados, evidencia por snapshot y limitaciones conservadas. |
| [Diseño con Stitch](diseno-ui-stitch.md) | Base aprobada de escritorio oscuro compacto, verde y sidebar; composición final y tokens pendientes. |

El [historial de las 46 rondas](archivo/alcance-local.md) se conserva archivado. Consultarlo para resolver dudas del alcance, no releerlo como paso obligatorio en cada sesión. Los acuerdos posteriores sustituyen los anteriores cuando así se indica.

## Forma de trabajo

- Preguntas y confirmaciones exclusivamente mediante `ask_user_question`.
- No reabrir rondas generales ni preguntar por cada detalle técnico/visual. Resolver pendientes por unidad.
- Separar confirmado, propuesto, en revisión y aprobado. No convertir un prompt o una captura en aprobación.
- Diseñar una pantalla a la vez; ajustar prompts forma parte del diseño, no una etapa separada de pruebas.
- Stitch se utiliza fuera de esta sesión; no conectarlo ni instalarlo aquí sin una nueva decisión.
- No empezar código, instalar dependencias ni añadir alcance sin autorización. Ya existe un repositorio Git documental. Se conserva `.codegraph/` por decisión del usuario, aunque su creación por el subagente no estaba autorizada.

## Decisiones recientes

Aprobados: Inbox editable antes de crear destino y conservación atómica ante fallo; validaciones básicas de texto/email/URL y teléfono como texto; base visual oscura compacta verde con navegación lateral. URLs duplicadas permitidas. Organización mínima aprobada: apps/web, server, cli y packages/core, db. Contracts/testing solo se extraen cuando la reutilización lo justifique. Posteriormente se autorizaron Notas independientes, organización, T4 y T5 web/API. T5, T6 y T7 se publicaron e integraron en `main` a petición expresa del usuario.

Decisiones de diseño registradas: Colombia fija; borrar actividad de nota eliminada definitivamente; plazos completos; URLs repetidas permitidas; restauración solo vínculos existentes; tramo cero sin entrada; búsqueda alfabética; Inbox página propia/global solo agregar; timer Nueva→En curso; restore conserva contraseña actual/invalida sesiones y cierra timers. Son acuerdos de producto. Las entregas autorizadas de T5 a T7 ya están publicadas. T8 y los módulos siguientes necesitan su propia autorización; no se amplía el alcance por haber completado T7.

## Siguiente paso

Entrega de T8 decidida por el usuario: un solo PR con los commits de `feat/tasks-t8`, pero todavía no se crea porque el trabajo no ha terminado. No hacer push ni abrir el PR sin nueva indicación expresa. Antes de usar esta versión con la base real, detener el servidor y copiar `.data/bitnode.sqlite` con sus archivos WAL/SHM: abrirla la migra a v7 sin vuelta atrás. Después, T9 Tiempo manual, con alcance y diseño acordados antes de escribir código.

Límites conocidos de T8 como trabajo posterior: la aceptación de efectos admite como máximo 1000 targets, y hay observaciones no bloqueantes de las revisiones registradas en su documento.

Observaciones no bloqueantes de la revisión nativa de T7, para trabajo posterior: desfase de Bogotá duplicado en `apps/web/src/tasks-page.ts:38`; estados abiertos de tarea repetidos en `packages/db/src/projects.ts:150-151` en lugar de `OPEN_TASK_STATES`; selector de proyectos de Tareas limitado a 200 sin paginar; paginación de la lista de tareas sin prueba. La suite E2E completa sobre T6+T7 ya pasó con el ajuste de navegación incluido en esta entrega. Las observaciones adicionales de T6 están en su registro y quedan como trabajo separado.

La comprobación operativa de contraseña/CA y acceso LAN sigue siendo una tarea separada que requiere decisión expresa. No instalar confianza, cambiar Keychain, abrir firewall, migrar datos reales ni publicar por inferencia. El arranque falla si falta identidad o TLS; no hay alternativa HTTP sin contraseña. T1–T3 y T12 del plan completo no se dan por implementados globalmente.

La revisión nativa del login (`review-ed8a2bdf498ac188`) y de la UI hasta `d2aa461` (`review-5fd8069296a23c68`) está aprobada y reconocida; sus observaciones se listan en [organización y T4](organizacion-notas-t4.md#revisión-nativa-final). Esa aprobación no cubre T5 ni cambios posteriores.

P7 sigue pendiente antes de Hoy/Tareas, pero no bloquea Notas independientes. No reabrir P1–P6 ni P8–P12 ni aprobar P7 por silencio.

La revisión nativa inicial de v0.1.0 quedó bloqueada en preflight por `lens_context_budget_exceeded`, sin crear autoridad ni aprobación. No repetir ese mismo candidato. La continuación requiere candidatos menores y nueva consulta de status; mantener la separación de commits entre documentación/diseños previos y código de la primera versión, cuya publicación ya fue autorizada. La revisión documental de la etapa anterior tampoco se entregó. No conectar Stitch ni cambiar configuración para desbloquearla. Preservar modificaciones ajenas, incluida design/.

La UI de la entrega anterior usa la paleta confirmada y la exportación `design/stitch-v2/conocimiento/notas.png` como referencia. El usuario aceptó sus cambios visuales de v0.2.0, no por ello los ajustes posteriores de esta rama. Se aprobaron 18 pruebas unitarias/de integración, typecheck, build y 13 E2E. RDD detectó un fallo de carga móvil que se corrigió; el validador final agotó unos 15 minutos y no produjo aprobación. No repetir el mismo slot sin cambiar sus condiciones. Hay comandos de verificación en README. La evidencia y limitaciones de esta primera entrega se registran en [base de Notas](base-notas.md).

## Prompt para retomar

> Lee README.md, docs/proyectos-t6.md, docs/tareas-t7.md y docs/plan-implementacion-local.md; consulta git/status y la autoridad RDD vigente. T5, T6 y T7 web/API están publicados en `main`. El cierre de revisión T6 sucede a dfb2d17. Schema v6, 153 pruebas de aplicación y typecheck correctos. E2E completa: 93 aprobadas y 3 omitidas sobre dfb2d17 más el ajuste en tests/e2e/contacts.spec.ts que añade Tareas a la navegación esperada, incluido junto al registro de revisión en esta entrega autorizada para main. T7 tiene revisión nativa aprobada; T6 tiene tres revisiones históricas de código aprobadas y reconocidas, con rangos y avisos en su registro, no aprobación global de main. CLI excluida. El worktree bitnode-t6-review queda limpio en 7c5bf08; odd/tasks/projects-t6.md sigue sin seguimiento y no se modificó. T8 está completa en la rama local feat/tasks-t8 (schema v7, 185 pruebas, 110 E2E, diez revisiones nativas aprobadas; incluye árbol expandible, colores por estado y acción rápida), sin publicar: lee docs/tareas-t8.md y odd/tasks/tasks-t8.md. Se entregará en un solo PR con varios commits cuando el usuario lo indique; no hacer push ni PR antes. Siguiente: lo que el usuario pida para cerrar el trabajo de esta rama; después, acordar T9 Tiempo manual antes de implementar. Permanecen pendientes CA/LAN física, PWA real y módulos futuros. No reabras las 46 rondas ni alteres Keychain/firewall/datos reales por inferencia. Usa ask_user_question para decisiones.
