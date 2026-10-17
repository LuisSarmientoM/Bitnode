# T6 Proyectos: cierre y evidencia

**T6 completado en el alcance web/API autorizado**, en la rama `feat/projects-t6`. La CLI queda excluida, igual que en T5, por decisión del usuario. Esta rama no se ha integrado en `main` ni ha generado una versión nueva.

## Estado al cierre

- Cada proyecto pertenece a un cliente fijo y su nombre es único dentro de ese cliente, con la misma clave que Clientes: ñ distinta de n y acentos vocálicos equivalentes. Tiene descripción Markdown y días planificados `AAAA-MM-DD`, validados contra el calendario gregoriano.
- Estados: activo, pausado, completado y archivado. Al cambiar de estado se conservan las fechas planificadas. Un cliente archivado impide crear o reactivar proyectos (`CONFLICT`/`CLIENT_ARCHIVED`) y nunca se reactiva por su cuenta.
- Si la fecha de fin queda antes que la de inicio, la respuesta incluye el aviso `PROJECT_END_BEFORE_START`, pero se guarda igual.
- Cambios en Clientes: no se puede archivar un cliente con proyectos activos o pausados ni borrar uno que tenga algún proyecto (`HAS_ASSOCIATIONS`). La vista previa del cambio de ámbito incluye `CHANGE_PROJECT_SCOPES` y la UI indica cuántos proyectos cambian.
- REST `/api/v1/projects`: listado con `state`, `clientId`, `archived=include` y `q`; también alta, edición (rechaza `clientId`), `change-state`, etiquetas y borrado sin asociaciones.
- Web: página Proyectos en la navegación, entre Clientes y Contactos, para escritorio y móvil.
- Esquema SQLite `user_version 5`: tablas `projects` y `project_tags`. La migración es aditiva, ocurre en la misma transacción y se revierte entera si falla.

## Fuera de T6

- La comprobación de tareas abiertas al completar o archivar un proyecto, y de tareas al borrarlo, corresponde a T7, que usará `user_version 6`. La parada del temporizador directo al cerrar corresponde a T15. Notas, eventos y finanzas añadirán sus bloqueos al integrarse.
- El diseño de Stitch muestra los estados Planificado y Cancelado y una columna de tareas. Se aplica el contrato: cuatro estados y sin tareas hasta T7.

## Verificación

| Comprobación | Resultado |
|---|---|
| Core + SQLite (`packages/*/test/projects.test.ts`) | RED: faltaban los módulos. GREEN: 86/86 en core y db. |
| API (`apps/server/test/projects.test.ts`) | RED 0/4, GREEN 4/4. |
| `npm test` | 133 aprobadas, cero fallos. |
| `npm run typecheck`, `git diff --check` | Exit 0. |
| E2E Proyectos, Clientes, Contactos y Navegación | RED 5/5 fallidas antes de la página. Final: 56 aprobadas, 3 omitidas, exit 0 (`BITNODE_E2E_PORT=3117`). |

La primera pasada E2E detectó 196 px de desbordamiento móvil. El texto oculto del aviso usaba `position: absolute` y escapaba del recorte de la tabla, así que ahora `.table-scroll` está posicionado. El runtime no admitió un verificador independiente y no hay revisión nativa. Las pruebas usaron bases temporales: no se migró ninguna base real.

## Coordinación con T7

T7 se desarrolla en paralelo en `../bitnode-t7`. El puerto E2E es configurable con `BITNODE_E2E_PORT` para que las dos sesiones no compitan por el 3107. Al integrar habrá conflictos menores en `notes-app.html/ts` y en la prueba de navegación de `clients.spec.ts`.
