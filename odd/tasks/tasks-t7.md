T7 Basic tasks: create/edit/list tasks with priority, references and separate planned/due dates. Web/API only, no CLI.
Worktree ../bitnode-t7, branch feat/tasks-t7, in parallel with T6 Projects (feat/projects-t6, schema v5). Tasks schema is v6.
Sources: docs/plan-implementacion-local.md (T7 row), docs/diseno-tecnico/{datos,dominio,contratos}.md, design/stitch-v2/tarea.

## Specs

- S1. Plan T7 row: "Crear/editar/listar, prioridad, referencias y fechas separadas." Acceptance: "Toda tarea nueva, proyecto obligatorio; destino cerrado rechazado; planificación posterior al límite avisa."
- S2. Create (dominio.md): "Proyecto active/paused, padre vivo del mismo proyecto y abierto para no crear hijas abiertas bajo cerrado. Nueva, sin prioridad." contratos.md: "No permitir `state` ni `priority` inicial arbitrarios: creación fuerza nueva/sin prioridad; editar después por comando normal." Body example: `{"projectId": "...", "parentId": null, "title": "Revisar propuesta", "description": "## Objetivo\nRevisar el contrato.", "planned": { "kind": "day", "day": "2026-06-04" }, "due": null}`. Hierarchy is T8: T7 accepts only `parentId: null` or absent.
- S3. Edit (contratos.md): "PATCH título/description/priority/blockedReason/planned/due y URLs controladas. No estado/proyecto/padre/deletedAt por PATCH." Unknown or forbidden properties are rejected, not ignored. Requires expectedRevision. blockedReason belongs with the blocked state (T8) and is out of T7.
- S4. Priority: "priority none/low/medium/high" (datos.md).
- S5. References (datos.md/dominio.md/contratos.md): "`task_references` | `id`, `task_id`, `url`, `name?`, `position`"; "Referencias de tarea admiten URLs duplicadas. Validar sintaxis y texto, pero no rechazar, fusionar o quitar duplicados automáticamente." Limits: "URL | 4096 caracteres; http/https explícitos"; "Referencias tarea | 100; nombres opcionales <=500 caracteres." Editing references changes the task revision.
- S6. Dates (datos.md/contratos.md): planned/due each "Todo null, sin fecha." / "kind day, day no null, at null." / "kind instant, at no null, day null." Output `{"kind": "instant", "at": 1780596000000, "zone": "America/Bogota"}`. "Para entrada con hora usar `{kind:"local",day,time}` de Colombia y convertir en core a la forma instant de salida. `local` es input, no tercera forma persistida. `time` propuesto HH:mm". Invalid calendar dates are VALIDATION_ERROR.
- S7. Warning (dominio.md): "Advertencia de planificación posterior al límite compara instantes cuando ambos tienen hora; con día puro compara días civiles en America/Bogota y presenta aviso solo cuando inequívocamente posteriores. No inventar medianoche UTC ni bloquear guardado por aviso."
- S8. Limits (contratos.md): "Título/nombre | 500 puntos de código Unicode"; "Markdown/observaciones/cuerpo captura | 1 MiB UTF-8 por campo".
- S9. List: tasks filtered by project, paginated like clients (offset/limit), unknown query params rejected.
- S10. Project guard (agreed with T6, obs 5782): "la regla \"completar/archivar sin tareas abiertas\" la añade T7". dominio.md: "Cualquiera | completed/archived | Sin tareas abiertas". datos.md: project deletion blocked by its tasks.
- S11. Web UI: tasks list, create and edit per design/stitch-v2/tarea, desktop and narrow viewport, keyboard/focus/error/empty states, browser-tested.

## Tasks

- [x] T1 (S2,S4-S8) core validation + v6 schema + store, projects v5 stub until T6 lands. Route: inline. Commit: 2deec84 (127/127 tests, typecheck ok)
- [ ] T2 (S1-S3,S9) REST /api/v1/tasks controller + server tests. Route: gentle-ai-worker (context backstop). Commit: -
- [ ] T3 (S10) rebase onto T6 schema; project complete/archive/delete guard. Route: inline. Blocked on T6 commit. Commit: -
- [ ] T4 (S11) web tasks page + E2E. Route: inline. Needs T6 projects API. Commit: -
- [ ] T5 docs: register T7 evidence/limits, README, plan row. Route: inline. Commit: -

## Log

- L1 (user): "Arranca T7, estarás trabajando en paralelo con T6"
- L2 (user answers): worktree propio; contrato mínimo de projects acordado con stub y rebase; Web/API sin CLI; aprobar propuestas de fechas/URLs/límites.
- L3 (user): "Hablate con T6 para coordinar". orchestrator messaging unavailable; coordination via Engram topic bitnode/t7-tasks-coordination (obs 5784), T6 decisions in bitnode/t6-projects-scope (obs 5782).
- L4 (evidence): T6 test file in main checkout uses db.projects.create({clientId,name}), changeState({state,expectedRevision}), codes CLIENT_ARCHIVED/DUPLICATE_NAME; columns match the stub. Existing migration tests updated to latest version 6 / future 7; expect a trivial conflict with T6 (5/6) on rebase.
