# Historial de versiones

## 0.1.0

Primera versión ejecutable de Notas independientes.

- Crear, listar, abrir y editar notas Markdown desde una interfaz Angular.
- Vista previa sin HTML del usuario ni imágenes remotas automáticas.
- SQLite con migración inicial, WAL y revisiones para evitar sobrescribir cambios concurrentes.
- Comando `npm run db:init` para inicializar la base sin arrancar el servidor.
- Guardado explícito, protección del borrador y listado paginado.
- Servidor NestJS limitado a este equipo. Sin login ni acceso LAN en esta versión.

No incluye etiquetas, vínculos, archivo, papelera ni los demás módulos del diseño completo. La revisión nativa de la base sigue pendiente por límite de contexto, sin aprobación creada.
