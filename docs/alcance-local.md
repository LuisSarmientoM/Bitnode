# Alcance local de la app personal

Documento de acuerdos de producto tras 46 rondas. La ronda 46 autoriza la revisión final y una propuesta de diseño para detalles menores, sin implementación. No es todavía un esquema de base de datos.

Consultar [revisión final](revision-alcance-local.md) para el modelo consolidado, límites y propuestas pendientes.

- **Confirmado**: solicitado o aceptado por el usuario.
- **Propuesto**: recomendación que necesita aprobación.
- **Pendiente**: pregunta abierta. Ninguna opción se considera elegida.

## 1. Acuerdos confirmados

| Área | Acuerdo |
|---|---|
| Ejecución | Una app local, funcional sin Internet ni integraciones. Primera versión solo macOS, servidor y CLI. |
| Stack | Angular + NestJS que sirve el frontend + SQLite + Drizzle. |
| Interfaces | REST API y CLI. Sin MCP. |
| CLI | Autónoma, no depende de API ni de un servidor activo. Comparte casos de uso y acceso a datos con NestJS. |
| Cliente | Nombre, nombre corto opcional y único cuando exista, y scope `work` o `personal`. El scope puede cambiarse con confirmación, afectando a sus proyectos y tareas existentes. |
| Contacto | Puede vincularse a varios clientes o ninguno. Nombre obligatorio; un email, un teléfono y observaciones opcionales. |
| Proyecto | Pertenece a cliente y hereda su scope. Estados activo, pausado, completado y archivado. No puede completarse ni archivarse con tareas abiertas. |
| Tarea | Siempre pertenece a un proyecto. Scope derivado. Estados nueva, en curso, bloqueada, en revisión, completada y cancelada. |
| Revisión | Opcional: se puede completar sin pasar por revisión. Identificador `in_review` propuesto. |
| Fechas de tarea | Fecha planificada y fecha límite separadas, ambas opcionales y con hora opcional. Planificar después del límite se permite con aviso. |
| Fechas de proyecto | Inicio y fin planificados opcionales, solo día. |
| Eventos | Título obligatorio, descripción Markdown opcional y papelera recuperable de 30 días antes de purga definitiva. |
| Cambios de estado | Libres, con confirmación al reabrir completadas o canceladas. Tareas y ancestros reabiertos vuelven a en curso. En proyectos completados/archivados se ofrece reactivar el proyecto junto con la tarea, en una operación confirmada. |
| Bloqueo | Motivo opcional. |
| Prioridad | Sin prioridad, baja, media y alta. Por defecto: sin prioridad. |
| Subtareas | Varios niveles, sin ciclos y en el mismo proyecto que el padre. No se puede completar un padre con subtareas abiertas. Cancelar ofrece cancelar descendientes abiertos; mover traslada toda la rama con confirmación; reabrir ofrece reabrir ancestros cerrados. Sin dependencias entre tareas. |
| Destino de tareas | Crear o mover a un proyecto completado/archivado está prohibido: ocultarlo en el selector y devolver error si se intenta desde cualquier interfaz. Incluso mover ramas totalmente cerradas exige reactivar el destino primero. |
| Separar subtarea | Permitido: conserva proyecto, datos y descendientes, quitando el vínculo con su padre. |
| Inbox | Widget global, no página dedicada. Capturas con título obligatorio y cuerpo opcional, separadas de tareas, sin proyecto ni scope obligatorio. |
| Procesamiento | Una captura puede convertirse en tarea con proyecto, nota o descartarse. |
| Notas | Markdown, título generado desde primer encabezado/línea si se omite. Notas libres permitidas; máximo un vínculo por tipo cliente/proyecto/tarea/contacto, sin restricción de contexto incluso entre work y personal. Varias etiquetas. FTS5, sin RAG. |
| Contenido de notas | Basta título o contenido; no se permiten ambos vacíos. El título generado se conserva al editar contenido y solo cambia por edición explícita. |
| Adjuntos de notas | Fuera de primera versión; Markdown y enlaces, sin gestión de archivos. |
| Búsqueda de notas | FTS5 sobre título y contenido. |
| Etiquetas | Planas, nombre único ignorando mayúsculas y acentos, color opcional. En tareas, notas, clientes, proyectos y contactos; no en Inbox, tiempo ni movimientos financieros en primera versión. Filtros seleccionables todas/cualquiera. |
| Tiempo | Vinculado a tarea o proyecto, no directamente a cliente. Minutos enteros, redondeo hacia arriba por entrada: 2:00 = 2 min; 2:01 = 3 min. |
| Temporizadores | Varios simultáneos, uno corriendo por tarea y uno directo por proyecto. Pausar cierra entrada; reanudar inicia intervalo nuevo. Siguen tras cierre/reinicio, máximo 12 horas por intervalo continuo; cierre y guardado automático al límite. |
| Medianoche | Dividir por día y redondear cada tramo hacia arriba. La división no reinicia el límite de 12 horas del intervalo. |
| Carga manual de tiempo | Fecha y minutos, sin inicio/fin. |
| Cierre de tarea y tiempo | Completar o cancelar detiene sus temporizadores y guarda el tiempo en la misma operación, también en cierres conjuntos. |
| Solapamientos | Permitidos sin aviso. |
| Finanzas | Solo `income` o `expense`, asociación opcional a cliente o proyecto. Sin categorías, etiquetas, préstamos ni contabilidad en primera versión. |
| Moneda | Solo COP y USD. COP por defecto, solo pesos enteros. No mostrar el código COP; indicar USD. |
| Conversión financiera | Tasa manual por movimiento en COP por unidad original. Puede quedar pendiente: excluir del total COP e indicar movimientos sin convertir. Redondear cada equivalente al peso cercano, 0,5 hacia arriba. Editar tasa requiere confirmación y recalcula totales anteriores. |
| Recurrencia | Fuera de la primera versión. |
| Exportación | Fuera del alcance. Backup/recuperación de base sí incluidos, solo manuales. |
| Datos locales | Carpeta estándar de usuario del sistema operativo, configurable y compartida por CLI/servidor. |
| Acceso | LAN desde inicio, contraseña local de único propietario y autenticación también en localhost. HTTPS obligatorio en LAN. No implica exposición a Internet. |
| Cifrado en disco | Sin cifrado propio para SQLite ni backups; protección mediante permisos y cifrado del sistema operativo. |
| Vistas | Hoy, Actividad y Calendario, además del widget Inbox. |
| Hoy | Selección manual persistente y reglas automáticas: planificadas hoy o antes, vencen hoy/vencidas, o en curso. Solo tareas abiertas; bloqueadas y en revisión en secciones separadas. |

## 2. Fuera de la etapa actual

No diseñar ni implementar todavía sincronización, OAuth, webhooks, polling, outbox, reconciliación ni conflictos. Cloudflare no es necesario para la etapa local.

Se conserva como contexto futuro, no como trabajo autorizado:

- Google Calendar: multi-cuenta, calendarios seleccionados, lectura y escritura.
- COR: tareas donde el usuario sea PM, colaborador o seguidor; vinculación manual de clientes/proyectos y polling.
- GitHub: multi-cuenta y repos seleccionados, solo actividad/contexto; nunca modifica estados de tareas locales.
- Push mediante outbox, merge three-way por campo y resolución humana de conflictos.
- Cloudflare Tunnel Free solo para callbacks y webhooks, nunca como backend.

## 3. Inbox explicado

```text
Capturar texto desde cualquier vista o desde CLI
                       |
                       v
              +------------------+
              | Widget Inbox     |
              | Capturas sin     |
              | clasificar       |
              +------------------+
                       |
             Decidir qué hacer
                       |
       +---------------+---------------+
       |               |               |
       v               v               v
  Crear tarea      Crear nota       Descartar
       |               |               |
  Elegir proyecto  Asociación       Sin registro
  obligatorio      por decidir     de dominio nuevo
       |               |               |
       +---------------+---------------+
                       |
          Sale de capturas pendientes
```

Una captura no es una tarea. La tarea exige proyecto; capturar no. El widget permite tanto capturar como revisar pendientes sin una página propia.

Confirmado: editar título/cuerpo sin adjuntos; crear o añadir a tarea/nota existente; eliminar captura al convertir. Descartar elimina definitivamente con confirmación. Al añadir a un registro existente se abre su contenido junto con la captura para editar la combinación antes de guardar. Pendiente: qué ocurre si falla el procesamiento.

## 4. Campos y reglas por cerrar

Los campos marcados como propuestos no están aprobados. Los identificadores y timestamps técnicos se decidirán al diseñar el esquema.

### Cliente

