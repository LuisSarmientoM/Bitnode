# Bitnode v0.3.0

Base local de Notas con Angular, NestJS y SQLite. Permite crear, listar, abrir y editar notas Markdown con edición dinámica y guardado explícito. En móvil las notas se abren en un modal. Los demás módulos del producto siguen en diseño.

## Ejecutar

Requiere Node 26, npm 11 y OpenSSL disponible en PATH. También admite Node 24.15 o posterior de la rama 24. Antes de abrir una base existente con esta versión, detén el servidor y conserva una copia, incluidos sus archivos WAL/SHM si existen.

```sh
npm ci
npm run tls:setup
npm run auth:setup
npm run dev
```

La dirección es **https://127.0.0.1:3000**. Primero importa manualmente la CA pública y comprueba su huella según la [guía de certificados](docs/organizacion-notas-t4.md#preparación-de-certificados). No ignores errores del certificado. La contraseña requiere al menos doce caracteres; no se muestra al escribir ni se pasa como argumento. La web pide la contraseña antes de cargar notas. No hay botón de cerrar sesión. Volver a entrar tras una sesión invalidada conserva el borrador en la pestaña, sin repetir automáticamente el guardado. Para invalidar todas las sesiones, usa `npm run auth:reset` en el Mac. `dev` compila la web y arranca el servidor. No recarga automáticamente al editar el código. Después de cambiar el frontend, detén el servidor y ejecuta `npm run dev` de nuevo.

Para compilar y arrancar por separado:

```sh
npm run build
npm start
```

NestJS sirve los archivos Angular compilados y `/api/v1/notes` desde el mismo origen. El backend se ejecuta desde TypeScript con `tsx`; esta entrega no genera un instalador ni un binario de servidor.

## Acceso personal desde la misma LAN

El modo predeterminado sigue limitado a este equipo, pero también exige HTTPS y contraseña. Para LAN, incluye la IPv4 privada del Mac al preparar el certificado y al arrancar:

```sh
BITNODE_LAN_HOST=192.168.1.20 npm run tls:setup
npm run auth:setup
BITNODE_LAN_HOST=192.168.1.20 npm run dev
```

Sustituye la IP por la de tu Mac y usa `https://IP:3000`. Solo escucha en esa dirección concreta; rechaza `0.0.0.0`, direcciones públicas y hostnames. Host y Origin siguen siendo exactos. Comparte únicamente `ca.pem` e importa la CA manualmente en cada dispositivo, tras comprobar su huella. El comando no cambia Keychain ni firewall.

No abras puertos del router, no uses túneles ni publiques mediante un proxy. El firewall o el aislamiento entre dispositivos pueden impedir el acceso. No se ha comprobado una conexión LAN física.

Para desactivarlo, detén el proceso y arranca sin `BITNODE_LAN_HOST`. Si cambia la IP, el certificado debe incluir la nueva. `tls:setup` no sobrescribe una CA existente; no borres sus claves sin planificar la renovación y la confianza de los dispositivos.

## Datos y límites

