# Continuar Bitnode

**T5 está completado en web/API e integrado en `main` hasta `66efb38`**, por decisión del usuario. Clientes y Contactos incluyen búsqueda, filtros, archivo/reactivación, etiquetas, vínculos y cambio confirmado de ámbito con impacto en contactos. La navegación móvil usa un menú hamburguesa flotante y permanece estable durante las cargas de notas. La CLI de T5 quedó excluida. Evidencia y límites en [cierre de T5](clientes-contactos-t5.md).

**T6, Proyectos, está completado en web/API en la rama `feat/projects-t6`**, sin integrar en `main` ni publicar. Incluye cliente fijo, estados, fechas con aviso, bloqueos en Clientes, REST y página web. La CLI queda excluida. T7, Tareas, avanza en paralelo en `../bitnode-t7` (schema v6). Ver [registro de T6](proyectos-t6.md). Integrar en `main` o publicar requiere una decisión expresa del usuario.

T4 y la organización de Notas se publicaron como `v0.3.0`; el merge de T5 no creó otra versión. Notas conserva búsqueda local, orden, etiquetas/filtros y tablas GFM editables. T4 aporta contraseña compartida, sesiones, reset CLI, CSRF, CA local guiada y HTTPS obligatorio. Ver [README](../README.md) y [organización y T4](organizacion-notas-t4.md).