- Confirmados: nombre completo obligatorio y único; nombre corto opcional y único cuando exista. Ambas comparaciones ignoran mayúsculas y acentos. También confirmados: scope work/personal y observaciones opcionales. El scope debe elegirse siempre, sin valor predeterminado, también desde CLI.
- Confirmado: archivado reversible, conservando asociaciones. No se puede archivar un cliente con proyectos activos o pausados; primero deben completarse o archivarse.
- Regla confirmada: borrado definitivo solo sin asociaciones.
- Regla confirmada: crear o reactivar un proyecto bajo cliente archivado exige reactivar el cliente primero, sin reactivación conjunta implícita.
- Regla confirmada: nuevos vínculos opcionales a cliente archivado permitidos mediante selección explícita; oculto por defecto en selectores, sin reactivarlo. Esto no permite crear/reactivar proyectos bajo él.
- Pendientes: detalles de normalización.
- Reglas confirmadas: sus proyectos heredan el scope; cambiarlo requiere confirmación y afecta al scope derivado de proyectos y tareas existentes.

### Contacto

- Confirmados: nombre obligatorio; un email, un teléfono y observaciones opcionales.
- Regla confirmada: puede asociarse a varios clientes o a ninguno; no requiere duplicar la persona por cliente.
- Regla confirmada: no incluir cargo ni múltiples emails/teléfonos en primera versión, según el conjunto de campos elegido.
- Confirmado: solo archivado reversible, conservando datos y vínculos. Sin eliminación individual de contactos en primera versión.
- Regla confirmada: nuevos vínculos a contactos archivados permitidos mediante selección explícita, ocultos por defecto en selectores, sin reactivarlos.
- Confirmado: contactos con el mismo nombre permitidos, sin requisito de unicidad.
- Confirmado: en filtros work/personal, contactos según scope de sus clientes; los vinculados a ambos aparecen en ambos. Contactos libres solo aparecen al ver Todos.
- Pendientes: validación de email/teléfono.

### Proyecto

- Confirmados: cliente del que depende, scope heredado y estados activo, pausado, completado y archivado.
- Confirmados: nombre obligatorio y único dentro del cliente, ignorando mayúsculas y acentos; descripción y fechas de inicio/fin opcionales. El nombre puede repetirse entre clientes.
- Regla confirmada: el cliente del proyecto no se puede cambiar en primera versión.
- Propuestos: identificadores de estado `active | paused | completed | archived`.
- Confirmadas: descripción Markdown; fechas de inicio/fin de planificación, introducidas manualmente y no modificadas por cambios de estado. No se añaden pares de fechas reales.
- Confirmado: fechas planificadas de inicio/fin solo día, sin hora.
- Regla confirmada: fin planificado anterior al inicio permitido con aviso.
- Regla confirmada: cualquier traslado de tareas exige destino activo o pausado. Si está completado/archivado, reactivarlo primero, aunque todas las tareas estén cerradas.
- Pendientes: detalles de normalización. Crear siempre produce una tarea nueva, por tanto abierta.
- Regla confirmada: proyectos completados/archivados no se muestran como destino para crear o mover tareas abiertas; si se intenta, la operación devuelve error. La restricción también aplica a REST y CLI.
- Reglas confirmadas: toda tarea requiere proyecto; completar o archivar un proyecto se impide mientras tenga tareas abiertas.
- Propuesta: considerar abiertas las tareas en nueva, en curso, bloqueada o en revisión; completada y cancelada serían estados de cierre.

### Captura de Inbox

- Confirmados: título obligatorio, cuerpo opcional; sin proyecto ni scope obligatorio.
- Propuestos: título no vacío después de quitar espacios y fecha de captura. No hacen falta estados persistentes de procesada/descartada, dado que se elimina la captura.
- Confirmado: edición de título/cuerpo, solo texto y enlaces, sin adjuntos.
- Regla confirmada: procesar permite crear una tarea/nota o añadir contenido a una existente; la captura se elimina, no se conserva un registro aparte.
- Regla confirmada: descartar elimina definitivamente con confirmación, sin restauración.
- Regla confirmada: añadir a tarea/nota existente abre el contenido del destino junto con la captura para editar cómo combinarlos antes de guardar, sin reemplazo ni agregado automático silencioso.
- Pendientes: posibilidad de ajustar contenido al crear un registro nuevo; tratamiento de fallos.
- Propuesta técnica: guardar el destino y eliminar la captura en una misma transacción; un fallo conserva la captura.
- Regla confirmada: convertir en tarea exige elegir proyecto antes de terminar la operación.

### Tarea

- Confirmados: título, descripción, prioridad, proyecto, etiquetas, origen y referencias externas; estados nueva, en curso, bloqueada, en revisión, completada y cancelada.
- Confirmadas: revisión opcional; fecha planificada y fecha límite separadas, opcionales y con hora opcional; transiciones libres con confirmación al reabrir completadas o canceladas; motivo de bloqueo opcional.
- Confirmados: prioridades sin prioridad, baja, media y alta; sin prioridad por defecto; subtareas en primera versión; dependencias excluidas.
- Confirmado: formato Markdown para descripción de tarea.
- Confirmados: título obligatorio no vacío y descripción Markdown opcional. Toda tarea se crea en nueva, también desde CLI o Inbox.
- Regla confirmada: planificar después de la fecha límite se permite con aviso, sin impedir guardar.
- Confirmadas: referencias como lista de URLs con nombre opcional; sin consultas ni acciones automáticas sobre proveedores.
- Regla confirmada: completar registra automáticamente fecha/hora de finalización; reabrir la limpia. Pasar directamente de completada a cancelada conserva la fecha de última finalización. No modifica planificación ni límite. Completar de nuevo registra un nuevo instante, sin historial propio de cierres.
- Propuestos: identificadores `new | in_progress | blocked | in_review | done | cancelled` y `none | low | medium | high`.
- Confirmadas: subtareas de varios niveles, sin ciclos y en el mismo proyecto que el padre; impedir completar un padre con subtareas abiertas.
- Regla confirmada: al reabrir una tarea de un proyecto completado/archivado se ofrece reactivar el proyecto junto con la tarea, en una operación confirmada. No se reactiva automáticamente sin consentimiento.
- Regla confirmada: cancelar un padre con descendientes abiertos ofrece cancelarlos conjuntamente o abortar; los descendientes ya cerrados conservan su estado.
- Regla confirmada: mover una tarea con subtareas traslada toda su rama al proyecto destino, con confirmación.
- Regla confirmada: reabrir una subtarea ofrece reabrir también sus ancestros cerrados y reactivar el proyecto si corresponde, con confirmación. Las tareas y ancestros reabiertos vuelven a en curso.
- Regla confirmada: separar una subtarea elimina el vínculo con su padre y conserva proyecto, datos y descendientes.
- Regla confirmada: crear o mover tareas abiertas a proyectos completados/archivados está prohibido; se filtra el selector y se devuelve error si se intenta.
- Regla confirmada: al mover tareas, su tiempo ya registrado se atribuye al nuevo proyecto y cliente, no al destino original.
- Confirmado: eliminación de rama con confirmación, sin recuperación de tareas. Datos retenidos 30 días antes de purga; tiempo y vínculos se conservan durante ese plazo. Borrado definitivo elimina tiempo y desvincula notas/eventos sin eliminarlos.
- Regla confirmada: mover a otro proyecto una subtarea todavía vinculada a su padre la separa y traslada con sus descendientes, en una operación confirmada.
- Regla confirmada: todo traslado a proyecto completado/archivado exige reactivar el destino primero, incluso con una rama totalmente cerrada. Ramas mixtas tampoco se pueden trasladar a un destino cerrado.
- Confirmado: trasladar una tarea conserva los vínculos explícitos de las notas que la referencian; solo cambia su contexto derivado de tarea.
- Pendientes: validación y duplicados de URLs; presentación durante retención.
- Regla confirmada: cliente y scope se derivan del proyecto. No son elecciones independientes.
- Regla confirmada: sin recurrencia inicial.

### Nota

