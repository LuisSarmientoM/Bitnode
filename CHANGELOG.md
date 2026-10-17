# Historial de versiones

## 0.3.0

Organización de Notas y acceso seguro personal (T4).

- Búsqueda en título y contenido por todos los términos, con prefijos y acentos equivalentes, y orden por modificación, título o creación.
- Etiquetas con color opcional, asignadas como chips y filtrables con Todas/Cualquiera. Paneles flotantes y selector de color del sistema.
- Contraseña compartida con `npm run auth:setup` y `npm run auth:reset`, sesiones con cookies `__Host`, CSRF y Origin exacto.
- CA local guiada con `npm run tls:setup`, sin instalar confianza automáticamente. El servidor solo arranca con HTTPS y contraseña configurados, también en loopback.
- Login web. Una sesión invalidada pide entrar de nuevo y conserva el borrador.
- Editor: foco del título solo en notas nuevas, scroll interno, tablas GFM editables con columnas acotadas y Cmd+S/Ctrl+S para guardar la nota.
- La lista muestra un extracto en texto limpio, sin símbolos Markdown.

**Antes de actualizar:** detén el servidor y copia la base, con sus archivos WAL/SHM. La migración a schema2 conserva las notas, pero la versión anterior no puede abrir la base migrada. Después ejecuta `npm run tls:setup` y `npm run auth:setup`; sin ellos el servidor no arranca.

Verificado con 41 pruebas unitarias/de integración, comprobación de tipos, build Angular y 30 recorridos Chromium sobre el runtime HTTPS real con certificados temporales. Revisión nativa aprobada por tramos; los recibos están en [organización y T4](docs/organizacion-notas-t4.md#revisión-nativa-final). No se ha comprobado la confianza de la CA en dispositivos reales, el acceso desde otro equipo de la LAN ni una PWA instalada. No hay botón de cerrar sesión en la web.

## 0.2.0

- Editor Markdown dinámico por defecto: la línea con foco muestra su sintaxis y las demás conservan el formato compatible. Código fuente sigue disponible; se retira Vista previa.
- En móvil, las notas se abren en un modal con cierre, foco y confirmación para descartar cambios.
- Interfaz simplificada, sin instrucciones permanentes, badges de red/Markdown ni lemas.
- Errores visibles al abrir notas, incluidos 404, 503 y fallos de conexión; reintento mediante la misma nota.
- Acceso LAN temporal con IPv4 privada explícita, validación de Host/Origin y sin cambios de datos.

Verificado con 18 pruebas unitarias/de integración, comprobación de tipos, build Angular y 13 recorridos Chromium. Aceptación visual confirmada por el usuario. La revisión RDD detectó y motivó la corrección del error de carga móvil; su validador final agotó el límite y no hay aprobación nativa de esta entrega.

El acceso LAN sigue sin contraseña ni HTTPS. La siguiente unidad propuesta es T4, acceso seguro, pendiente de autorización de implementación.

## 0.1.0

Primera versión ejecutable de Notas independientes.

- Crear, listar, abrir y editar notas Markdown desde una interfaz Angular.
- Vista previa sin HTML del usuario ni imágenes remotas automáticas.
- SQLite con migración inicial, WAL y revisiones para evitar sobrescribir cambios concurrentes.
- Comando `npm run db:init` para inicializar la base sin arrancar el servidor.
- Guardado explícito, protección del borrador y listado paginado.
- Servidor NestJS limitado a este equipo. Sin login ni acceso LAN en esta versión.

No incluye etiquetas, vínculos, archivo, papelera ni los demás módulos del diseño completo. La revisión nativa de la base sigue pendiente por límite de contexto, sin aprobación creada.
