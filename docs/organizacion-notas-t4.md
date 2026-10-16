# Organización de Notas y acceso seguro

Implementación autorizada en tres entregas verificables, sin publicación ni push. Conservar datos locales y la interfaz mínima de Notas. No incluir carpetas, archivo, papelera, vínculos ni otros módulos.

## Entregas

| Unidad | Alcance | Estado |
|---|---|---|
| 1 | Búsqueda en título/contenido y orden de lista | Código y comprobaciones funcionales listos; revisión pendiente. |
| 2 | Etiquetas inmutables, asignaciones y filtros Todas/Cualquiera | Pendiente. |
| 3 | T4: contraseña, sesiones, reset CLI, CSRF y HTTPS guiado | Pendiente de concretar detalles de operación. |

## Búsqueda y orden

Escribir la consulta y pulsar Aplicar. Vaciarla y aplicar vuelve a la lista completa. Los filtros aplicados se conservan al paginar y guardar. Aplicarlos con cambios sin guardar pide confirmación; cancelar conserva el borrador y los resultados actuales.

`GET /api/v1/notes` admite `q` y `sort=updated|title|created`, además de la paginación existente. La consulta admite hasta 500 puntos Unicode. Valores repetidos, no textuales u órdenes desconocidos devuelven 400. Con consulta se fuerza orden por título; sin consulta se conserva última modificación por defecto y se permiten título o creación descendente. El ID desempata de forma estable.

La búsqueda exige todos los términos, con palabras completas o prefijos, en título y contenido combinados. No interpreta operadores. Normaliza mayúsculas y acentos vocálicos, conserva ñ y no modifica el Markdown guardado.

Esta primera entrega usa funciones deterministas de SQLite y filtra antes de contar y paginar. No cambia schema1, no agrega dependencias ni implementa el índice FTS5 global de T17. Recorre las notas; no se ha validado rendimiento para colecciones grandes.

## Evidencia de unidad 1

- RED: `npx tsx --test packages/core/test/note-query.test.ts`, exit 1 porque faltaba el módulo nuevo.
- GREEN: `npm test`, 22 pruebas aprobadas. Cubren normalización, prefijos, términos entre campos, ñ, paginación filtrada, edición y parámetros API inválidos.
- `npm run typecheck`, exit 0 tras corregir accesos posiblemente vacíos en pruebas nuevas.
- `npm run test:e2e`, exit 0, 14 recorridos Chromium, incluido build Angular y búsqueda móvil/escritorio con protección del borrador.
- Captura móvil revisada: `test-results/notas-busqueda-mobile.png`. Sin desbordamiento horizontal a 390px.
- LSP activo no confirmó limpieza de todos los archivos; Nest se comprobó con configuración inferida. TypeScript del proyecto y build Angular son la evidencia de tipos y plantillas.

La reversión de unidad 1 retira `note-query.ts`, sus pruebas y el recorrido `search.spec.ts`, y revierte la integración de consulta/controles en repositorio, API y UI. No requiere reversión de datos ni de esquema.

## Reglas de unidad 2

Etiquetas planas con nombre único normalizado, color opcional inmutable desde creación, incluso su ausencia. No renombrar, fusionar ni borrar. Quitar una asignación no borra la etiqueta. Modificar asignaciones usa la revisión de la nota. Filtro Todas por defecto y Cualquiera alternativo.

## T4

Autenticar tanto loopback como LAN, invalidar sesiones al reset y no degradar a HTTP LAN. No instalar confianza de certificados, modificar Keychain ni abrir firewall sin autorización concreta. Validar seguridad independientemente y con pruebas de API/navegador. No afirmar acceso desde otro dispositivo sin prueba real allí.