- `npm run db:init` crea `.data/bitnode.sqlite` y aplica la migración inicial sin arrancar el servidor. Se puede repetir sin borrar las notas. El servidor también la inicializa si falta.
- La base no se borra al reiniciar y queda fuera de Git. También puedes usar `BITNODE_DB=/ruta/bitnode.sqlite npm run db:init`.
- `BITNODE_DB=/ruta/bitnode.sqlite npm start` cambia el archivo. `PORT=3001 npm start` cambia el puerto.
- Por defecto escucha en `127.0.0.1`; LAN requiere `BITNODE_LAN_HOST`. El arranque exige TLS y una contraseña configurada antes de abrir las notas. No hay fallback HTTP ni acceso anónimo.
- Identidad y certificados se guardan en `<BITNODE_DB>.auth.sqlite` y `<BITNODE_DB>.tls`. Usa las mismas variables al configurar y arrancar. `npm run auth:reset` cambia la contraseña e invalida todas las sesiones, sin tocar notas. No hay TTL de sesión en el servidor; la cookie es de sesión del navegador.
- SQLite usa WAL, migración inicial versionada y revisión de cada nota. Una edición obsoleta devuelve conflicto, sin sobrescribir la versión guardada.
- Las etiquetas asignadas aparecen como chips bajo el título. «＋ Etiqueta» abre un panel flotante para asignar o crear, sin desplazar el contenido; se cierra al hacer clic fuera o con Escape. El color es opcional y se elige con el selector de color del sistema; sin elegirlo, la etiqueta no tiene color. Los nombres y colores son fijos. Los filtros usan chips y Todas/Cualquiera. Quitar la asignación no borra la etiqueta. No hay renombrado ni borrado de etiquetas, archivo, papelera ni vínculos con otros módulos.
- La migración a schema2 conserva las notas. Detén el servidor y conserva una copia previa antes de usar esta versión con tu base real; el ejecutable anterior no admite schema2.
- Se admite título, contenido o ambos. Sin título, se guarda uno generado del primer encabezado Markdown o la primera línea con contenido. Editar el cuerpo no cambia ese título.
- El título admite 500 puntos Unicode y el contenido 1 MiB UTF-8. La lista tiene páginas de 50 notas. Permite ordenar por última modificación, título o fecha de creación.
- Buscar notas filtra título y contenido por todos los términos, con prefijos, acentos vocálicos equivalentes y ñ distinta de n. Pulsa Aplicar para buscar o vacía el campo y aplica para volver. Los resultados de búsqueda van por título. No hay búsqueda global ni índice FTS todavía; ver [entregas de organización y T4](docs/organizacion-notas-t4.md).
- El editor dinámico muestra formato compatible salvo en la línea que estás editando, donde revela el Markdown. Las tablas GFM simples se muestran como tablas; «Editar tabla» revela su bloque para editarlo. Código fuente permite editar el texto completo. No ejecuta HTML del usuario ni carga imágenes remotas; no hay un modo separado de Vista previa.
- Las columnas de las tablas reparten el ancho disponible según su cantidad. El mínimo de cada columna es el mayor entre su cabecera y su palabra más larga, con un máximo común de 320 px, para no partir IDs ni palabras. El resto del contenido no ensancha columnas; si no caben los mínimos, la tabla tiene scroll horizontal. Solo un texto mayor que el máximo se ajusta en varias líneas.
- La lista muestra un extracto de cada nota en texto limpio, sin símbolos Markdown ni HTML. La nota guardada no cambia.
- En la vista de notas, Cmd+S (macOS) o Ctrl+S (Windows/Linux) guarda la nota, igual que «Guardar nota». Sin cambios no hace nada, y nunca abre el guardado de página del navegador. En la pantalla de acceso el atajo no se intercepta.
- El título recibe foco automático solo en notas nuevas. El editor tiene altura acotada y scroll interno para que el contenido largo no desplace Guardar fuera de la vista.
- El borrador vive en la pestaña. Se pide confirmación antes de descartarlo, pero no se recupera si el navegador o el equipo fallan. Si un guardado pierde la conexión, consulta otra pestaña antes de repetirlo, porque el resultado puede ser incierto.

## Verificar

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Las pruebas de integración usan SQLite real. Las de navegador arrancan el mismo runtime protegido en HTTPS, puerto 3107, con base, identidad y CA temporales, sin tocar tus notas. Chromium omite la comprobación de confianza solo para esa CA temporal; las pruebas TLS/runtime verifican la cadena con una CA explícita. Esto no demuestra confianza del sistema ni acceso desde otro dispositivo. Generan capturas de escritorio y móvil en `test-results/`, que se excluye de Git.

## Organización

| Ruta | Responsabilidad |
|---|---|
| `apps/web` | Listado, editor dinámico, modal móvil y manejo del borrador. |
| `apps/server` | API NestJS, archivos web y restricción al origen local. |
| `packages/core` | Tipos, validaciones y contrato del repositorio. |
| `packages/db` | Esquema Drizzle, migración SQLite y operaciones de notas. |
| `tests/e2e` | Recorridos reales con Chromium. |

El acceso T4 está implementado y probado en loopback con certificados temporales. La confianza de la CA en tus dispositivos y una conexión LAN física requieren comprobación manual; no se han instalado ni configurado aquí. La CLI autónoma del diseño completo queda pendiente. Esta base no implementa el plan general completo. Para retomar, consulta [el estado del proyecto](docs/continuar-sesion.md).
