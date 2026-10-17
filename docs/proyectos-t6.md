# T6 Proyectos: cierre y evidencia

**T6 completado en el alcance web/API autorizado** y publicado en `main` (`132f18f`). La CLI queda excluida, igual que en T5, por decisión del usuario. No generó una versión nueva. T7 se integró encima (`4f8c1ae`) y añadió los bloqueos de proyectos por tareas; ver [registro de T7](tareas-t7.md).

## Estado al cierre

- Cada proyecto pertenece a un cliente fijo y su nombre es único dentro de ese cliente, con la misma clave que Clientes: ñ distinta de n y acentos vocálicos equivalentes. Tiene descripción Markdown y días planificados `AAAA-MM-DD`, validados contra el calendario gregoriano.
- Estados: activo, pausado, completado y archivado. Al cambiar de estado se conservan las fechas planificadas. Un cliente archivado impide crear o reactivar proyectos (`CONFLICT`/`CLIENT_ARCHIVED`) y nunca se reactiva por su cuenta.
- Si la fecha de fin queda antes que la de inicio, la respuesta incluye el aviso `PROJECT_END_BEFORE_START`, pero se guarda igual.
- Cambios en Clientes: no se puede archivar un cliente con proyectos activos o pausados ni borrar uno que tenga algún proyecto (`HAS_ASSOCIATIONS`). La vista previa del cambio de ámbito incluye `CHANGE_PROJECT_SCOPES` y la UI indica cuántos proyectos cambian.
- REST `/api/v1/projects`: listado con `state`, `clientId`, `archived=include` y `q`; también alta, edición (rechaza `clientId`), `change-state`, etiquetas y borrado sin asociaciones.
- Web: página Proyectos en la navegación, entre Clientes y Contactos, para escritorio y móvil.
- Esquema SQLite `user_version 5`: tablas `projects` y `project_tags`. La migración es aditiva, ocurre en la misma transacción y se revierte entera si falla.

## Fuera de T6

- La comprobación de tareas abiertas al completar o archivar un proyecto, y de tareas al borrarlo, se entregó con T7, que usa `user_version 6`. La parada del temporizador directo al cerrar corresponde a T15. Notas, eventos y finanzas añadirán sus bloqueos al integrarse.
- El diseño de Stitch muestra los estados Planificado y Cancelado y una columna de tareas. Se aplica el contrato: cuatro estados y sin tareas hasta T7.

## Verificación

| Comprobación | Resultado |
|---|---|
| Core + SQLite (`packages/*/test/projects.test.ts`) | RED: faltaban los módulos. GREEN: 86/86 en core y db. |
| API (`apps/server/test/projects.test.ts`) | RED 0/4, GREEN 4/4. |
| `npm test` | 133 aprobadas, cero fallos. |
| `npm run typecheck`, `git diff --check` | Exit 0. |
| E2E Proyectos, Clientes, Contactos y Navegación | RED 5/5 fallidas antes de la página. Final: 56 aprobadas, 3 omitidas, exit 0 (`BITNODE_E2E_PORT=3117`). |

La primera pasada E2E detectó 196 px de desbordamiento móvil. El texto oculto del aviso usaba `position: absolute` y escapaba del recorte de la tabla, así que ahora `.table-scroll` está posicionado. En el cierre original, el runtime no admitió un verificador independiente y no hubo revisión nativa. Ambas comprobaciones se retomaron después de publicar, como se registra abajo. Las pruebas usaron bases temporales: no se migró ninguna base real.

## Revisión posterior a la publicación

T6 tiene revisión nativa aprobada y reconocida en sus tres unidades de código, con los cuatro lentes de riesgo, resiliencia, legibilidad y fiabilidad. No se abrieron correcciones bloqueantes. Se revisaron los commits originales en un worktree limpio, no el acumulado de `main`: el rango conjunto T6+T7 superó el presupuesto de contexto sin crear autoridad.

| Unidad | Rango revisado | Linaje aprobado y reconocido | Líneas del candidato |
|---|---|---|---|
| Core, SQLite v5 y Clientes | `4319304..e0c3482` | `review-7395f0af40cf4e1b` | 636 |
| REST | `e0c3482..a04415a` | `review-05b1c6c7439829ca` | 181 |
| Web, navegación y E2E | `a04415a..7c5bf08` | `review-cba189302831df7d` | 722 |