- Confirmados: Markdown, etiquetas y búsqueda FTS5; título generado desde el primer encabezado o línea si se omite; se permiten notas sin asociaciones.
- Regla confirmada: máximo un vínculo explícito por tipo: cliente, proyecto, tarea y contacto. Las etiquetas no están limitadas a una.
- Regla confirmada: los vínculos pueden cruzar clientes, proyectos y scopes. Por ejemplo, el proyecto explícito puede diferir del proyecto de la tarea vinculada; no se exige coherencia entre esos contextos.
- Propuestos: fechas de creación/modificación.
- Regla confirmada: se puede guardar solo título con contenido vacío; debe existir título o contenido, nunca ambos vacíos.
- Regla confirmada: el título generado se conserva al editar contenido y solo cambia mediante edición explícita.
- Confirmado: sin adjuntos en primera versión; solo Markdown y enlaces, sin gestión de archivos adjuntos.
- Confirmado: FTS5 busca en título y contenido.
- Confirmado: búsqueda ignora mayúsculas y acentos y admite palabras completas y prefijos, no fragmentos arbitrarios.
- Confirmado: papelera recuperable de 30 días y posterior borrado definitivo. A diferencia de las tareas, las notas sí pueden restaurarse.
- Confirmado: archivado reversible separado de papelera; archivar no inicia el plazo de purga.
- Confirmado: vincular una tarea no añade vínculos explícitos a proyecto/cliente; estos se eligen por separado. Se muestra el contexto derivado de la tarea.
- Confirmado: notas en filtros work/personal por coincidencia en cualquier vínculo; transversales aparecen en ambos, libres solo al ver Todos.
- Confirmado: enviar nota a papelera requiere confirmación; al restaurarla vuelve activa, incluso si estaba archivada.
- Pendientes de diseño: detalles de purga y normalización. La combinación de términos ya está confirmada como Todas en ronda 46.

### Etiqueta

- Confirmados: plana, transversal, color opcional; nombre único ignorando mayúsculas y acentos.
- Confirmadas: etiquetas en tareas, notas, clientes, proyectos y contactos. Sin etiquetas en capturas de Inbox, registros de tiempo ni movimientos financieros en primera versión.
- Regla confirmada: al seleccionar varias etiquetas se puede elegir todas (AND) o cualquiera (OR).
- Propuesto: nombre obligatorio no vacío; conservar el nombre elegido para mostrarlo.
- Confirmado: no renombrar, fusionar ni borrar etiquetas en primera versión. Esto no prohíbe quitar asignaciones a registros.
- Confirmado: ñ se distingue de n en unicidad y búsqueda; se ignoran mayúsculas y acentos vocálicos.
- Confirmado: filtro Todas (AND) por defecto; Cualquiera (OR) disponible.
- Confirmado: color fijo al crear, incluida la ausencia de color; no se puede editar ni quitar después.
- Pendientes: normalización de espacios y validación del nombre.
- Regla confirmada: no hay padres, hijos ni expansión jerárquica de búsqueda.

### Registro de tiempo

- Confirmados: vínculo a tarea o proyecto; sin registro directo a cliente. Duración en minutos enteros; varios temporizadores simultáneos entre web y CLI.
- Confirmada: carga manual con fecha y minutos, sin horas de inicio/fin; mínimo 1 minuto.
- Propuestos: cliente derivado del proyecto y proyecto derivado de la tarea cuando exista; descripción opcional.
- Regla confirmada: pausar cierra la entrada; reanudar inicia un intervalo independiente. Cada entrada redondea hacia arriba una sola vez sobre su duración, no cada actualización visual. Ejemplo: intervalos 1:10 y 0:20 registran 2 min y 1 min, total 3 min.
- Regla confirmada: un intervalo que cruza medianoche se divide en entradas por día y cada tramo redondea hacia arriba. Esto puede aumentar el total frente a redondear el intervalo completo. Dividir por día no reinicia el límite de 12 horas; se usa la zona actual del equipo.
- Regla confirmada: solapamientos de intervalos permitidos sin advertencias. La suma puede superar el tiempo real transcurrido; no se deduplican intervalos. Las cargas manuales con fecha y minutos no tienen inicio/fin para detectar coincidencias horarias.
- Regla confirmada: el tiempo vinculado a una tarea sigue su proyecto y cliente actuales, incluso el registrado antes de un traslado. No se conserva la atribución histórica al proyecto original.
- Regla confirmada: temporizadores siguen contando tras cerrar interfaz o reiniciar app/equipo, con límite de 12 horas por intervalo continuo. Cada inicio o reanudación tiene su propio límite.
- Regla confirmada: al alcanzar el límite se cierra y guarda automáticamente, con final efectivo en inicio + 12 horas. Si la app no está ejecutándose, se materializa al volver sin contar tiempo adicional.
- Regla confirmada: completar o cancelar una tarea detiene sus temporizadores y guarda el tiempo redondeado en la misma operación. Aplica también a tareas afectadas por cierres conjuntos.
- Regla confirmada: no se permiten dos temporizadores corriendo sobre la misma tarea, ni dos directos sobre el mismo proyecto, entre web y CLI. Esta restricción no impide cronometrar tareas distintas del mismo proyecto simultáneamente.
- Regla confirmada: el tiempo de tareas eliminadas deja de contar en los totales desde la eliminación, aunque se conserve durante 30 días antes de purgarse.
- Regla confirmada: no se admite tiempo manual nuevo en tareas eliminadas.
- Regla confirmada: se admite tiempo manual en tareas completadas o canceladas no eliminadas, sin reabrirlas.
- Regla confirmada: completar o archivar un proyecto detiene su temporizador directo y guarda el tiempo en la misma operación; sigue vigente la restricción de no tener tareas abiertas.
- Regla confirmada: iniciar temporizador en tarea completada/cancelada ofrece reabrirla, reabrir ancestros cerrados y reactivar proyecto si corresponde, todo con confirmación antes de iniciar.
- Regla confirmada: tiempo manual directamente en proyectos completados/archivados permitido, sin reactivarlos.
- Regla confirmada: mover una tarea/rama detiene y guarda sus temporizadores activos. El tiempo cerrado también se atribuye al proyecto/cliente destino; no se reinician temporizadores automáticamente.
- Confirmado: entradas guardadas editables en fecha, minutos y destino; eliminación individual definitiva con confirmación.
- Regla confirmada: iniciar temporizador directo en proyecto completado/archivado ofrece reactivar e iniciar con confirmación. Sigue vigente la obligación de reactivar primero al cliente si está archivado.
- Confirmado: tiempo ligado a tareas eliminadas solo consultable durante retención, sin edición, traslado ni borrado individual; se purga junto con la tarea. Esta excepción limita la edición general de entradas guardadas.
- Confirmado: cambiar zona conserva el día de entradas de tiempo ya guardadas; no redistribuye el histórico. La nueva zona se usa para futuras entradas y temporizadores.
- Pendiente técnico: representación del origen cronometrado al editar entradas, sin alterar la edición ya permitida.

### Movimiento financiero

- Confirmados: tipo `income | expense`; moneda predeterminada COP, solo pesos enteros, sin fracciones.
- Confirmadas: asociaciones opcionales; movimiento sin asociar, asociado directamente a cliente o asociado a proyecto con cliente derivado. No se eligen cliente/proyecto contradictorios.
- Confirmados: importe mayor que cero en unidades enteras para todas las monedas, concepto opcional y fecha solo día. Income/expense determina el signo, no se introducen importes negativos.
- Confirmado: sin etiquetas ni categorías financieras en primera versión.
- Regla confirmada: conversión con tasa manual por movimiento para totales en COP, sin proveedor de cotizaciones ni tasa global implícita.
- Regla confirmada: se puede guardar moneda distinta de COP sin tasa. El movimiento queda pendiente de conversión, fuera del total COP, y la vista indica que hay movimientos sin convertir; no tratarlo silenciosamente como cero.
- Regla confirmada: tasa expresada en COP por unidad de moneda original. Equivalente COP = importe original × tasa.
- Regla confirmada: redondear el equivalente de cada movimiento al peso más cercano, con fracciones desde 0,5 hacia arriba.
- Regla confirmada: editar tasa requiere confirmación y recalcula el equivalente y los totales que incluyen el movimiento, también de períodos anteriores.
- Confirmado: edición de campos permitida; borrado individual definitivo con confirmación, recalculando los totales. Editar la tasa conserva su confirmación específica.
- Confirmada: tasa positiva, hasta dos decimales, independiente de importes enteros.
- Confirmada: fecha obligatoria solo día, hoy por defecto y editable.
- Confirmado: reembolso como movimiento independiente del tipo opuesto, sin vínculo al original ni tipo adicional.
- Confirmado: catálogo limitado a COP y USD en primera versión.
- Regla confirmada: cambiar entre COP y USD limpia la tasa anterior. Al pasar a USD queda conversión pendiente hasta introducir una nueva tasa; COP no usa tasa.
- Propuesta técnica: importe exacto, no coma flotante; el tipo determina ingreso o gasto.
- Regla confirmada: ocultar código COP y mostrar código de otras monedas. Formato del importe pendiente.
- Confirmado: mostrar importe original y equivalente en pesos; sin tasa, original y conversión pendiente.
- Confirmado: solo totales en pesos, sin subtotales por moneda original. Se conserva el aviso de movimientos pendientes de conversión.

### Evento local

