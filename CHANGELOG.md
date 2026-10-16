# Historial de versiones

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
