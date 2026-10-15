# Frontend Angular y flujos de interacción

[Índice del diseño](../diseno-tecnico-local.md). Arquitectura funcional propuesta, no composición visual aprobada. La [paleta y el brief](../diseno-ui-stitch.md) mantienen su autoridad sobre dirección visual; este trabajo no genera pantallas en Stitch ni copia código React.

## Estructura de aplicación

Proponer Angular standalone, rutas lazy por feature, formularios reactivos y Signals para estado local. Usar HttpClient/RxJS en transporte y cancelación; no introducir una store global adicional hasta demostrar necesidad. Fijar versiones y APIs concretas en T1, no asumir funciones todavía no validadas.

```text
apps/web/src/app/
  shell/                  navegación, toolbar, overlays, rutas
  platform/               http, sesión, errores, reloj host, configuración visible
  shared/ui/              controles presentacionales, formularios y confirmaciones
  features/
    today/ organization/ tasks/ inbox/ notes/ tags/
    time/ finance/ calendar/ search/ activity/ trash/ settings/
```

Estructura interna propuesta, no nuevos paquetes workspace. Cada feature contiene páginas, componentes, facade de estado y cliente API tipado. No importar facades de otra feature para modificar su estado; usar navegación y un invalidation service mínimo que notifique recursos afectados después de un commit confirmado.

| Estado | Dueño | Persistencia |
|---|---|---|
| Sesión autenticada/CSRF | Platform en memoria | Cookie HttpOnly del servidor; nunca token en localStorage. |
| Filtros y cursor | Feature y URL cuando no sensibles | Query params permiten volver a vista; cambio de filtro resetea cursor. |
| Entidades leídas/revisiones | Feature facade | Cache en memoria, invalidada tras mutación o refresh. No base cliente. |
| Borrador de formulario | Componente/form service acotado | Memoria; avisar al salir. No guardado offline automático ni sincronización. |
| Confirmación pendiente | Flujo de comando | Input original + preview, en memoria. Nuevo estado exige nuevo consentimiento. |
| Timer visible | Estado leído + reloj host estimado | Contador de presentación, no autoridad de minutos guardados. |

No implementar service worker de escrituras, outbox, IndexedDB de dominio o replay offline. "Sin Internet" significa servidor y datos locales disponibles sin servicios externos; navegador LAN sin conexión al anfitrión no puede guardar.

## Navegación y acceso

Login fuera del shell. Guard navega a login al recibir 401 y conserva destino de retorno interno validado, sin open redirect. La existencia de guard web no protege API: servidor aplica sesión a cada petición.

Rutas propuestas Hoy, Clientes, Proyectos, Contactos, Tareas/detalle, Notas, Tiempo, Finanzas, Calendario, Actividad, Búsqueda, Papelera y Configuración. Etiquetas pueden vivir en controles/lista de conocimiento sin añadir módulo grande. Sidebar de escritorio es base aprobada, orden final en diseño visual.

P9 confirmado: Inbox tiene página propia para listar, editar, procesar y descartar capturas. El acceso global desde cualquier pantalla sirve únicamente para agregar contenido mediante formulario de captura, no para desplegar toda la bandeja ni procesarla. No exigir proyecto/scope al capturar; guardar y volver al contexto desde el que se abrió.

El frontend no administra certificados del sistema operativo ni restablece contraseña. Configuración explica pasos CLI y muestra estado no sensible. Backup manual sí puede crearse desde UI según alcance, sin selector arbitrario de filesystem remoto.

## Formularios y validación

Controles comunes: texto, Markdown con preview saneado, fecha día, día/hora en Colombia, selector de destino, multietiqueta y campos monetarios texto. Cliente scope sin valor preseleccionado; finanzas COP y hoy por default confirmado. No inferir work/personal a partir de último filtro activo al crear cliente.

Recortar espacios exteriores de campos de texto según validación aprobada. Para Markdown conservar saltos, indentación y espacios interiores significativos; el tratamiento exacto de recorte del documento debe cubrir fences y hard-breaks sin normalización destructiva. UI y core validan con la misma política documentada, no convertir cuerpo en una sola línea.

Submit deshabilitado mientras esa operación está enviándose; otras entidades pueden operarse simultáneamente. Mensajes de campo se asocian a sus controles; mostrar resumen enfocables al fallo. Avisos de fechas invertidas no impiden guardar. Las reglas autoritativas y unicidad se comprueban en servidor, no solo en debounce web.