- Confirmada: entidad evento local, independiente de las tareas, con título e inicio/fin o día completo.
- Confirmadas: asociaciones opcionales; sin vínculo, cliente, proyecto o tarea. El vínculo más específico determina proyecto y cliente cuando corresponda.
- Confirmado: eventos de uno o varios días, con hora o de día completo. Vincular a tarea no cambia automáticamente su estado.
- Confirmado: sin recordatorios locales en primera versión.
- Confirmados: título obligatorio y descripción Markdown opcional.
- Confirmado: papelera recuperable de 30 días; después, purga definitiva.
- Regla confirmada: eventos con hora admiten duración cero, como marcadores simples, sin añadir notificaciones ni recordatorios. El fin no puede ser anterior al inicio.
- Regla confirmada: el último día elegido de un evento de día completo se incluye. Del 10 al 12 ocupa los tres días.
- Regla confirmada: enviar un evento a la papelera requiere confirmación.
- Regla derivada del vínculo más específico: el contexto de proyecto/cliente de un evento vinculado a tarea sigue a esa tarea si se traslada.
- Pendientes de diseño: detalles de restauración/purga.
- Restricción de alcance: mantener calendario y eventos simples; no abrir nuevas rondas sobre detalles menores de presentación.
- Regla confirmada: no recurrencia inicial.

### Actividad

- Confirmado: timeline consolidado, local en esta etapa.
- Acciones incluidas: creaciones, ediciones y procesamiento/descarte de notas, etiquetas y capturas; inicio/pausa/reanudación/cierre de temporizadores y carga/edición manual de tiempo; creaciones, ediciones, cambios de tasa y bajas de finanzas y eventos.
- Selección confirmada: no incluir acciones de tareas, proyectos, clientes ni contactos en esta vista en primera versión. Esto no define una política de auditoría técnica aparte.
- Confirmado: resumen en lista y detalle desplegable con campos cambiados y valores anteriores/nuevos.
- Regla confirmada: retención de un año, con eliminación automática de entradas más antiguas. La purga afecta al historial, no a los registros de dominio.
- Confirmados: filtros por período y tipo de registro. Sin filtros de contexto ni acción en primera versión.
- Propuesta: registros generados por acciones, no entradas manuales ni event sourcing.
- Pendientes: límites de detalle para Markdown largo; presentación de registros eliminados; precisión del plazo anual y ejecución de la purga; agrupación de operaciones que producen varias entradas.

### Vista Hoy

- Confirmada: combina selección manual y reglas automáticas. Seleccionar manualmente no cambia las fechas.
- Reglas automáticas confirmadas: tareas planificadas para hoy; planificadas para días anteriores; con fecha límite hoy o anterior; en curso aunque no tengan fecha.
- Regla confirmada: basta cumplir alguna regla o estar seleccionada manualmente, siempre siendo una tarea abierta. No incluir completadas ni canceladas.
- Regla derivada: una tarea que cumple varias condiciones aparece una sola vez; las condiciones pueden indicarse como motivos de inclusión.
- Confirmado: bloqueadas y en revisión que cumplen criterios se muestran en secciones separadas.
- Regla confirmada: selección manual persiste entre días hasta retirarla o cerrar la tarea. Retirarla no excluye una tarea que aún cumple una regla automática.
- Confirmado: ambos scopes por defecto, con filtro para mostrar solo work o personal.
- Orden confirmado de sección principal: en curso primero; luego prioridad alta, media, baja y sin prioridad; después fecha límite más temprana, sin límite al final. Bloqueadas y revisión se ordenan por prioridad y fecha límite.
- Confirmado: tareas de proyectos pausados se incluyen igual que las demás cuando cumplen criterios.
- Confirmado: lista plana; subtareas muestran ruta de ancestros como contexto. Los ancestros no se añaden como filas si no cumplen criterios por sí mismos.
- Confirmada: zona horaria actual del equipo para determinar Hoy.
- Confirmado: filtros por cliente y proyecto, además de scope, sin alterar selección manual ni fechas.
- Pendientes de diseño: desempate final del orden; tratamiento de horas dentro del día.

### Calendario y zona horaria

- Confirmado: eventos locales y fechas de tareas.
- Regla confirmada: planificación y fecha límite se muestran diferenciadas.
- Regla confirmada: arrastrar una tarea cambia siempre la fecha planificada; la fecha límite se modifica desde edición, no por arrastre.
- Regla confirmada: Calendario, Hoy y división diaria de temporizadores usan siempre la zona horaria actual del equipo. Al cambiar la zona del sistema, puede cambiar el día de presentación de un instante.
- Regla confirmada: tareas completadas/canceladas no tienen tarjetas en calendario. Se muestran conteos por día según sus fechas representadas; pulsar el indicador abre la lista de esas tareas.
- Confirmado en ronda 45: cambiar zona conserva el día del tiempo ya guardado.
- Pendientes de diseño: conteo sin duplicados cuando planificación/límite coinciden; marcadores coincidentes; interacción con marcador de vencimiento; duración visual de tareas; fechas sin hora y horario de verano.

### Búsqueda global

- Confirmadas: notas, tareas, proyectos, clientes, contactos y eventos locales.
- Confirmado: no incluir capturas de Inbox, registros de tiempo ni movimientos financieros en la búsqueda global inicial. Esto no impide filtros propios en sus vistas.
- Regla confirmada: ignorar mayúsculas y acentos; admitir palabras y prefijos, no cualquier fragmento interno. Ejemplo: des encuentra desarrollo, roll no.
- Regla confirmada: archivados, proyectos completados y tareas completadas/canceladas quedan fuera por defecto; un filtro permite incluirlos.
- Confirmado: notas buscan título y contenido mediante FTS5.
- Confirmado: ñ distinta de n en búsqueda y en comparaciones de unicidad de nombres. Ejemplo: pena no coincide con peña.
- Confirmado: tareas de proyectos archivados excluidas por contexto en búsqueda por defecto; activar inclusión de archivados para encontrarlas. No modifica la prohibición de archivar proyectos con tareas abiertas.
- Confirmado: buscar en nombres, títulos, descripciones y observaciones de las entidades incluidas; notas mantienen título y contenido Markdown.
- Confirmado: múltiples términos exigen coincidencia de todos, aunque estén en campos distintos del mismo registro.
- Pendientes de diseño: orden/relevancia y filtros adicionales por contexto/etiquetas/tipo, sin ampliar alcance implícitamente.

### Papelera y eliminación

- Confirmado: tareas eliminadas no se pueden recuperar; sus datos se retienen 30 días antes del borrado definitivo. Este acuerdo sustituye la restauración de tareas incluida en la ronda 25.
- Confirmado, aclarado por pregunta adicional: notas sí tienen papelera recuperable de 30 días; después se borran definitivamente.
- Regla confirmada: eliminar una tarea con subtareas afecta a toda la rama y requiere confirmación. Aplica tanto a la eliminación con retención como al borrado definitivo solicitado por el usuario.
- Regla confirmada: borrar definitivamente una tarea elimina también su tiempo registrado; conserva notas y eventos, quitando sus vínculos a la tarea eliminada. La operación solicitada por el usuario requiere confirmación.
- Regla confirmada: clientes y proyectos solo pueden borrarse definitivamente si no tienen asociaciones. No hay borrado en cascada de sus registros.
- Regla derivada: borrar una nota no elimina las entidades que la nota referencia.
- Regla confirmada: eliminar tareas detiene sus temporizadores y guarda el tiempo en la misma operación. No se reanudan automáticamente.
- Regla confirmada: durante la retención se conservan tiempo y vínculos de notas/eventos. No se admiten nuevos vínculos ni temporizadores sobre tareas eliminadas.
- Regla confirmada: a los 30 días se purgan automáticamente tareas y su tiempo y se desvinculan notas/eventos, sin otra confirmación. El aviso inicial debe explicar el efecto.
- Regla confirmada: tiempo retenido de tareas eliminadas excluido de totales desde la eliminación; sin nuevas entradas manuales.
- Confirmado: eventos con papelera recuperable de 30 días y posterior purga definitiva.
- Confirmado: enviar eventos a la papelera requiere confirmación.
- Confirmado: enviar notas a papelera requiere confirmación; restaurarlas las devuelve activas, incluso si estaban archivadas.
- Pendientes: presentación durante retención; precisión del plazo; restauración de eventos; asociaciones hacia registros retenidos. Las bajas de contactos, etiquetas, tiempo y finanzas ya están definidas en sus secciones.

### Operación local, backups y acceso

