# Diseño UI con Stitch

Diseñar Bitnode con Stitch fuera de esta sesión. Dirección elegida por el usuario: oscura y compacta. Ya se generaron pantallas de Hoy y se ajustaron mediante prompts y revisión de capturas. El diseño está en curso, sin aprobación final ni implementación Angular. Stitch no está conectado aquí.

## Estado del diseño

Los prompts se acotan a una pantalla para avanzar en el diseño de la app, no como una etapa de experimentos independiente. La descripción anterior de este trabajo como "solo pruebas" fue una interpretación equivocada del asistente, aclarada por el usuario. Tema oscuro compacto, acento verde y navegación lateral del escritorio están aprobados como base de trabajo. La composición final, medidas y estados de cada pantalla siguen pendientes de revisión.

Proyecto compartido: `16570682568620864378`. Pantalla compartida: `9aadb28a8d7c4d6f87e1fd280098e969`. No se pudo visualizar directamente mediante el enlace; la revisión se hizo sobre capturas locales. No asumir que todas las variantes posteriores tienen ese mismo ID.

| Iteración de Hoy | Resultado observado |
|---|---|
| Hoy vacío | Interpretó el tema y filtros, pero inventó cifrado, ruta SQLite y sprint; exceso de espacio vacío. |
| Hoy con tareas en formato estrecho | Separó principal/bloqueadas/revisión y fechas; inventó restricción de temporizador para bloqueadas y referencia a Tech Lead. |
| Corrección de formato y reglas | Pasó a escritorio con sidebar y habilitó temporizadores en bloqueadas. Conservó parte del contenido ajeno y añadió explicaciones visibles de las reglas. |
| Cuatro cambios puntuales | Quitó ruta/version/indicador técnico, Tech Lead y explicaciones de temporizadores. Conservó botones, pero no separó encabezados de fechas. |
| Corrección con medidas explícitas | Separó Planificada/Límite visualmente en las tres tablas. Aumentó truncamiento de títulos/motivos; la resolución de exportación cambió. No se verificaron medidas exactas ni CSS. |

## Acuerdos de producto posteriores