Revisión de lectura se conserva hasta submit. CONFLICT no aplica automáticamente un PATCH con nueva revisión. Mostrar diferencias del registro fresco frente al borrador, conservar texto escrito y ofrecer recargar o revisar/reaplicar por nueva operación explícita. No resolver merge de Markdown por concatenación automática.

## Flujos por capacidad

| Módulo | Interacción y estados imprescindibles |
|---|---|
| Hoy | Tres grupos, filtros Todos/Trabajo/Personal +cliente/proyecto, motivos de inclusión, contexto/ruta de ancestros, selección manual y contador timers simultáneos. Quitar manual no oculta fila que cumple regla automática. |
| Clientes | Nombre/corto/scope/observaciones, búsqueda/lista, etiquetas y archivo. Cambio scope preview con efectos derivados; archivo bloqueado por activos/pausados. Delete solo sin asociaciones. |
| Contactos | Nombre/email/teléfono/observaciones y varios clientes o ninguno. Scope derivado de clientes; libres solo Todos. Archivo, sin delete ni campos cargo/múltiples emails. |
| Proyectos | Cliente fijo, estados/Markdown/fechas día, tareas del proyecto y timer directo. Selector destino cerrado oculto; mostrar paso explícito de reactivación si acción lo intenta. |
| Tarea | Crear nueva/sin prioridad, edición, planificación/límite separados, motivo bloqueo opcional, árbol multinivel, etiquetas, origen y referencias. Tiempo/contexto derivados. Acciones de estado explican efectos sin exigir revisión como paso obligatorio. |
| Notas | Editor/preview, título omitible en creación y persistente después, links explícitos por tipo y contexto derivado separado. Vínculos cruzados no son error. Archivo/papelera distintas. |
| Etiquetas | Selección Todas/Cualquiera, creación nombre/color opcional; explicar inmutabilidad sin ofrecer rename/color update/delete. Quitar assignment no borra tag. |
| Inbox | Página dedicada para consultar/procesar; global solo agregar capturas. Crear/editar título/cuerpo, revisar captura+destino para combinación, escoger proyecto al convertir a tarea. Submit único; error conserva captura y borrador, no animar retiro antes del commit. |
| Tiempo | Manual día/minutos, listado/edit/destino, borrado confirmado, timers múltiples. Tiempo retenido identificado solo lectura/fuera de totales; sumas no descuentan solapamientos. |
| Finanzas | Enteros texto, COP sin código visible según acuerdo, USD explícito, original/equivalente o pendiente. Ingreso/gasto/neto COP y aviso de pendientes. Sin subtotales moneda/categorías. |
| Calendario | Marcadores planned/due diferenciados, eventos por rango y cerradas como conteos pulsables. Arrastre cambia planned; teclado ofrece acción equivalente. No duración tarea ni notificaciones. |
| Actividad | Timeline con resumen y detalle before/after; filtros período/tipo únicamente. Al desaparecer definitivamente una nota, quitar sus entradas de Actividad, sin fila redactada. Agrupación no convierte lista en auditoría de tareas. |
| Búsqueda | Resultados alfabéticos por nombre/título, no relevancia. Entidades admitidas, incluir archivados/cerrados, prefijos/todos términos. No selector OR de palabras. Links al detalle correcto. |
| Papelera | Notas/eventos recuperables hasta plazo; tareas retenidas en sección de consulta aparte, sin Restaurar. No prometer que retención equivale a recuperación. |
| Configuración | Acceso local/LAN, guía HTTPS, creación backup manual, estado seguro y pasos de restore CLI servidor detenido. Sin toggle de cifrado inexistente. |

### Confirmaciones

Componente común recibe efectos del preview y traduce códigos a texto español, sin generar consecuencias por su cuenta. Muestra rama, destino, separación, timers por cerrar, atribución del tiempo y pérdida/retención cuando corresponda. Confirmar reenvía el input original y acceptance vinculados; volver/cancelar no cambia dominio.

Una operación puede fallar después de la confirmación por cambio concurrente. Abrir nuevo preview y pedir nueva aceptación; no conservar checkbox marcado para efectos nuevos. Cliente archivado no se reactiva como checkbox de reapertura de tarea: se indica la operación previa necesaria.