- Confirmado: backup consistente de SQLite y recuperación desde una copia. Reemplazar la base requiere confirmación.
- Confirmado: backups solo manuales desde app o CLI, sin programación automática. No se añaden exportaciones de dominio.
- Confirmado: carpeta estándar de datos del usuario del sistema operativo, configurable; servidor y CLI usan la misma ubicación mediante configuración compartida.
- Confirmado: frontend y REST accesibles por red local desde el inicio, además del equipo anfitrión. Esto no habilita publicación en Internet ni Tunnel en esta etapa.
- Confirmado: contraseña local de único propietario para navegador y REST, sin múltiples usuarios ni identidad externa. Localhost exige la misma autenticación, sin excepción.
- Confirmado: HTTPS obligatorio para acceso LAN, con creación y confianza de certificado local guiadas para los dispositivos usados; no requiere Internet.
- Confirmado: sin cifrado propio de SQLite ni backups; se usa protección del sistema operativo. Copias fuera del disco cifrado no quedan cifradas automáticamente.
- Regla confirmada: CLI autónoma sigue accediendo a SQLite sin pasar por la API; protegida por permisos del sistema operativo, no por sesión web.
- Confirmada: sesión web hasta cerrar el navegador como intención funcional, sin opción de acceso persistente entre sesiones. Sin máximo por antigüedad en servidor. No asumir detección fiable del cierre: algunos navegadores restauran sesiones; la implementación y comunicación de esta limitación quedan para diseño técnico.
- Confirmado: restablecer contraseña desde CLI local con permisos sobre los datos, sin conocer la anterior, e invalidar todas las sesiones web previas.
- Confirmado: carpeta de backups configurable con destino predeterminado fuera del directorio de datos activo; se permite elegir otro destino al crear la copia. Otra carpeta no implica otro disco.
- Confirmado: servidor manual por defecto, con inicio automático opcional mediante servicio de usuario. CLI funciona sin servidor.
- Confirmado: primera versión solo macOS, tanto servidor como CLI. Linux y Windows fuera del soporte inicial.
- Confirmado: acceso REST programático mediante contraseña local y sesión, sin tokens personales en primera versión.
- Confirmado: restauración solo con servidor detenido y sin otros procesos usando los datos; se bloquea mientras haya accesos activos, sin modo de mantenimiento de servidor en primera versión.
- Pendientes técnicos: transporte en localhost; ruta compartida y selección de interfaz/puerto LAN; implementación segura de sesiones y certificados.
- Propuesta técnica: comprobar validez y versión del backup antes de reemplazar, con acceso exclusivo.

## 5. Árbol completo de decisiones pendientes

Este árbol cubre el alcance local descrito. No representa decisiones ya tomadas ni detalles futuros de integraciones.

