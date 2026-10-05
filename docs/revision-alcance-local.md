# Revisión final del alcance local

Las rondas generales de preguntas terminan tras la ronda 46. El usuario autorizó consolidar el alcance y llevar los detalles menores a una propuesta de diseño, no empezar a implementar. La fuente detallada sigue siendo [alcance local](alcance-local.md).

## Producto confirmado

Una app personal, local y funcional sin Internet, para macOS. Angular + NestJS + SQLite + Drizzle. NestJS sirve frontend y REST; la CLI es autónoma y comparte casos de uso y datos, sin depender del servidor.

| Área | Qué incluye |
|---|---|
| Organización | Clientes work/personal, proyectos de un cliente fijo y contactos con varios clientes o ninguno. |
| Trabajo | Tareas con proyecto obligatorio, seis estados, prioridad opcional, planificación y límite separados, subtareas multinivel y URLs. |
| Captura | Inbox global; crear tarea/nota, añadir a existente o descartar. |
| Conocimiento | Notas Markdown libres o con vínculos explícitos independientes; etiquetas planas e inmutables. |
| Tiempo | Carga manual y temporizadores persistentes simultáneos, con límite de 12 horas por intervalo. |
| Finanzas | Ingresos/gastos COP o USD, unidades enteras, tasas manuales y totales solo en pesos. |
| Vistas | Hoy, Calendario, Actividad y búsqueda global. |
| Operación | Contraseña local, HTTPS LAN guiado, backups manuales y recuperación con servidor detenido. |

## Relaciones y reglas que no deben romperse

- Cliente → proyecto → tarea. Proyecto y tarea heredan scope; mover tareas cambia también la atribución de su tiempo anterior.
- Padre e hijas siempre comparten proyecto. Trasladar una hija a otro proyecto la separa y mueve su rama con confirmación.
- Ningún traslado admite destino completado/archivado, aunque toda la rama esté cerrada. Hay que reactivar el destino primero.
- Completar o archivar un proyecto exige no tener tareas abiertas. Archivar cliente exige no tener proyectos activos/pausados.
- Crear/reactivar proyecto bajo cliente archivado exige reactivar primero al cliente. Las ofertas de reapertura de tarea/temporizador no eluden esa restricción.
- Completar padre exige resolver hijas abiertas. Cancelar padre ofrece cancelar descendientes abiertos o abortar. Reabrir ofrece reabrir ancestros cerrados y reactivar proyecto con confirmación.
- Completar registra fecha de finalización; reabrir la limpia. Pasar completada a cancelada conserva la última fecha de finalización.
- Notas pueden tener un vínculo por tipo y cruzar contextos. Vincular tarea no crea vínculos explícitos a proyecto/cliente. Trasladar tarea no modifica esos vínculos propios de la nota.
- Eventos tienen un único contexto opcional: cliente, proyecto o tarea. El proyecto/cliente derivados de una tarea vinculada siguen a esa tarea.
- Cliente y proyecto solo se borran sin asociaciones. No existe eliminación en cascada de esas entidades.

## Fechas, tiempo y dinero

| Caso | Regla confirmada |
|---|---|
| Proyecto | Inicio/fin planificados opcionales, solo día; fin anterior a inicio permitido con aviso. |
| Tarea | Planificación/límite opcionales con hora opcional; planificación posterior al límite permitida con aviso. |
| Evento | Título obligatorio y Markdown opcional; uno/varios días; duración cero permitida con hora, sin notificaciones. Último día inclusivo en día completo. |
| Tiempo manual | Fecha y minutos, mínimo 1 minuto; permitido en tareas/proyectos cerrados no eliminados. |
| Temporizador | Uno por tarea y uno directo por proyecto; pausar cierra entrada y reanudar inicia otro intervalo. Solapamientos permitidos. |
| Redondeo | Cada tramo diario se redondea hacia arriba. Medianoche divide el intervalo pero no reinicia el límite de 12 horas. |
| Cierre/traslado | Detiene y guarda temporizadores afectados, sin reinicio automático. |
| Zona | Zona actual del equipo para vistas y nuevos tramos; los días del tiempo ya guardado no se redistribuyen. |
| Finanzas | Importe positivo entero COP/USD; fecha obligatoria, hoy por defecto; concepto opcional. |
| Conversión | COP por unidad USD, tasa positiva hasta dos decimales; sin tasa, fuera del total y aviso. Equivalente redondeado por movimiento, 0,5 sube. |
| Cambios financieros | Cambiar moneda limpia tasa. Editar tasa requiere confirmación y recalcula períodos anteriores. Reembolsos independientes del tipo opuesto. |

## Vistas y alcance de búsqueda

