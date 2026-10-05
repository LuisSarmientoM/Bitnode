# Continuar con propuesta técnica y diseño UI

Se completaron 46 rondas y la revisión final. Ya están redactados la propuesta técnica, el plan por unidades y el brief de Stitch. Son propuestas para revisión; no existe código ni esquema aprobado. El usuario eligió UI oscura y compacta y quiere trabajar con Stitch fuera de esta sesión. No conectar ni instalar Stitch aquí.

## Leer en este orden

1. [Revisión final](revision-alcance-local.md): modelo consolidado, invariantes, límites y detalles propuestos.
2. [Alcance local](alcance-local.md): fuente detallada, árbol y respuestas de rondas 1–46. Acuerdos posteriores sustituyen los anteriores cuando se indica.
3. [Propuesta técnica](propuesta-tecnica-local.md): arquitectura, datos, contratos y pendientes.
4. [Plan de implementación](plan-implementacion-local.md): unidades, dependencias y aceptación.
5. [Brief de Stitch](diseno-ui-stitch.md): prompts y checklist para diseño externo.
6. Este archivo: instrucciones de continuidad.

## Forma de trabajo

- Usar exclusivamente `ask_user_question` para preguntas y confirmaciones.
- No preguntar por cada detalle técnico o visual. El usuario considera excesivas las vueltas sobre calendario/eventos.
- Separar acuerdos, reglas derivadas y propuestas. La aprobación de revisión final no aprueba todos los defaults propuestos.
- No empezar código, instalar dependencias ni diseñar sincronización sin autorización.

## Acuerdos que no deben perderse

- Solo macOS. Angular + NestJS sirviendo frontend + SQLite + Drizzle. REST y CLI autónoma que comparte servicios/datos, sin MCP.
- LAN desde inicio, autenticación también localhost, HTTPS con certificado local guiado. Scripts REST con contraseña/sesión, sin tokens personales.
- Sesiones sin máximo por antigüedad. Cierre del navegador es intención, no garantía técnica; reset de contraseña invalida sesiones.
- Backup manual, restauración confirmada con servidor detenido y sin procesos usando datos. Sin cifrado propio de base/backups.
- Cliente → proyecto → tarea; scope derivado. Proyectos de cliente fijo. Padres/hijas del mismo proyecto, sin ciclos.
- Cualquier traslado de tareas exige destino activo/pausado; hija vinculada se separa y mueve con su rama y confirmación. Detiene/guarda temporizadores y atribuye tiempo anterior al nuevo destino.
- Cliente archivado debe reactivarse antes de crear/reactivar proyecto. Completar/archivar proyecto exige no tener tareas abiertas.
- Tareas irrecuperables, retención30 días. Su tiempo solo consultable y excluido de totales desde eliminación; purga elimina tiempo y desvincula notas/eventos sin borrarlos.
- Notas/eventos con papelera recuperable30 días y envío confirmado. Restaurar nota vuelve activa, incluso si estaba archivada.
- Notas con vínculos explícitos independientes y contextos cruzados permitidos. Vincular tarea no añade proyecto/cliente explícitos; traslado conserva vínculos propios de nota.
- Etiquetas planas inmutables y color fijo al crear. Unicidad/búsqueda ignoran mayúsculas y acentos vocálicos, distinguen ñ/n.
- Tiempo manual mínimo1 minuto. Temporizadores simultáneos, uno por tarea y uno directo por proyecto; límite12h por intervalo, división diaria y redondeo hacia arriba por tramo. Días ya guardados no cambian con zona.
- Finanzas solo COP/USD enteros, income/expense, concepto opcional. Tasa COP/unidad USD positiva hasta2 decimales, opcional y manual. Cambiar moneda limpia tasa. Solo totales en pesos con aviso de conversiones pendientes.
- Hoy con filtros scope/cliente/proyecto. Búsqueda en nombres/títulos/descripciones/observaciones y notas título/contenido, exige todos los términos. Archivados, proyectos completados y tareas cerradas excluidos por defecto con filtro.
- Notas/contacts libres solo Todos en filtros de scope; transversales en ambos scopes por sus vínculos.

## Pendiente, sin nuevas rondas generales

La tabla de propuestas en la revisión final conserva los detalles menores no aprobados: validaciones, Inbox al crear destino/fallos, presentación, restauración de vínculos, precisión de retenciones, tratamiento de intervalos abiertos al cambiar zona e historial de registros purgados. Presentar defaults con sus consecuencias, sin convertirlos silenciosamente en acuerdos.

Revisar la propuesta técnica ya redactada y aprobar únicamente los pendientes necesarios para la siguiente unidad. Diseñar Hoy, detalle de tarea e Inbox con los prompts de Stitch fuera de esta sesión y traer resultados para revisión. No se han generado pantallas ni ejecutado pruebas funcionales. El directorio no es un repositorio Git; no se creó uno ni se instalaron dependencias.

Fuera de versión: sincronización/integraciones, OAuth, webhooks, polling, outbox, conflictos, recurrencia, exportación de dominio, RAG, adjuntos, notificaciones, múltiples usuarios, tokens personales, Linux/Windows y cifrado propio. Cloudflare no interviene en la etapa local.

## Prompt para retomar

> Lee docs/continuar-sesion.md y los documentos enlazados. Ya existen propuesta técnica, plan y brief UI. Revisa propuestas y retoma diseño oscuro compacto con Stitch fuera de esta sesión. Si hay exportaciones, revisa Hoy, tarea e Inbox primero. No conectes Stitch aquí, no conviertas pendientes en acuerdos ni empieces código/instalaciones sin autorización. Usa exclusivamente ask_user_question para decisiones.