```text
App local
|
+-- A. Organización
|   +-- Cliente
|   |   +-- Nombre corto opcional y único [confirmado]
|   |   +-- Nombre completo único sin mayúsculas/acentos [confirmado]
|   |   +-- Nombre obligatorio, observaciones opcionales [confirmado]
|   |   +-- Nombre corto único sin mayúsculas/acentos [confirmado]
|   |   +-- Scope editable con confirmación [confirmado]
|   |   +-- Archivo reversible sin proyectos activos/pausados
|   |   +-- Borrar solo sin asociaciones [confirmado]
|   |   +-- Proyecto bajo archivado: reactivar cliente primero
|   |   +-- Vínculos opcionales a archivados: selección explícita
|   +-- Contacto
|   |   +-- Varios clientes o ninguno [confirmado]
|   |   +-- Nombre, un email/teléfono, observaciones [confirmado]
|   |   +-- Nombres duplicados permitidos [confirmado]
|   |   +-- Validación y filtros de scope
|   |   +-- Solo archivo reversible, sin eliminación [confirmado]
|   +-- Proyecto
|       +-- Activo/pausado/completado/archivado [confirmado]
|       +-- Descripción e inicio/fin opcionales [confirmado]
|       +-- Descripción Markdown y fechas planificadas [confirmado]
|       +-- Fechas planificadas solo día [confirmado]
|       +-- Fin anterior al inicio: permitir con aviso [confirmado]
|       +-- Nombre obligatorio único por cliente sin mayúsculas/acentos
|       +-- Cliente fijo en primera versión [confirmado]
|       +-- Impedir completar/archivar con tareas abiertas [confirmado]
|       +-- Crear/mover tarea abierta a proyecto cerrado: error [confirmado]
|       +-- Todo traslado exige destino activo/pausado [confirmado]
|
+-- B. Captura y trabajo
|   +-- Inbox global [confirmado]
|   |   +-- Título obligatorio y cuerpo opcional [confirmado]
|   |   +-- Eliminar al convertir [confirmado]
|   |   +-- Descartar elimina con confirmación [confirmado]
|   |   +-- Añadir a tarea/nota existente [confirmado]
|   |   +-- Editar título/cuerpo, sin adjuntos [confirmado]
|   |   +-- Editar combinación antes de guardar [confirmado]
|   |   +-- Conversión a registro nuevo y fallos
|   +-- Tarea, siempre con proyecto [confirmado]
|       +-- Nueva/en curso/bloqueada/en revisión/completada/cancelada
|       +-- Transiciones libres; confirmar reapertura [confirmado]
|       +-- Revisión opcional [confirmado]
|       +-- Motivo de bloqueo opcional [confirmado]
|       +-- Sin prioridad/baja/media/alta [confirmado]
|       +-- Sin prioridad por defecto [confirmado]
|       +-- Planificada y límite, hora opcional [confirmado]
|       +-- Planificar después del límite: permitir con aviso [confirmado]
|       +-- Zona actual del equipo [confirmado]
|       +-- Título obligatorio, Markdown opcional, crear siempre nueva
|       +-- Completar registra fecha/hora, reabrir limpia [confirmado]
|       +-- Reabrir en curso [confirmado]
|       +-- Ofrecer reactivar proyecto junto con tarea [confirmado]
|       +-- Referencias URLs con nombre opcional [confirmado]
|       +-- Subtareas incluidas, sin dependencias [confirmado]
|           +-- Varios niveles sin ciclos [confirmado]
|           +-- Mismo proyecto que padre [confirmado]
|           +-- Impedir completar padre con hijas abiertas [confirmado]
|           +-- Ofrecer cancelar descendientes abiertos [confirmado]
|           +-- Mover toda la rama con confirmación [confirmado]
|           +-- Ofrecer reabrir ancestros cerrados [confirmado]
|           +-- Separar conservando rama y proyecto [confirmado]
|           +-- Eliminar rama con confirmación, sin recuperación
|           +-- Detener temporizadores, retener tiempo/vínculos 30 días
|           +-- Purga automática elimina tiempo, conserva notas/eventos
|           +-- Tiempo excluido de totales desde eliminación [confirmado]
|           +-- Hija vinculada: separar y mover rama con confirmación
|           +-- Presentación durante retención
|           +-- Tiempo anterior sigue proyecto/cliente destino [confirmado]
|           +-- Traslado conserva vínculos explícitos de notas [confirmado]
|
+-- C. Conocimiento
|   +-- Nota
|   |   +-- Título generado si se omite [confirmado]
|   |   +-- Notas sin asociaciones permitidas [confirmado]
|   |   +-- Máximo un vínculo por tipo [confirmado]
|   |   +-- Contextos cruzados permitidos [confirmado]
|   |   +-- Basta título o contenido; no ambos vacíos [confirmado]
|   |   +-- Título generado estable al editar contenido [confirmado]
|   |   +-- Sin adjuntos iniciales [confirmado]
|   |   +-- FTS5 sobre título y contenido [confirmado]
|   |   +-- Vínculos explícitos separados del contexto derivado [confirmado]
|   |   +-- Scope por cualquier vínculo; libres solo Todos [confirmado]
|   |   +-- Archivo y búsqueda: acentos y términos parciales
|   +-- Etiqueta plana [confirmado]
|       +-- Nombre único ignorando mayúsculas/acentos [confirmado]
|       +-- Color opcional [confirmado]
|       +-- Tareas/notas/clientes/proyectos/contactos [confirmado]
|       +-- Sin etiquetas en Inbox/tiempo/finanzas [confirmado]
|       +-- Sin renombrar/fusionar/borrar iniciales [confirmado]
|       +-- Todas/cualquiera seleccionable [confirmado]
|       +-- Todas por defecto; ñ distinta de n [confirmado]
|       +-- Color fijo al crear [confirmado]
|       +-- Normalización de espacios y nombre no vacío
|
+-- D. Tiempo
|   +-- Tarea o proyecto, no cliente directo [confirmado]
|   +-- Carga manual con fecha y minutos [confirmado]
|   +-- Manual mínimo 1 minuto [confirmado]
|   +-- Varios temporizadores simultáneos [confirmado]
|   +-- Pausar cierra entrada, reanudar inicia otra [confirmado]
|   +-- Redondeo hacia arriba por entrada [confirmado]
|   +-- Solapamientos permitidos sin aviso [confirmado]
|   +-- Siguen tras cierre/reinicio [confirmado]
|   +-- Límite 12 h por intervalo continuo [confirmado]
|   +-- Cierre/guardado automático al límite [confirmado]
|   +-- Uno por tarea y uno directo por proyecto [confirmado]
|   +-- Dividir por día y redondear cada tramo [confirmado]
|   +-- Zona actual del equipo [confirmado]
|   +-- Cambio de zona conserva día de entradas guardadas [confirmado]
|   +-- Completar/cancelar detiene y guarda [confirmado]
|   +-- Completar/archivar proyecto detiene y guarda [confirmado]
|   +-- Tiempo manual en cerradas permitido, eliminadas no [confirmado]
|   +-- Tarea cerrada: ofrecer reabrir e iniciar [confirmado]
|   +-- Manual directo en proyectos cerrados permitido [confirmado]
|   +-- Mover rama detiene/guarda temporizadores [confirmado]
|   +-- Editar fecha/minutos/destino, borrar con confirmación
|   +-- Proyecto cerrado: ofrecer reactivar e iniciar con confirmación
|   +-- Tiempo de tareas eliminadas solo consultable [confirmado]
|
+-- E. Finanzas
|   +-- Income/expense y COP predeterminado [confirmado]
|   +-- Asociación opcional a cliente/proyecto [confirmado]
|   +-- COP entero, sin mostrar código COP [confirmado]
|   +-- Tasas manuales por movimiento [confirmado]
|   +-- Tasa pendiente: excluir de total COP y avisar [confirmado]
|   +-- Tasa COP por unidad original [confirmado]
|   +-- Redondear por movimiento al peso cercano, 0,5 sube [confirmado]
|   +-- Editar tasa con confirmación, recalcular totales [confirmado]
|   +-- Importe positivo entero en toda moneda, concepto opcional
|   +-- Fecha solo día [confirmado]
|   +-- Editar campos, borrar definitivo con confirmación [confirmado]
|   +-- Tasa positiva hasta dos decimales [confirmado]
|   +-- Original y equivalente, o conversión pendiente [confirmado]
|   +-- Fecha obligatoria, hoy por defecto editable [confirmado]
|   +-- Sin etiquetas ni categorías iniciales [confirmado]
|   +-- Reembolso tipo opuesto independiente [confirmado]
|   +-- Solo COP y USD [confirmado]
|   +-- Cambiar moneda limpia tasa; USD queda pendiente [confirmado]
|   +-- Solo totales en pesos, sin subtotales por moneda [confirmado]
|
+-- F. Vistas
|   +-- Hoy
|   |   +-- Manual persistente + automática [confirmado]
|   |   +-- Planificadas hoy/antes, vencen hoy/vencidas, en curso
|   |   +-- Solo abiertas, sin duplicados
|   |   +-- Bloqueadas/revisión en secciones separadas [confirmado]
|   |   +-- Ambos scopes por defecto y filtro [confirmado]
|   |   +-- En curso primero, luego prioridad/límite [confirmado]
|   |   +-- Proyectos pausados incluidos [confirmado]
|   |   +-- Lista plana con ruta de ancestros [confirmado]
|   |   +-- Filtros cliente/proyecto [confirmado]
|   |   +-- Desempate y horas: propuesta de diseño
|   +-- Calendario
|   |   +-- Eventos locales independientes [confirmado]
|   |   +-- Planificación y límite diferenciados [confirmado]
|   |   +-- Arrastre solo cambia planificación [confirmado]
|   |   +-- Zona actual del equipo [confirmado]
|   |   +-- Eventos sin vínculo/cliente/proyecto/tarea [confirmado]
|   |   +-- Varios días con hora o día completo [confirmado]
|   |   +-- Título obligatorio, Markdown opcional [confirmado]
|   |   +-- Papelera recuperable 30 días, después purga [confirmado]
|   |   +-- Duración cero permitida, sin notificaciones [confirmado]
|   |   +-- Último día inclusivo; confirmar envío a papelera [confirmado]
|   |   +-- Sin recordatorios iniciales [confirmado]
|   |   +-- Cerradas: conteo diario pulsable, sin tarjetas [confirmado]
|   |   +-- Rangos, marcadores, deduplicación y cambio de zona
|   +-- Actividad
|   |   +-- Notas/etiquetas/capturas, tiempo, finanzas/eventos [confirmado]
|   |   +-- Sin tareas/proyectos/clientes/contactos en vista [confirmado]
|   |   +-- Resumen y detalle antes/después desplegable [confirmado]
|   |   +-- Retención un año, purga automática [confirmado]
|   |   +-- Filtros por fecha y tipo [confirmado]
|   |   +-- Markdown largo, bajas y agrupación de entradas
|   +-- Búsqueda
|       +-- Notas/tareas/proyectos/clientes/contactos/eventos [confirmado]
|       +-- Sin Inbox/tiempo/finanzas en global [confirmado]
|       +-- Sin distinguir mayúsculas/acentos, palabras/prefijos
|       +-- Archivados y tareas cerradas fuera por defecto, filtro
|       +-- Nombres/títulos/descripciones/observaciones [confirmado]
|       +-- Todos los términos, incluso en campos distintos [confirmado]
|       +-- Ranking y filtros adicionales: propuesta de diseño
|
+-- G. Operación local
    +-- CLI autónoma y servicios compartidos [confirmado]
    +-- Servidor y CLI solo macOS en primera versión [confirmado]
    +-- Ruta estándar configurable compartida [confirmado]
    +-- Acceso simultáneo CLI/servidor y exclusión al recuperar
    +-- Identificadores, timestamps y migraciones
    +-- Tareas irrecuperables, retención 30 días [confirmado]
    +-- Notas: papelera recuperable 30 días [confirmado]
    +-- Cliente/proyecto: borrar solo sin asociaciones [confirmado]
    +-- Tiempo de eliminadas fuera de totales [confirmado]
    +-- Presentación durante retención y bajas de otras entidades
    +-- Backup/recuperación manuales [confirmado]
    +-- LAN desde inicio [confirmado]
    +-- Contraseña de propietario, también localhost [confirmado]
    +-- HTTPS obligatorio LAN [confirmado]
    +-- Protección SO, sin cifrado propio base/backups [confirmado]
    +-- Sesión hasta cerrar navegador [confirmado]
    +-- Reset contraseña vía CLI invalida sesiones [confirmado]
    +-- Backups carpeta configurable, destino por copia [confirmado]
    +-- Arranque manual, servicio usuario opcional [confirmado]
    +-- REST con contraseña/sesión, sin tokens personales [confirmado]
    +-- Certificado local con configuración guiada [confirmado]
    +-- Restaurar con servidor detenido y sin accesos activos [confirmado]
    +-- Sesiones sin máximo por antigüedad [confirmado]
    +-- Sin exportación ni recurrencia [confirmado]
```

## 6. Registro de preguntas y respuestas

### Ronda 1, confirmada

| Pregunta | Respuesta |
|---|---|
| Nombre corto del cliente | Opcional, único cuando exista. |
| Cambio de scope del cliente | Permitido con confirmación; afecta a proyectos y tareas existentes. |
| Estados de proyecto | Activo, pausado, completado y archivado. |
| Contenido de captura | Título obligatorio y cuerpo opcional. |

### Ronda 2, confirmada

| Pregunta | Respuesta |
|---|---|
| Revisión de tareas | Opcional. |
| Estados de tarea | Nueva, en curso, bloqueada, en revisión, completada y cancelada. El usuario corrigió "pendiente" por "nueva". |
| Fechas de tarea | Planificada y límite separadas, con hora opcional. |
| Proyecto con tareas abiertas | Impedir tanto completar como archivar. |

### Ronda 3, confirmada

| Pregunta | Respuesta |
|---|---|
| Transiciones | Libres, con confirmación al reabrir completadas o canceladas. |
| Motivo de bloqueo | Opcional. |
| Prioridades | Sin prioridad, baja, media y alta. |
| Estructura | Solo subtareas, sin dependencias en primera versión. |

### Ronda 4, confirmada

| Pregunta | Respuesta |
|---|---|
| Profundidad de subtareas | Varios niveles, sin ciclos. |
| Proyecto de subtareas | El mismo que su padre. |
| Completar padre con subtareas abiertas | Impedir completar. |
| Reabrir tarea de proyecto completado/archivado | Ofrecer reactivar proyecto junto con tarea en una operación confirmada. |

### Ronda 5, confirmada

| Pregunta | Respuesta |
|---|---|
| Cancelar padre con subtareas abiertas | Ofrecer cancelar descendientes abiertos conjuntamente o abortar; conservar estados de los ya cerrados. |
| Mover tarea con subtareas | Mover toda la rama con confirmación. |
| Reabrir subtarea bajo ancestros cerrados | Ofrecer reabrir también los ancestros y reactivar proyecto si corresponde. |
| Prioridad por defecto | Sin prioridad. |

