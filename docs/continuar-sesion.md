# Continuar Bitnode

Ya existe una primera base ejecutable de Notas independientes. El usuario autorizó expresamente código y dependencias para Angular/NestJS/SQLite, crear/listar/abrir/editar Markdown y revisar su pantalla. Ejecutar `npm run dev` y abrir http://127.0.0.1:3000. Instrucciones y límites en [README](../README.md).

El alcance completo de las 46 rondas sigue documentado, pero esta entrega no lo implementa ni aprueba globalmente. Sin vínculos, etiquetas, búsqueda global, archivo, papelera, CLI, autenticación ni acceso LAN. Los diseños externos se conservaron sin modificaciones.

## Publicación inicial

El usuario autorizó versionar y subir el proyecto a `https://github.com/LuisSarmientoM/Bitnode.git`. Se prepara `v0.1.0` con código, documentación y diseños, excluyendo datos locales y configuración de herramientas. SQLite ya está integrado; `npm run db:init` permite inicializarlo sin servidor y conserva las notas existentes. Ver [historial de versiones](../CHANGELOG.md).

## Documentos activos

| Documento | Función y estado |
|---|---|
| [Revisión del alcance](revision-alcance-local.md) | Producto confirmado y detalles menores aún propuestos. |
| [Propuesta técnica](propuesta-tecnica-local.md) | Organización mínima aprobada; resumen de arquitectura y propuestas. |
| [Diseño técnico detallado](diseno-tecnico-local.md) | Datos, reglas, contratos REST/CLI, Angular, seguridad, operación y matriz de pruebas. P1–P6 y P8–P12 resueltas; P7 pendiente de explicación/decisión. Sin aprobación global del diseño técnico. |
| [Plan de implementación](plan-implementacion-local.md) | Unidades y aceptación propuestas; no autoriza código ni instalaciones. |
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

Aprobados: Inbox editable antes de crear destino y conservación atómica ante fallo; validaciones básicas de texto/email/URL y teléfono como texto; base visual oscura compacta verde con navegación lateral. URLs duplicadas permitidas. Organización mínima aprobada: apps/web, server, cli y packages/core, db. Contracts/testing solo se extraen cuando la reutilización lo justifique. Posteriormente se autorizó implementar solo la primera entrega funcional de Notas descrita al inicio.

Decisiones de diseño registradas: Colombia fija; borrar actividad de nota eliminada definitivamente; plazos completos; URLs repetidas permitidas; restauración solo vínculos existentes; tramo cero sin entrada; búsqueda alfabética; Inbox página propia/global solo agregar; timer Nueva→En curso; restore conserva contraseña actual/invalida sesiones y cierra timers. Son acuerdos de producto. La autorización de código se limita a la primera entrega de Notas.

## Siguiente paso

Probar la pantalla de Notas con el usuario y recoger ajustes visuales. Antes de ampliar esta entrega, acordar la siguiente capacidad. T1–T4 y T12 del plan completo siguen parciales o pendientes; no marcar esas unidades como terminadas por tener este recorrido mínimo.

P7 sigue pendiente antes de Hoy/Tareas, pero no bloquea Notas independientes. No reabrir P1–P6 ni P8–P12 ni aprobar P7 por silencio.

La revisión nativa de esta base de Notas quedó bloqueada en preflight por `lens_context_budget_exceeded`, sin crear autoridad ni aprobación. No repetir ese mismo candidato. La continuación requiere candidatos menores y nueva consulta de status; mantener la separación de commits entre documentación/diseños previos y código de la primera versión, cuya publicación ya fue autorizada. La revisión documental de la etapa anterior tampoco se entregó. No conectar Stitch ni cambiar configuración para desbloquearla. Preservar modificaciones ajenas, incluida design/.

La UI implementada usa la paleta confirmada y la exportación `design/stitch-v2/conocimiento/notas.png` como referencia. Su aceptación visual final por el usuario sigue pendiente. Hay pruebas funcionales de core, SQLite, API y Chromium, con los comandos en README. La evidencia y limitaciones de esta primera entrega se registran en [base de Notas](base-notas.md).

## Prompt para retomar

> Lee README.md y docs/base-notas.md. Ya se autorizó y construyó una primera entrega de Notas independientes. Revisa la pantalla con el usuario antes de ampliar alcance. Conserva los cambios locales documentales y de design/ previos a esta implementación. No reabras las 46 rondas ni añadas otros módulos sin acuerdo. Usa exclusivamente ask_user_question para decisiones.