Estas aprobaciones cubren esos candidatos históricos. No se heredan a T7, a cambios de integración posteriores ni al ajuste E2E descrito abajo. La documentación de cierre `132f18f` no forma parte de los rangos. Los tamaños son los commits ya publicados, sin reescribirlos para la revisión.

### Observaciones no bloqueantes

El controlador admitió estos avisos sin reabrir los candidatos; quedan como trabajo posterior, no como correcciones de estos linajes:

- Core/DB: límites duplicados (`R2-limits-duplicated`, `packages/db/src/projects.ts:15`), estados abiertos repetidos (`R2-open-states-duplicated`, `packages/db/src/clients.ts:80`), años menores de 100 (`R3-day-year-under-100`, `packages/core/src/days.ts:11-12`) y cobertura de búsqueda/listado (`R3-list-search-coverage`, `packages/db/test/projects.test.ts:152`).
- API: mapa de motivos de conflicto (`R2-conflict-reasons-mapping`, `apps/server/src/projects-controller.ts:11-14`) y pruebas de fallo en etiquetas/borrado (`R3-tags-delete-failure-paths`, `apps/server/test/projects.test.ts:106-108`).
- Web: selector de clientes limitado a 200 sin paginar (`R2-001`, `R3-create-client-list-truncated`, `R4-create-client-list-capped`); selección de etiquetas obsoleta al recargar tras conflicto (`R3-tags-reload-stale-selection`, `R4-tags-conflict-reload-stale-selection`); recuento de impacto de ámbito (`R2-004`, `R3-scope-count-targets-length`); legibilidad del guardado y efectos de diálogos (`R2-002`, `R2-003`). Ubicaciones en `apps/web/src/projects-page.ts:141,212-214,248-258,324-337` y `apps/web/src/clients-page.ts:86-88` del candidato.
- E2E: expectativas de navegación acopladas a la lista completa (`R2-005`, `tests/e2e/contacts.spec.ts:82`), título de prueba de edición más amplio que sus aserciones (`R3-edit-test-title-overclaims`), paneles sin cobertura (`R3-untested-panels`, `tests/e2e/projects.spec.ts:29-68`) y variable de puerto vacía (`R3-empty-port-env`, `tests/server.ts:15`).

### Comprobación de integración en main

Sobre `dfb2d17`, un verificador independiente de solo lectura no encontró defectos concretos en la migración v5 ni en los invariantes actuales de clientes/proyectos/tareas. Señaló que falta un caso explícito de migración v5→v6; existe cobertura v4→v6 y rollback. El cierre del temporizador directo sigue fuera de T6, en T15.

| Comprobación | Resultado |
|---|---|
| `npm test` | 153 aprobadas, exit 0. |
| `npm run typecheck` | Exit 0. |
| E2E completa, primera pasada | 92 aprobadas, 3 omitidas, 1 fallo, exit 1. Contactos esperaba cuatro botones de navegación y T7 añadió Tareas. |
| `BITNODE_E2E_PORT=3127 npm run test:e2e`, tras corregir esa expectativa | 93 aprobadas, 3 omitidas, exit 0. Incluye build web y recorridos de Proyectos, Tareas, Clientes, Contactos y Notas. |

El único ajuste fue el nombre y la lista esperada de esa prueba en `tests/e2e/contacts.spec.ts:77-82`. No cambió código de producto. Esta evidencia corresponde a `dfb2d17` más ese ajuste, incluido con este registro en la entrega autorizada para `main`. Los certificados y bases de las pruebas fueron temporales; no se modificaron datos reales.

## Coordinación con T7

T7 se desarrolló en paralelo en un worktree separado, ya retirado. El puerto E2E es configurable con `BITNODE_E2E_PORT` para que dos sesiones no compitan por el 3107. Los conflictos de integración en `notes-app.html/ts` y en la prueba de navegación de `clients.spec.ts` se resolvieron al rebasar T7.