### Ronda 6, confirmada

| Pregunta | Respuesta |
|---|---|
| Estado al reabrir tareas y ancestros | En curso. |
| Separar subtarea | Permitido, conservando rama, datos y proyecto. |
| Crear/mover tarea abierta a proyecto cerrado | Prohibido: no mostrar completados/archivados en el selector y devolver error si se intenta. |
| Tiempo previo al mover tarea | Cambia al nuevo proyecto y cliente. |

### Ronda 7, confirmada

| Pregunta | Respuesta |
|---|---|
| Título de nota | Generarlo desde primer encabezado o línea si se omite. |
| Notas libres | Permitidas, sin vínculos obligatorios. |
| Cardinalidad de vínculos | Máximo uno por tipo: cliente, proyecto, tarea y contacto. |
| Contextos cruzados | Permitidos sin restricción, incluso entre work y personal. |

### Ronda 8, confirmada

| Pregunta | Respuesta |
|---|---|
| Contenido vacío | Permitido con título; nunca título y contenido ambos vacíos. |
| Título generado al editar contenido | Conservarlo; cambios solo por edición explícita. |
| Adjuntos de notas | Sin adjuntos por ahora. |
| Campos de búsqueda FTS5 | Título y contenido. |

### Ronda 9, confirmada

| Pregunta | Respuesta |
|---|---|
| Unicidad de etiquetas | Ignorar mayúsculas y acentos. |
| Entidades adicionales | Clientes, proyectos y contactos; no Inbox, tiempo ni movimientos financieros. |
| Color | Opcional. |
| Filtros por varias etiquetas | Elegir todas o cualquiera; modo por defecto pendiente. |

### Ronda 10, confirmada

| Pregunta | Respuesta |
|---|---|
| Destino de tiempo | Tarea o proyecto; no cliente directo. |
| Temporizadores simultáneos | Varios. |
| Pausas | Cerrar entrada al pausar; intervalos independientes y redondeados por separado. |
| Solapamientos | Permitidos sin aviso. |

### Ronda 11, confirmada

| Pregunta | Respuesta |
|---|---|
| Carga manual | Fecha y minutos. |
| Persistencia | Seguir contando con límite de 12 horas; alcance y comportamiento del límite pendientes. |
| Completar/cancelar tarea | Detener sus temporizadores y guardar el tiempo. |
| Duplicidad de temporizadores | No sobre la misma tarea; duplicidad sobre proyecto aún pendiente. |

### Ronda 12, confirmada

| Pregunta | Respuesta |
|---|---|
| Unidad del límite de 12 horas | Cada intervalo continuo. |
| Al alcanzar el límite | Cerrar y guardar automáticamente; si la app estaba cerrada, materializar al volver con final efectivo al límite. |
| Temporizadores directos por proyecto | Uno corriendo por proyecto. |
| Cruce de medianoche | Dividir por día y redondear cada tramo. |

### Ronda 13, confirmada

| Pregunta | Respuesta |
|---|---|
| Asociaciones financieras | Opcionales: sin asociar, cliente o proyecto. |
| Categorías financieras | Sin categorías por ahora. |
| COP | Solo pesos enteros. |
| Totales con varias monedas | Convertir con tasas manuales por movimiento. |

### Ronda 14, confirmada

| Pregunta | Respuesta |
|---|---|
| Tasa obligatoria | Puede quedar pendiente; excluir del total COP e indicar movimientos sin convertir. |
| Orientación de tasa | COP por unidad de moneda original. |
| Redondeo del equivalente | Al peso más cercano por movimiento, 0,5 hacia arriba. |
| Editar tasa | Con confirmación; recalcula equivalente y totales, incluidos períodos anteriores. |

### Ronda 15, confirmada

| Pregunta | Respuesta |
|---|---|
| Composición de Hoy | Selección manual y reglas automáticas. |
| Reglas automáticas | Planificadas hoy, planificadas antes, vencen hoy/vencidas y en curso; solo tareas abiertas. |
| Bloqueadas y en revisión | En secciones separadas cuando cumplen criterios. |
| Selección manual entre días | Mantener hasta quitarla o cerrar la tarea. |

### Ronda 16, confirmada

| Pregunta | Respuesta |
|---|---|
| Scope de Hoy | Ambos por defecto, filtro disponible. |
| Orden | En curso primero, luego prioridad y límite; bloqueadas/revisión por prioridad y límite. |
| Proyectos pausados | Incluir igual que los demás. |
| Subtareas | Lista plana con ruta de ancestros como contexto. |

### Ronda 17, confirmada

| Pregunta | Respuesta |
|---|---|
| Eventos locales | Incluidos, independientes de tareas. |
| Fechas visibles de tareas | Planificada y límite, diferenciadas. |
| Arrastre de tarea | Siempre cambia fecha planificada, no límite. |
| Zona horaria | Siempre la zona actual del equipo, para Calendario, Hoy y división diaria. |

### Ronda 18, confirmada

| Pregunta | Respuesta |
|---|---|
| Asociaciones de eventos | Opcionales: cliente, proyecto o tarea, o sin vínculo. |
| Eventos de varios días | Permitidos con hora y de día completo. |
| Recordatorios | Fuera de primera versión. |
| Tareas cerradas en calendario | Solo indicadores: conteo por día sin tarjetas; pulsar abre lista. Aclarado mediante pregunta adicional. |

### Ronda 19, confirmada

| Pregunta | Respuesta |
|---|---|
| Acciones incluidas | Notas, etiquetas y capturas; tiempo; finanzas y eventos. No seleccionado el grupo tareas/proyectos/clientes/contactos. |
| Detalle | Resumen y detalle desplegable con valores anteriores/nuevos. |
| Retención | Un año, con purga automática de entradas anteriores. |
| Filtros | Fecha y tipo de registro. |

### Ronda 20, confirmada tras repetir preguntas

| Pregunta | Respuesta |
|---|---|
| Captura procesada | Eliminar al convertir. |
| Descarte | Eliminar definitivamente con confirmación. |
| Añadir a registros existentes | Permitido para tareas y notas. |
| Edición y adjuntos | Editar título/cuerpo, sin adjuntos. |

### Ronda 21, confirmada

| Pregunta | Respuesta |
|---|---|
| Combinar captura con registro existente | Editar antes de guardar, mostrando contenido existente y captura. |
| Clientes por contacto | Varios. |
| Campos de contacto | Nombre obligatorio; un email, un teléfono y observaciones opcionales. |
| Contactos sin cliente | Permitidos. |

### Ronda 22, confirmada

| Pregunta | Respuesta |
|---|---|
| Nombre de proyecto | Obligatorio, único dentro del cliente ignorando mayúsculas y acentos. |
| Cambiar cliente de proyecto | No en primera versión. |
| Campos de proyecto | Descripción y fechas de inicio/fin opcionales. |
| Duplicados de nombre completo de cliente | No permitidos, ignorando mayúsculas y acentos. |

### Ronda 23, confirmada

| Pregunta | Respuesta |
|---|---|
| Campos de cliente | Nombre completo obligatorio, observaciones opcionales. |
| Unicidad de nombre corto | Ignorar mayúsculas y acentos. |
| Fechas de proyecto | Planificación manual; cambios de estado no las modifican. |
| Descripciones de tareas/proyectos | Markdown en ambas. |

### Ronda 24, confirmada

| Pregunta | Respuesta |
|---|---|
| Entidades adicionales a notas | Tareas, proyectos, clientes, contactos y eventos locales; no Inbox, tiempo ni finanzas. |
| Mayúsculas y acentos | Ignorar ambos. |
| Coincidencias | Palabras y prefijos. |
| Archivados y tareas cerradas | Excluir por defecto, filtro para incluir. |

### Ronda 25, confirmada

| Pregunta | Respuesta |
|---|---|
| Tareas/notas | Papelera durante 30 días; después borrado definitivo. |
| Borrar cliente/proyecto | Solo sin asociaciones. |
| Eliminar tarea con subtareas | Eliminar toda la rama con confirmación. |
| Borrado definitivo de tarea vinculada | Borrar también su tiempo; conservar notas/eventos y quitar vínculo, con confirmación. |

### Ronda 26, confirmada

| Pregunta | Respuesta |
|---|---|
| Temporizadores al eliminar tareas | Detener y guardar el tiempo. |
| Tiempo y vínculos durante retención | Conservar hasta purga; sin nuevos vínculos ni temporizadores. |
| Recuperar tareas | No se pueden recuperar. Sustituye restauración de tareas de ronda 25. |
| Purga automática | Misma limpieza a los 30 días sin nueva confirmación; aviso inicial. |
| Aclaración sobre notas | Las notas sí se pueden recuperar durante sus 30 días de papelera. |

### Ronda 27, confirmada

