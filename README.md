# Bitnode v0.1.0

Base local de Notas con Angular, NestJS y SQLite. Permite crear, listar, abrir y editar notas Markdown, con vista previa y guardado explícito. Los demás módulos del producto siguen en diseño.

## Ejecutar

Requiere Node 26 y npm 11. También admite Node 24.15 o posterior de la rama 24.

```sh
npm ci
npm run db:init
npm run dev
```

Abre **http://127.0.0.1:3000**. `dev` compila la web y arranca el servidor. No recarga automáticamente al editar el código. Después de cambiar el frontend, detén el servidor y ejecuta `npm run dev` de nuevo.

Para compilar y arrancar por separado:

```sh
npm run build
npm start
```

NestJS sirve los archivos Angular compilados y `/api/v1/notes` desde el mismo origen. El backend se ejecuta desde TypeScript con `tsx`; esta entrega no genera un instalador ni un binario de servidor.

## Acceso temporal desde una red de confianza

El modo predeterminado sigue limitado a este equipo. Para una prueba LAN sin autenticación, indica la IPv4 privada de la interfaz de red del servidor:

```sh
BITNODE_LAN_HOST=192.168.1.20 npm run dev
```

Sustituye la IP por la de tu equipo y abre `http://IP:3000` desde un dispositivo de la misma red. Solo se escucha en esa dirección concreta; no se admite `0.0.0.0`, una dirección pública ni un hostname. Se mantiene la validación exacta de Host y Origin. La interfaz muestra un aviso de modo temporal.

**No hay contraseña ni HTTPS.** Quien pueda alcanzar ese puerto puede leer y editar las notas. Usa solo una red de confianza; no abras puertos del router, no uses túneles ni publiques mediante un proxy. El firewall del sistema o el aislamiento entre dispositivos de la red pueden impedir el acceso.

Para desactivarlo, detén el proceso con Ctrl+C y arranca `npm start` sin `BITNODE_LAN_HOST`. Si la IP de tu equipo cambia, debes volver a iniciar el proceso con la nueva dirección.

## Datos y límites

- `npm run db:init` crea `.data/bitnode.sqlite` y aplica la migración inicial sin arrancar el servidor. Se puede repetir sin borrar las notas. El servidor también la inicializa si falta.
- La base no se borra al reiniciar y queda fuera de Git. También puedes usar `BITNODE_DB=/ruta/bitnode.sqlite npm run db:init`.
- `BITNODE_DB=/ruta/bitnode.sqlite npm start` cambia el archivo. `PORT=3001 npm start` cambia el puerto.
- Por defecto el servidor escucha exclusivamente en `127.0.0.1`. El acceso LAN temporal requiere `BITNODE_LAN_HOST`. No hay login ni sesiones todavía.
- SQLite usa WAL, migración inicial versionada y revisión de cada nota. Una edición obsoleta devuelve conflicto, sin sobrescribir la versión guardada.
- No hay borrado, archivo, papelera, etiquetas ni vínculos con otros módulos en esta entrega.
- Se admite título, contenido o ambos. Sin título, se guarda uno generado del primer encabezado Markdown o la primera línea con contenido. Editar el cuerpo no cambia ese título.
- El título admite 500 puntos Unicode y el contenido 1 MiB UTF-8. La lista tiene páginas de 50 notas, ordenadas por última modificación.
- La vista previa omite HTML del usuario e imágenes. Solo permite enlaces HTTP/HTTPS explícitos, abiertos por el usuario. No carga fuentes, scripts ni imágenes de servicios externos.
- El borrador vive en la pestaña. Se pide confirmación antes de descartarlo, pero no se recupera si el navegador o el equipo fallan. Si un guardado pierde la conexión, consulta otra pestaña antes de repetirlo, porque el resultado puede ser incierto.

## Verificar

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Las pruebas de integración usan SQLite real. Las de navegador arrancan su propio servidor en el puerto 3107 con una base temporal, sin tocar tus notas. Generan capturas de escritorio y móvil en `test-results/`, que se excluye de Git.

## Organización

| Ruta | Responsabilidad |
|---|---|
| `apps/web` | Listado, editor, vista previa y manejo del borrador. |
| `apps/server` | API NestJS, archivos web y restricción al origen local. |
| `packages/core` | Tipos, validaciones y contrato del repositorio. |
| `packages/db` | Esquema Drizzle, migración SQLite y operaciones de notas. |
| `tests/e2e` | Recorridos reales con Chromium. |

La CLI autónoma y el acceso local autenticado del diseño completo quedan pendientes. Esta base no equivale a completar T1–T4 ni T12 del plan general. Para retomar, consulta [el estado del proyecto](docs/continuar-sesion.md).