- Hoy incluye tareas abiertas seleccionadas manualmente o que cumplen reglas automáticas. Selección manual persiste hasta retirarla o cerrar la tarea. En curso primero, luego prioridad y límite; bloqueadas/revisión en secciones separadas. Filtros scope, cliente y proyecto.
- Calendario distingue planificación y límite. Arrastrar cambia solo planificación. Tareas cerradas aparecen como conteos diarios pulsables, no tarjetas.
- Actividad incluye notas/etiquetas/capturas, tiempo, finanzas y eventos, con valores antes/después y retención de un año. No incluye acciones de tareas/proyectos/clientes/contactos.
- Búsqueda incluye notas/tareas/proyectos/clientes/contactos/eventos, no Inbox/tiempo/finanzas. Nombres, títulos, descripciones y observaciones; notas en título y contenido. Todos los términos deben coincidir, aunque estén en campos distintos del mismo registro.
- Búsqueda y unicidad ignoran mayúsculas y acentos vocálicos, pero distinguen ñ/n. Coincidencias por palabra/prefijo, no fragmento interno arbitrario.
- Archivados, proyectos completados y tareas cerradas excluidos de búsqueda por defecto, con filtro para incluir. Tareas en proyectos archivados también se excluyen por contexto.
- Notas filtran scope por cualquier vínculo; transversales en ambos, libres solo Todos. Contactos según sus clientes; libres solo Todos.

## Bajas y recuperación

| Registro | Política |
|---|---|
| Tareas | Irrecuperables. Rama retenida 30 días; tiempo excluido de totales inmediatamente y solo consultable. Purga elimina tiempo y desvincula notas/eventos sin borrarlos. |
| Notas | Archivo reversible separado de papelera; papelera confirmada y recuperable 30 días. Restaurar vuelve activa incluso si estaba archivada. |
| Eventos | Papelera confirmada, recuperable 30 días y posterior purga definitiva. |
| Contactos | Solo archivo reversible, sin eliminación individual. |
| Etiquetas | Sin renombrar/fusionar/borrar; color fijo al crear. Se pueden quitar asignaciones. |
| Tiempo/finanzas | Borrado individual definitivo confirmado; tiempo ligado a tareas eliminadas no admite cambios individuales. |

## Resultado de la revisión de coherencia

No se identificó una contradicción de dominio que exija otra ronda general. Hay excepciones importantes que la implementación debe respetar:

- Retención no significa recuperación para tareas; sí para notas/eventos. La ronda 26 sustituye el acuerdo inicial de tareas de la ronda 25.
- Duración cero de evento no introduce recordatorios ni notificaciones.
- Vínculos explícitos de nota no son su contexto derivado; pueden diferir sin ser un error.
- La edición general de tiempo no se aplica al tiempo retenido de tareas eliminadas.
- La zona actual afecta presentación y nuevos tramos, no redistribuye tiempo histórico ya guardado.
- Búsqueda exige Todos para palabras; el selector Todas/Cualquiera confirmado es para etiquetas, no para términos de búsqueda.

La sesión web requiere una advertencia de diseño: cerrar el navegador no garantiza invalidación en servidor y algunos navegadores restauran cookies de sesión. Se confirmó no tener máximo por antigüedad; no se debe prometer una garantía de cierre que el navegador no ofrece. Reset de contraseña invalida sesiones.

## Detalles propuestos, no aprobados

Estas recomendaciones reducen preguntas menores. No son nuevos acuerdos de producto.

| Área | Propuesta para revisar en diseño |
|---|---|
| Inbox | Permitir ajustar contenido también al crear destino nuevo. Guardar destino y eliminar captura en una transacción; si falla, conservar captura. |
| Validaciones | Recortar espacios exteriores; rechazar nombres obligatorios vacíos. Validar sintaxis de email/URL sin consultar proveedores y conservar teléfono como texto. |
| Restauración | Conservar vínculos que aún existan; no reconstruir vínculos eliminados por purga. No ampliar restauración a tareas. |
| Retención | Precisar límites de 30 días/un año y ejecutar purgas idempotentes al abrir o mediante servidor activo. |
| Hoy | Incluir todas las horas del día; desempate estable después de prioridad/límite. |
| Calendario | Deduplicar conteos por tarea/día, mostrar marcadores distintos y no inventar duración de tarea. |
| Actividad | Detalle Markdown expandible; preservar identificación de registros eliminados y agrupar acciones compuestas sin añadir event sourcing. Precisar si el historial conserva contenido tras purga de dominio. |
| Búsqueda | Definir ranking estable y no añadir filtros o campos nuevos sin indicarlo. |
| Tiempo editado | Conservar procedencia cronometrada sin recalcular silenciosamente los minutos corregidos. Precisar cambio de zona durante un intervalo aún abierto y tramos de duración exactamente cero. |

## Siguiente etapa

Preparar una propuesta técnica separada: esquema Drizzle, servicios compartidos, contratos REST/CLI, fechas y aritmética exacta, concurrencia SQLite, sesiones/certificados, backups/purgas y pruebas de invariantes. Identificadores técnicos y campos auxiliares siguen sin aprobación.

No se implementó código ni se ejecutaron pruebas funcionales. Los checks de esta etapa validan documentación, no funcionamiento de la app.

Fuera de esta versión: sincronización, integraciones, MCP, recurrencia, exportación de dominio, RAG, adjuntos, notificaciones, múltiples usuarios, tokens personales, Linux/Windows y cifrado propio de base/backups.