| Pregunta | Respuesta |
|---|---|
| Tiempo retenido en totales | Excluir desde la eliminación. |
| Tiempo manual en tareas eliminadas | No permitido. |
| Tiempo manual en completadas/canceladas | Permitido en ambas, sin reabrir. |
| Cierre de proyecto con temporizador directo | Detener y guardar el tiempo. |

### Ronda 28, confirmada

| Pregunta | Respuesta |
|---|---|
| Temporizador en tarea cerrada | Ofrecer reabrir tarea/ancestros y reactivar proyecto si aplica e iniciar, con confirmación. |
| Manual directo en proyecto cerrado | Permitido en completados y archivados. |
| Mover con temporizadores activos | Detener y guardar; tiempo pasa al destino. |
| Entradas guardadas | Editar fecha/minutos/destino; borrar definitivamente con confirmación. |

### Ronda 29, confirmada

| Pregunta | Respuesta |
|---|---|
| Backup y recuperación | Incluidos; copia consistente de SQLite y confirmación para reemplazar base. |
| Crear backups | Solo manualmente, desde app/CLI. |
| Carpeta de datos | Estándar del sistema operativo, configurable, compartida CLI/servidor. |
| Acceso frontend/REST | Red local desde inicio; seguridad pendiente. |

### Ronda 30, confirmada

| Pregunta | Respuesta |
|---|---|
| Autenticación | Contraseña local de único propietario para navegador/REST. |
| Localhost | Misma protección, sin excepción; CLI directa no usa sesión API. |
| Transporte LAN | HTTPS obligatorio; certificados por diseñar. |
| Base y backups | Protección del sistema operativo, sin cifrado propio de app. |

### Ronda 31, confirmada

| Pregunta | Respuesta |
|---|---|
| Sesión web | Hasta cerrar navegador; vencimiento técnico y restauración del navegador pendientes. |
| Recuperar contraseña | CLI local, invalidando sesiones anteriores. |
| Destino backups | Carpeta configurable con predeterminado fuera de datos activos y destino alternativo por copia. |
| Arranque servidor | Manual por defecto, automático opcional mediante servicio de usuario. |

### Ronda 32, confirmada

| Pregunta | Respuesta |
|---|---|
| Título y descripción | Título obligatorio, descripción opcional. |
| Estado inicial | Siempre nueva, también al convertir Inbox. |
| Referencias externas | URLs con nombre opcional; sin acceso automático a proveedores. |
| Fecha de finalización | Completar registra fecha/hora; reabrir limpia; planificación y límite no cambian. |

### Ronda 33, confirmada

| Pregunta | Respuesta |
|---|---|
| Archivado cliente | Reversible. |
| Cliente con proyectos activos/pausados | Impedir archivar hasta completarlos o archivarlos. |
| Archivado notas | Reversible, separado de papelera; sin iniciar purga. |
| Baja contactos | Solo archivar, sin eliminación individual. |

### Ronda 34, confirmada

| Pregunta | Respuesta |
|---|---|
| Proyecto bajo cliente archivado | Exigir reactivar cliente primero. |
| Nuevos vínculos a clientes/contactos archivados | Permitidos mediante selección explícita; ocultos por defecto. |
| Renombrar/fusionar etiquetas | Ninguna operación en primera versión. |
| Borrar etiquetas | No permitido. |

### Ronda 35, confirmada

| Pregunta | Respuesta |
|---|---|
| Ñ y N | Distinguir en búsqueda y unicidad. |
| Filtro de etiquetas inicial | Todas (AND). |
| Scope al crear cliente | Elegir siempre, sin predeterminado; también CLI. |
| Color de etiqueta | Fijo al crear, incluida ausencia; sin edición. |

### Ronda 36, confirmada

| Pregunta | Respuesta |
|---|---|
| Campos mínimos | Importe mayor que cero, concepto opcional. |
| Fecha financiera | Solo día. |
| Precisión de otras monedas | Solo unidades enteras, igual que COP. La precisión de tasa sigue pendiente. |
| Edición y eliminación | Editar campos; borrado definitivo con confirmación y recálculo. Tasa mantiene confirmación específica. |

### Ronda 37, confirmada

| Pregunta | Respuesta |
|---|---|
| Importes visibles | Original y equivalente en pesos, o conversión pendiente sin tasa. |
| Fecha | Obligatoria, hoy por defecto y editable. |
| Reembolsos | Movimiento del tipo opuesto independiente, sin vínculo. |
| Tasa | Positiva, hasta dos decimales. |

### Ronda 38, confirmada

| Pregunta | Respuesta |
|---|---|
| Precisión de fechas de proyecto | Solo día. |
| Planificación posterior al límite de tarea | Permitir con aviso. |
| Campos de evento | Título obligatorio y descripción Markdown opcional. |
| Baja de eventos | Papelera recuperable de 30 días; después purga definitiva. |

### Ronda 39, confirmada

| Pregunta | Respuesta |
|---|---|
| Fin planificado de proyecto anterior al inicio | Permitir con aviso. |
| Duración cero de eventos con hora | Permitida como marcador simple, sin complicaciones ni notificaciones. |
| Último día de evento de día completo | Inclusivo. |
| Enviar evento a papelera | Con confirmación. |

El usuario pide reducir las vueltas sobre calendario/eventos y responder exclusivamente mediante `ask_user_question`. Los detalles técnicos y menores de presentación se resolverán en la propuesta de diseño, sin tratarlos como acuerdos nuevos ni ampliar el alcance.

### Ronda 40, confirmada

| Pregunta | Respuesta |
|---|---|
| Sistemas operativos iniciales | Solo macOS, servidor y CLI. |
| Mover subtarea con padre a otro proyecto | Separar y mover con sus descendientes, con confirmación. |
| Trasladar rama cerrada a proyecto cerrado | Exigir reactivar el destino primero, también si todas las tareas están cerradas. |
| Catálogo de monedas | Solo COP y USD. |

### Ronda 41, confirmada

| Pregunta | Respuesta |
|---|---|
| Cambiar moneda COP/USD | Limpiar tasa anterior; USD queda pendiente hasta nueva tasa, COP no usa tasa. |
| Subtotales por moneda | No; solo total en pesos y aviso de conversiones pendientes. |
| Temporizador directo en proyecto cerrado | Ofrecer reactivar e iniciar con confirmación. |
| Nombres de contactos duplicados | Permitidos. |

### Ronda 42, confirmada

| Pregunta | Respuesta |
|---|---|
| Scope de notas | Coincidencia en cualquier vínculo; transversales en ambos, libres solo Todos. |
| Vincular nota a tarea | No añade proyecto/cliente explícitos; solo muestra contexto derivado. |
| Scope de contactos | Según clientes; libres solo Todos, clientes de ambos scopes en ambos filtros. |
| Buscar proyectos completados | Excluir por defecto, con filtro para incluir. |

### Ronda 43, confirmada

| Pregunta | Respuesta |
|---|---|
| Tiempo manual mínimo | Al menos 1 minuto. |
| Tiempo ligado a tarea eliminada | Solo consulta durante retención; sin edición/traslado/borrado individual. |
| Notas al trasladar tarea | Conservan vínculos explícitos; cambia solo contexto derivado de tarea. |
| Completada pasa a cancelada | Conserva fecha de última finalización. |

### Ronda 44, confirmada

| Pregunta | Respuesta |
|---|---|
| Acceso REST programático | Contraseña y sesión, sin tokens personales. |
| HTTPS LAN | Certificado local con creación/confianza guiadas. |
| Restauración | Servidor detenido y ningún proceso usando los datos. |
| Máximo de sesión en servidor | Sin máximo por tiempo; reset de contraseña invalida sesiones. |

### Ronda 45, confirmada

| Pregunta | Respuesta |
|---|---|
| Zona y entradas de tiempo guardadas | Conservar el día guardado, sin redistribuir histórico. |
| Enviar nota a papelera | Con confirmación. |
| Restaurar nota previamente archivada | Vuelve activa. |
| Tareas de proyectos archivados en búsqueda | Ocultas por contexto por defecto; filtro para incluir archivados. |

### Ronda 46, confirmada

| Pregunta | Respuesta |
|---|---|
| Campos de búsqueda | Nombres, títulos, descripciones y observaciones de entidades incluidas; notas mantienen título/contenido. |
| Varios términos | Exigir todos, aunque coincidan en campos distintos del mismo registro. |
| Filtros de Hoy | Cliente y proyecto, además de scope. |
| Siguiente etapa | Revisión final del alcance; detalles menores como propuestas de diseño, sin implementación. |

Las rondas generales de producto terminan aquí por decisión del usuario. Los detalles no resueltos siguen pendientes o propuestos, no se consideran aprobados. Ver [revisión final](revision-alcance-local.md).
