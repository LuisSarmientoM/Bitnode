# Continuar Bitnode

El trabajo actual está en `feat/notes-organization-t4`, con commits locales y sin autorización de push para esta entrega. Notas incorpora búsqueda local, orden y etiquetas/filtros. T4 agrega una contraseña compartida, sesiones, reset CLI, CSRF, CA local guiada, arranque HTTPS obligatorio y login web. La aceptación visual/publicación de v0.2.0 pertenece a la entrega anterior, no autoriza publicar esta rama. Instrucciones en [README](../README.md) y evidencia en [organización y T4](organizacion-notas-t4.md).

La suite actual aprobó 33 pruebas y 23 E2E con build Angular. Los ajustes posteriores simplificaron etiquetas, retiraron logout visible y corrigieron foco en notas existentes, scroll interno y tablas GFM editables sin modificar el Markdown. TLS y navegador usaron certificados temporales, sin instalar confianza ni tocar datos reales. El gesto táctil móvil fue sintético, no una PWA instalada real. La comprobación operativa de confianza de la CA en el Mac y acceso desde otro dispositivo LAN sigue pendiente. Sin carpetas, archivo, papelera, vínculos, otros módulos ni CLI general. Los diseños externos se conservan sin cambios. No confundir esta implementación con el alcance completo de las 46 rondas.

## Publicación inicial

El usuario autorizó versionar y subir el proyecto a `https://github.com/LuisSarmientoM/Bitnode.git`. Se publicó `v0.1.0` con código, documentación y diseños, excluyendo datos locales y configuración de herramientas. SQLite ya está integrado; `npm run db:init` permite inicializarlo sin servidor y conserva las notas existentes. Ver [historial de versiones](../CHANGELOG.md).

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

Aprobados: Inbox editable antes de crear destino y conservación atómica ante fallo; validaciones básicas de texto/email/URL y teléfono como texto; base visual oscura compacta verde con navegación lateral. URLs duplicadas permitidas. Organización mínima aprobada: apps/web, server, cli y packages/core, db. Contracts/testing solo se extraen cuando la reutilización lo justifique. Posteriormente se autorizaron Notas independientes y las unidades de organización y T4, sin otros módulos.

Decisiones de diseño registradas: Colombia fija; borrar actividad de nota eliminada definitivamente; plazos completos; URLs repetidas permitidas; restauración solo vínculos existentes; tramo cero sin entrada; búsqueda alfabética; Inbox página propia/global solo agregar; timer Nueva→En curso; restore conserva contraseña actual/invalida sesiones y cierra timers. Son acuerdos de producto. La autorización actual cubre Notas, organización y T4 en esta rama, sin publicación.

## Siguiente paso

Cerrar la revisión nativa del login y los ajustes posteriores de UI, sin atribuirles receipts de commits anteriores. El host devolvió `package-local-binary-missing`; la reparación autorizada de la herramienta terminó correctamente, pero falta `/reload` de Pi por el usuario y una nueva inspección. No repetir instalaciones ni usar el CLI global para eludir el host. Después, con decisión expresa del usuario, configurar contraseña/CA reales y comprobar confianza y acceso desde otro dispositivo LAN. No instalar confianza, cambiar Keychain, abrir firewall, migrar notas reales ni publicar por inferencia. El arranque ahora falla si falta identidad o TLS; ya no hay alternativa HTTP sin contraseña. T1–T4 y T12 del plan completo no se dan por implementadas globalmente.

P7 sigue pendiente antes de Hoy/Tareas, pero no bloquea Notas independientes. No reabrir P1–P6 ni P8–P12 ni aprobar P7 por silencio.

La revisión nativa inicial de v0.1.0 quedó bloqueada en preflight por `lens_context_budget_exceeded`, sin crear autoridad ni aprobación. No repetir ese mismo candidato. La continuación requiere candidatos menores y nueva consulta de status; mantener la separación de commits entre documentación/diseños previos y código de la primera versión, cuya publicación ya fue autorizada. La revisión documental de la etapa anterior tampoco se entregó. No conectar Stitch ni cambiar configuración para desbloquearla. Preservar modificaciones ajenas, incluida design/.

La UI de la entrega anterior usa la paleta confirmada y la exportación `design/stitch-v2/conocimiento/notas.png` como referencia. El usuario aceptó sus cambios visuales de v0.2.0, no por ello los ajustes posteriores de esta rama. Se aprobaron 18 pruebas unitarias/de integración, typecheck, build y 13 E2E. RDD detectó un fallo de carga móvil que se corrigió; el validador final agotó unos 15 minutos y no produjo aprobación. No repetir el mismo slot sin cambiar sus condiciones. Hay comandos de verificación en README. La evidencia y limitaciones de esta primera entrega se registran en [base de Notas](base-notas.md).

## Prompt para retomar

> Lee README.md y docs/organizacion-notas-t4.md y consulta git/status y la autoridad RDD vigente. La rama feat/notes-organization-t4 contiene organización de Notas y acceso HTTPS con contraseña. 33 pruebas y 23 E2E/build Angular actuales aprobados; comprobar la revisión final del login y ajustes de etiquetas/foco/scroll/tablas. RDD está bloqueado por package-local-binary-missing tras reparación: esperar /reload del usuario antes de inspeccionar, sin reinstalar ni eludir el host. Falta la validación operativa de confianza CA, LAN física y PWA instalada real. Sin push ni cambios en Keychain/firewall o datos reales sin autorización concreta. Conserva diseños y alcance; no reabras las 46 rondas ni añadas módulos. Usa ask_user_question para decisiones.