P1–P6 y P8–P12 del [diseño técnico](diseno-tecnico-local.md#preguntas-finales) ya están respondidas. Mantener hora Colombia, enlaces repetidos permitidos, búsqueda alfabética, Inbox página propia y acceso global solo agregar. Iniciar timer en Nueva la pasa a En curso; Bloqueada/Revisión conservan estado. Nota borrada definitivamente desaparece también de Actividad. Restore conserva contraseña actual y cierra timers de copia. Estos acuerdos no aprueban pantallas ni medidas.

P7 sigue pendiente de aclaración: no fijar un nuevo desempate de Hoy por inferencia.

## Paleta entregada por el usuario

| Token | Color | Estado |
|---|---|---|
| Primary | `#07B478` | Confirmado. |
| Secondary | `#518166` | Confirmado. |
| Tertiary | `#FF9676` | Confirmado en respuesta posterior. |
| Neutral | `#717973` | Confirmado tras aclarar la etiqueta inicial de Tertiary. |

Conservar los nombres entregados. No convertir Tertiary automáticamente en error o advertencia, ni Neutral en fondo o texto de cualquier contraste. Fondos, texto, estados y contraste se definen por separado; no están aprobados por entregar esta paleta.

## Método para diseñar por pantalla

- No pasar la propuesta técnica ni el plan completo a Stitch. Usar contexto breve y el prompt de una sola pantalla.
- Especificar escritorio y ancho en cada generación inicial; no confiar en que macOS implique formato de escritorio.
- Enumerar elementos prohibidos concretos. Las restricciones generales no evitaron todas las invenciones.
- Separar generación de pantalla, estado alternativo y corrección puntual. No acumular todo en una petición.
- Para cambios localizados, nombrar qué eliminar o reemplazar y qué conservar; para geometría, indicar dimensiones y alineación verificables.
- Revisar efectos secundarios aunque se pida conservar el resto. Más ancho para fechas puede reducir el disponible para títulos.
- Las capturas permiten comprobar apariencia, no dimensiones CSS exactas ni comportamiento. Comparar al mismo viewport o inspeccionar HTML/CSS cuando se disponga de él.
- Conectar Stitch facilitaría generación, exportación e iteraciones desde el agente, pero no garantiza seguimiento del prompt ni mejores diseños. No se conecta en esta etapa.

## Cómo usar este documento

1. Crear o abrir un proyecto de Bitnode en Stitch desde el entorno que prefiera el usuario.
2. Pegar el prompt base y después generar Hoy, detalle de tarea e Inbox, una pantalla a la vez.
3. Revisar navegación, densidad y efectos de las acciones. Registrar cambios visuales sin cambiar reglas de producto.
4. Reutilizar el diseño elegido en los siguientes grupos. Traer capturas y HTML/CSS si están disponibles, junto con enlace/IDs de proyecto y pantallas.
5. Extraer tokens y componentes Angular; el HTML generado es referencia visual, no implementación lista para producción.

Stitch requiere acceso externo durante diseño. Bitnode instalado debe funcionar sin Internet y no depender de Stitch, fuentes remotas ni servicios de generación. Usar solo datos ficticios en prompts y exportaciones; nunca subir la base, backups, certificados, contraseñas ni información personal real.

Referencias oficiales consultadas: [Stitch](https://stitch.withgoogle.com), [skills de Google Labs](https://github.com/google-labs-code/stitch-skills) y [configuración MCP](https://stitch.withgoogle.com/docs/mcp/setup/). Las skills oficiales requieren un servidor Stitch configurado para automatización; no se conecta aquí. Su colección de generación React no cambia el stack Angular acordado.

## Prompt base para pegar

```text
Diseña Bitnode, una aplicación personal de productividad local en macOS.
La interfaz es web, en español, y luego se implementará en Angular.
Un solo usuario. No diseñes una landing de marketing.

Base visual aprobada: escritorio oscuro compacto, acento verde y navegación lateral.
Conserva esta dirección al diseñar cada pantalla; no implica cierre del diseño.
Paleta confirmada: primary #07B478, secondary #518166,
tertiary #FF9676 y neutral #717973.
No asignes colores automáticamente a error/advertencia. Propón superficies oscuras
y texto legible por separado y comprueba el contraste de sus combinaciones.
Bordes sutiles, listas densas pero legibles y jerarquía tipográfica sencilla.
No uses gradientes decorativos, ilustraciones hero, grandes tarjetas KPI ni
espacios vacíos excesivos. Usa iconos con etiquetas, no significado solo por color.
Las medidas exactas y demás tokens se revisarán sobre el diseño.

Genera primero escritorio con viewport de 1440 px y navegación lateral,
no una pantalla móvil. Genera adaptación estrecha a 390 px solo si se solicita
como variante separada.
Navegación lateral como base aprobada. Secciones: Hoy, Inbox, Clientes, Proyectos, Contactos, Notas, Tiempo,
Finanzas, Calendario, Actividad. Búsqueda global y Configuración accesibles.
La navegación puede revisarse, pero no añadas módulos al producto.
Usa patrones consistentes de listas, detalle, formularios y confirmaciones.

Scopes work/personal se muestran como Trabajo/Personal, con Todos para filtros.
No es multiusuario: no hay equipos, invitaciones, permisos por rol ni avatares de colaboradores.
No hay sincronización, integraciones, recurrencia, adjuntos, notificaciones,
dependencias entre tareas ni categorías financieras.
No muestres cifrado, rutas SQLite, sprints, versiones inventadas ni referencias
a Tech Lead u otros roles. No añadas mensajes de seguridad no comprobados.
No conviertas instrucciones de este brief en textos explicativos de la interfaz.

Tareas requieren proyecto; proyecto pertenece a un cliente fijo.
Estados: Nueva, En curso, Bloqueada, En revisión, Completada, Cancelada.
Prioridad: Sin prioridad, Baja, Media, Alta; sin prioridad por defecto.
Planificación y fecha límite son campos diferentes, cada uno con hora opcional.
Usa siempre horario de Colombia, sin selector de zona.
Iniciar temporizador de Nueva la pasa a En curso; Bloqueada/En revisión conservan estado.
Inbox tiene página propia; desde otras pantallas solo se pueden agregar capturas.
Referencias URL repetidas permitidas. Búsqueda en orden alfabético.
Mostrar errores, avisos no bloqueantes, loading, vacío y conflictos de edición.
Acciones destructivas o compuestas muestran efectos concretos antes de confirmar.
No añadas funciones por llenar espacio. Usa datos ficticios colombianos.
```

## Primera tanda

### 1. Hoy

```text
Usa el brief base. Diseña la pantalla Hoy de Bitnode.
Header con fecha, filtros Todos/Trabajo/Personal, cliente y proyecto.
Lista principal de tareas abiertas: En curso primero, después prioridad y límite.
Bloqueadas y En revisión en secciones separadas. Muestra proyecto/cliente como contexto.
Distingue planificación de fecha límite. Indica selección manual para Hoy, que persiste
hasta quitarla o cerrar la tarea. No inventes un botón que complete todo el día.
Ofrece acceso a detalle y temporizador por tarea, captura rápida hacia Inbox
y resumen compacto de temporizadores activos simultáneos.
Bloqueadas y En revisión también permiten temporizador; no deduzcas restricciones
funcionales a partir del nombre de un estado.
Muestra la fecha una sola vez. Inbox contiene capturas, no tareas asignadas.
Sin temporizadores activos, no muestres contador ni botón de inicio sin destino.
No uses métricas de ingresos, gráficas ni widgets ajenos a Hoy.
Genera primero contenido con seis tareas ficticias: tres en la lista principal,
dos bloqueadas y una en revisión. Incluye dos temporizadores activos y una tarea
seleccionada manualmente para Hoy. No todas las tareas necesitan fechas.
La variante vacía se solicita después, por separado, con acción de capturar.
```

### 2. Detalle de tarea

```text
Conserva el sistema visual de Hoy. Diseña detalle de tarea y su edición.
Título, proyecto/cliente derivados, estado, prioridad, descripción Markdown,
planificación y límite separados con hora opcional, motivo de bloqueo opcional,
etiquetas, origen de captura y URLs con nombre opcional.
Subtareas multinivel plegables, tiempo registrado y control de temporizador.
Nueva tarea siempre nace Nueva; no ofrecer estado inicial arbitrario.

Incluye una variante de confirmación de traslado de rama: destino activo/pausado,
separar del padre si la tarea es hija, trasladar descendientes, detener y guardar
temporizadores, atribuir todo el tiempo anterior al nuevo proyecto, sin reinicio.
No permitir destino completado/archivado. Mostrar que debe reactivarse primero.
Incluye aviso no bloqueante de planificación posterior al límite.
Eliminar tareas es irrecuperable aunque se retengan 30 días. No mostrar Restaurar tarea.
```

### 3. Inbox

```text
Diseña página propia de Inbox, sin scope ni proyecto obligatorio para capturar.
Desde el resto de pantallas solo hay captura rápida para agregar contenido;
no desplegar la bandeja ni ofrecer procesamiento como widget global.
Lista de capturas con título y cuerpo editable. Acciones: crear tarea, crear nota,
añadir a tarea/nota existente o descartar con confirmación.
Al añadir a existente, mostrar contenido de destino y captura, permitir editar
la combinación antes de guardar, sin reemplazo ni agregado silencioso.
Convertir a tarea exige proyecto. Mostrar error de guardado sin perder la captura.
Permite editar contenido antes de crear tarea/nota. Guardar destino y retirar
captura es una operación atómica; ante fallo conserva la captura. Reglas aprobadas.
No mostrar historial de capturas procesadas ni estados persistentes adicionales.
```

## Prompts utilizados para corregir Hoy

Estos ejemplos registran las correcciones realizadas durante el diseño. No implican aprobación final. Aplicarlos solo sobre una pantalla que presente esos problemas.

### Cambios de contenido localizados

```text
Modifica únicamente estos elementos:
1. Elimina “sqlite://local.bitnode”, “v1.4.2” y “Encapsulado local”.
2. Elimina toda referencia a “Tech Lead”, sin sustituirla por otro rol.
3. Elimina los textos explicativos sobre disponibilidad del temporizador;
   conserva sus botones habilitados.
4. Separa claramente las columnas “Planificada” y “Límite”.

Conserva el resto sin cambios.
```

Resultado: cumplió los tres cambios de contenido; la instrucción de separación resultó insuficiente.

### Geometría explícita

```text
En las tres tablas, asigna columnas independientes a
“Planificada” y “Límite”, cada una con ancho mínimo de 120 px
y separación horizontal de 24 px.

Alinea cada encabezado con sus valores.
No cambies ningún otro elemento.
```

Resultado: separación visible correcta, con más títulos/motivos truncados. Los 120/24 px son medidas solicitadas en esta iteración, no tokens aprobados ni verificados en CSS. Antes de cerrar Hoy, revisar el equilibrio entre espacio de fechas, legibilidad de títulos y densidad al mismo viewport. Después continuar con detalle de tarea e Inbox, reutilizando la dirección visual que se seleccione.

## Siguientes grupos de pantallas

Usar el mismo prompt base y pedir cada pantalla por separado. Estos requisitos son criterios de diseño, no promesas de que Stitch aplique automáticamente las reglas.

| Grupo | Pantallas y restricciones |
|---|---|
| Organización | Clientes con scope obligatorio sin default; contactos libres o ligados a varios clientes, nombres duplicados permitidos; proyecto con cliente fijo, fechas solo día, estados y tareas. Selectores ocultan archivados por defecto pero permiten selección explícita cuando el vínculo opcional lo admite. |
| Conocimiento | Lista/editor Markdown de notas, título generado persistente si se omite, vínculos explícitos independientes a cliente/proyecto/tarea/contacto; contexto derivado separado. Etiquetas planas con Todas/Cualquiera, Todas por defecto. No renombrar/borrar etiqueta ni editar color. |
| Tiempo | Entradas manuales fecha/minutos, mínimo1; lista de temporizadores simultáneos, uno por tarea y uno directo por proyecto. Indicar límite12h y sumas de intervalos solapados. Tiempo de tarea eliminada solo lectura, fuera de totales. |
| Finanzas | Income/expense como Ingreso/Gasto, importe entero positivo, COP por defecto y USD, fecha hoy editable, concepto opcional, vínculo cliente/proyecto opcional. Mostrar original y equivalente o pendiente. Solo total en pesos; no categorías ni subtotales por moneda. Confirmar edición de tasa y limpiar tasa al cambiar moneda. |
| Calendario | Planificación y límite con marcadores distintos; tareas cerradas como conteos pulsables. Arrastrar tarea solo modifica planificación. Eventos simples con hora o día completo, último día inclusivo, cero duración válido, contexto opcional único. Sin recurrencia ni recordatorios. |
| Consulta | Búsqueda en entidades aprobadas, todos los términos, filtros de archivados/cerrados; Actividad con detalle antes/después solo de notas/etiquetas/Inbox/tiempo/finanzas/eventos. No añadir timeline de acciones de tareas/clientes/proyectos/contactos. Orden búsqueda alfabético; actividad de nota desaparece cuando la nota se borra definitivamente. |
| Recuperación | Papelera restaurable de notas/eventos; nota restaurada activa. Tareas eliminadas, si se muestran, en sección separada solo consulta durante retención, sin acción restaurar. |
| Operación | Login con contraseña local, configuración de acceso LAN/HTTPS, backup manual y explicación de restore por CLI con servidor detenido. Sin tokens personales ni promesa de cerrar sesión al cerrar navegador. |

## Estados y confirmaciones a revisar

- Vacío inicial y vacío por filtro, carga, error recuperable y conflicto con cambios de otra interfaz.
- Error por proyecto destino cerrado o cliente archivado, con explicación del paso previo.
- Reapertura de tarea/ancestros y proyecto, cancelación conjunta de descendientes abiertos, cambio de scope de cliente.
- Eliminación irrecuperable de rama, descarte de captura, papelera de nota/evento, borrado definitivo de tiempo/finanzas y cambio de tasa.
- Conversión pendiente visible y seleccionables archivados por elección explícita, sin reactivación implícita.
- Teclado, foco visible, etiquetas de campos, mensajes asociados y contraste. Botones de acción no dependen de hover.

## Qué traer de Stitch

Propuesta de organización local al recibir las exportaciones, todavía no creada:

```text
 design/stitch/
   README.md              # Proyecto/pantallas, fecha y estado de revisión
   DESIGN.md              # Tokens, tipografía, espaciado y componentes elegidos
   hoy/                   # Captura y HTML/CSS de referencia
   tarea/
   inbox/
```

Conservar exportaciones originales y registrar qué variante se aprobó. No guardar URLs firmadas como única copia ni credenciales de acceso. Anotar recursos externos generados para reemplazarlos por assets locales.

## Criterio para pasar a Angular

- El usuario revisó cada grupo por Stitch o sus exportaciones y hay una selección identificable.
- Las pantallas respetan alcance y separan propuestas de reglas confirmadas.
- Se documentaron tokens y componentes reutilizables, responsive y estados alternativos.
- HTML/CSS no se copia como backend ni se importa como React. Se adapta a Angular con servicios y contratos reales.
- La aceptación funcional se verifica después en navegador y tests del dominio; una captura visual no la demuestra.