Última evidencia: 113 pruebas de aplicación aprobadas y typecheck correcto. La suite E2E completa anterior al último ajuste flotante dio 77 aprobadas y 3 omitidas; después hubo una pasada de módulos con 49 aprobadas, 3 omitidas y un fallo de secuencia del test, corregido. La última pasada focalizada dio 5/5 sobre el código final. No se afirma una suite completa final ni una aprobación nativa de T5. El [registro](clientes-contactos-t5.md#verificación-del-cierre) distingue los snapshots.

Siguen pendientes la confianza de la CA y el acceso desde otro dispositivo LAN, PWA instalada real, CLI general, proyectos/tareas y las capacidades globales de archivo, papelera y vínculos de Notas. Las pruebas usaron certificados y datos temporales, sin instalar confianza ni migrar datos reales. No confundir esta entrega con el alcance completo de las 46 rondas.

## Publicación inicial

El usuario autorizó versionar y subir el proyecto a `https://github.com/LuisSarmientoM/Bitnode.git`. Se publicó `v0.1.0` con código, documentación y diseños, excluyendo datos locales y configuración de herramientas. SQLite ya está integrado; `npm run db:init` permite inicializarlo sin servidor y conserva las notas existentes. Ver [historial de versiones](../CHANGELOG.md).

## Documentos activos

| Documento | Función y estado |
|---|---|
| [Revisión del alcance](revision-alcance-local.md) | Producto confirmado y detalles menores aún propuestos. |
| [Propuesta técnica](propuesta-tecnica-local.md) | Organización mínima aprobada; resumen de arquitectura y propuestas. |
| [Diseño técnico detallado](diseno-tecnico-local.md) | Datos, reglas, contratos REST/CLI, Angular, seguridad, operación y matriz de pruebas. P1–P6 y P8–P12 resueltas; P7 pendiente de explicación/decisión. Sin aprobación global del diseño técnico. |
| [Plan de implementación](plan-implementacion-local.md) | T4 y T5 completados; T6 completado en rama propia; T7 en paralelo. No autoriza código ni instalaciones. |
| [Cierre de T6](proyectos-t6.md) | Proyectos web/API en rama propia, evidencia y dependencias con T7/T15. |
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

Aprobados: Inbox editable antes de crear destino y conservación atómica ante fallo; validaciones básicas de texto/email/URL y teléfono como texto; base visual oscura compacta verde con navegación lateral. URLs duplicadas permitidas. Organización mínima aprobada: apps/web, server, cli y packages/core, db. Contracts/testing solo se extraen cuando la reutilización lo justifique. Posteriormente se autorizaron Notas independientes, organización, T4 y T5 web/API. T5 se publicó e integró en `main` a petición expresa del usuario.

Decisiones de diseño registradas: Colombia fija; borrar actividad de nota eliminada definitivamente; plazos completos; URLs repetidas permitidas; restauración solo vínculos existentes; tramo cero sin entrada; búsqueda alfabética; Inbox página propia/global solo agregar; timer Nueva→En curso; restore conserva contraseña actual/invalida sesiones y cierra timers. Son acuerdos de producto. La entrega autorizada de T5 ya está publicada. T6 y los módulos siguientes necesitan su propia autorización; no se amplía el alcance por haber completado T5.

## Siguiente paso

Coordinar la integración de T6 (`feat/projects-t6`) y T7 (`../bitnode-t7`): T7 parte de T6 y añade tareas en schema v6 con los bloqueos de proyecto por tareas. Habrá conflictos menores en la navegación web. Integrar en `main` o publicar requiere una decisión expresa.

La comprobación operativa de contraseña/CA y acceso LAN sigue siendo una tarea separada que requiere decisión expresa. No instalar confianza, cambiar Keychain, abrir firewall, migrar datos reales ni publicar por inferencia. El arranque falla si falta identidad o TLS; no hay alternativa HTTP sin contraseña. T1–T3 y T12 del plan completo no se dan por implementados globalmente.

La revisión nativa del login (`review-ed8a2bdf498ac188`) y de la UI hasta `d2aa461` (`review-5fd8069296a23c68`) está aprobada y reconocida; sus observaciones se listan en [organización y T4](organizacion-notas-t4.md#revisión-nativa-final). Esa aprobación no cubre T5 ni cambios posteriores.

P7 sigue pendiente antes de Hoy/Tareas, pero no bloquea Notas independientes. No reabrir P1–P6 ni P8–P12 ni aprobar P7 por silencio.

La revisión nativa inicial de v0.1.0 quedó bloqueada en preflight por `lens_context_budget_exceeded`, sin crear autoridad ni aprobación. No repetir ese mismo candidato. La continuación requiere candidatos menores y nueva consulta de status; mantener la separación de commits entre documentación/diseños previos y código de la primera versión, cuya publicación ya fue autorizada. La revisión documental de la etapa anterior tampoco se entregó. No conectar Stitch ni cambiar configuración para desbloquearla. Preservar modificaciones ajenas, incluida design/.

La UI de la entrega anterior usa la paleta confirmada y la exportación `design/stitch-v2/conocimiento/notas.png` como referencia. El usuario aceptó sus cambios visuales de v0.2.0, no por ello los ajustes posteriores de esta rama. Se aprobaron 18 pruebas unitarias/de integración, typecheck, build y 13 E2E. RDD detectó un fallo de carga móvil que se corrigió; el validador final agotó unos 15 minutos y no produjo aprobación. No repetir el mismo slot sin cambiar sus condiciones. Hay comandos de verificación en README. La evidencia y limitaciones de esta primera entrega se registran en [base de Notas](base-notas.md).

## Prompt para retomar

> Lee README.md, docs/proyectos-t6.md y docs/plan-implementacion-local.md; consulta git/status, worktrees y la autoridad RDD vigente. T5 web/API está integrado en `main` hasta 66efb38. T6 Proyectos web/API está completado en `feat/projects-t6` (schema v5, 133 pruebas de aplicación, E2E 56 aprobadas/3 omitidas en Proyectos/Clientes/Contactos/Navegación), sin integrar ni revisión nativa. T7 Tareas avanza en `../bitnode-t7` sobre T6 (schema v6). CLI excluida. Siguiente: coordinar integración T6/T7 con autorización expresa. Permanecen pendientes CA/LAN física, PWA real y módulos futuros. No reabras las 46 rondas, no heredes aprobaciones de T4 ni alteres Keychain/firewall/datos reales por inferencia. Usa ask_user_question para decisiones.