Cerrar, mover, convertir Inbox, mandar a papelera, borrar tiempo/finanzas y cambiar tasa no usan UI optimista. Cambios simples también esperan respuesta inicialmente para reducir complejidad. Si red pierde respuesta, mostrar resultado desconocido y consultar estado antes de ofrecer repetir.

### Temporizadores

UI calcula progreso desde startedAt/límite y desfase aproximado reloj host, corrigiendo al refrescar. No acumular ticks como duración persistida. Al volver de suspensión o recuperar conexión, pedir activos de nuevo. Propuesta de polling 5s con pestaña visible y refresco al recuperar foco; presupuesto configurable técnico, no una notificación.

Mostrar todos los activos simultáneos; uno por tarea y uno directo por proyecto. Nunca botón global sin destino. Inicio en Nueva la pasa a En curso; actualizar ambas cosas solo tras éxito del servidor. Bloqueadas/revisión permiten inicio sin cambiar estado. Inicio en cerrada abre preview de reapertura; pausa no ofrece reinicio automático. El contador puede indicar "límite alcanzado, guardado pendiente" hasta observar materialización, sin contar más de 12h.

### Fechas y Markdown

Día puro no pasa por `new Date('YYYY-MM-DD')` para su presentación. Hora de tarea/evento y Hoy/calendario usan siempre America/Bogota, incluso si el anfitrión o navegador LAN tiene otra zona. No ofrecer selector de zona ni diálogos DST de otras zonas.

Markdown sin HTML activo. Sanear resultado en biblioteca mantenida y configurar renderer sin carga automática remota. Bloquear javascript/data/file y otras URLs ejecutables; links externos requieren acción del usuario, `rel=noopener noreferrer` al abrir nueva pestaña. No embeds, iframes ni fetch de previews. Imágenes remotas no se descargan al renderizar; mostrar referencia inerte si aparecen en Markdown. No prometer soporte de adjuntos.

## Diseño visual y accesibilidad

Paleta confirmada primary `#07B478`, secondary `#518166`, tertiary `#FF9676`, neutral `#717973`. Superficies, texto, tamaños, densidad y semántica error/warning siguen propuestos. No asignar tertiary a error automáticamente ni usar neutral sobre fondo oscuro sin medir contraste.

Revisar desktop 1440px y viewport estrecho 390px como casos iniciales, no breakpoints aprobados. En listas densas mantener título/motivo legibles y planificación/límite separados. Tooltip no sustituye acceso al texto completo mediante detalle. No añadir KPI, cifrado, rutas SQLite o sprints para llenar espacio.

Objetivo técnico WCAG 2.2 AA propuesto: contraste texto normal >=4.5:1, texto grande >=3:1 y controles/foco no dependientes de color. Verificar en navegador, no inferirlo de hexadecimal aislado.

Teclado completo: tab order, Enter en formularios, Escape para cerrar overlay no enviado, foco restaurado al disparador y foco atrapado en modal. Menús y árbol con semántica accesible, etiquetas de campos, estados de carga/resultado anunciados sin leer cada tick del timer. Botones visibles sin hover, iconos acompañados de texto accesible. Respetar reduced-motion.

## HTTP, errores y caché

Interceptor envía token CSRF en mutaciones y credenciales same-origin. No attach cookie manualmente ni guardar token sesión en JS. Un 401 detiene la mutación y lleva a login; no reenvía automáticamente un comando después de login.

Cancelar peticiones de búsqueda/filtros obsoletos con switchMap y número de solicitud para no sobrescribir resultados nuevos. Debounce propuesto 200ms, sin efecto sobre reglas. Loading inicial distinto de refresh, vacío inicial distinto de vacío por filtros.

Personal JSON usa Cache-Control no-store; assets con hash pueden ser immutable. Sin CDN/fonts remotos, telemetría externa, service worker de datos o analytics. CSP estricta desde servidor sin unsafe-eval; revisar necesidades de estilos Angular antes de fijar política. Trusted Types solo si versión/librerías lo soportan de forma probada, no prometerlo por escribirlo.

## Puerta de frontend por unidad

Antes de dar UI por terminada: diseño revisado del grupo, contratos reales integrados, prueba en navegador de happy path/error/conflict/empty, teclado/contraste y funcionamiento sin Internet con servidor presente. No sustituir estas pruebas por mockups ni dar capacidad web completa cuando solo existe core/CLI.
