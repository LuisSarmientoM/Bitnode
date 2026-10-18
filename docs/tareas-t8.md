# T8: creación de subtareas

Primera subunidad implementada en core, SQLite y API. T8 sigue incompleta: cambiar/quitar padre vendrá después de la revisión de esta unidad. No hay cambios de UI ni CLI.

## Contrato disponible

`POST /api/v1/tasks` admite `parentId` y exige `expectedParentRevision` si el padre no es null. Ejemplo:

```json
{"projectId":"p1","parentId":"t1","expectedParentRevision":2,"title":"Revisar detalle"}
```

Omitir padre o enviar null crea raíz; en ese caso no se admite revisión del padre. La tarea nace nueva, sin prioridad y con revisión 1. GET y listado devuelven parentId. PATCH sigue rechazando padre, proyecto y estado.

## Reglas y decisiones

- Proyecto active/paused, padre existente del mismo proyecto, padre y todos sus ancestros abiertos. Un cerrado exige reapertura previa explícita; este comando no reabre nada.
- La revisión del padre se compara dentro de la transacción IMMEDIATE, junto con proyecto y ancestros. Una edición concurrente previa del padre devuelve conflicto; no se toma una revisión fresca para sobrescribir la intención del consumidor.
- Crear una hija no cambia datos ni revisión del padre. No hay preview de rama ni efectos aceptados en esta acción simple. La futura composición de ramas deberá comparar membresía, no solo revisión de raíz.
- La FK compuesta diferible de v6 ya garantiza mismo proyecto. No se modifica ni reconstruye esquema. El ID nuevo generado por aplicación no admite un padre que sea él mismo ni uno de sus descendientes, porque aún no existen. La prevención de ciclos al reparentar pertenece a la próxima unidad.
- Cliente archivado bloquea crear/reactivar proyecto y la futura reapertura. No se añade una prohibición independiente de creación de tarea en proyecto active/paused: se conserva la regla existente. En estados coherentes, archivar cliente ya exige ausencia de proyectos active/paused.
- Errores HTTP: 404 NOT_FOUND para padre ausente; 409 CONFLICT con reason REVISION_MISMATCH, PROJECT_CLOSED, PARENT_PROJECT_MISMATCH o PARENT_CLOSED. Forma inválida devuelve 400 VALIDATION_ERROR.

Fuentes: [dominio](diseno-tecnico/dominio.md#tareas-y-transiciones), [datos](diseno-tecnico/datos.md#jerarquía) y [alcance](revision-alcance-local.md#relaciones-y-reglas-que-no-deben-romperse).

## Evidencia de esta unidad

Comando RED y GREEN, timeout 30 segundos, con fixtures temporales aisladas:

`./node_modules/.bin/tsx --test packages/core/test/tasks.test.ts packages/db/test/tasks.test.ts apps/server/test/tasks.test.ts`

- RED: código 1, 19 pasan y 4 fallan. API respondió 400 en lugar de 201; DB rechazó expectedParentRevision como campo desconocido; core no devolvía el padre normalizado.
- GREEN: código 0, 23 pasan, 0 fallan. Incluye multinivel, padre inexistente/ajeno, revisión obsoleta, padre/ancestro done o cancelled, proyecto cerrado, ausencia de cambios parciales y rechazo de parentId por PATCH.
- Verificación del padre: `npm run typecheck && npm test`, código 0; 156 pruebas aprobadas, cero fallos. LSP confirmó un archivo limpio y dejó cinco inconclusos, sin diagnósticos recibidos; no se presenta como validación global.
- E2E de creación de subtareas en preparación, todavía sin UI implementada. No se verificó concurrencia multiproceso.

## Continuación

Reparentar y separar conservando proyecto y rama, con revisión optimista y prevención de ciclos, en otra unidad. Después, transiciones con migración last_completed_at: completar también desde cancelled bloquea descendientes abiertos; cancelar exige consentimiento para todos los abiertos; reapertura vuelve a in_progress y verifica ancestros/proyecto/cliente concurrentemente. Traslados entre proyectos quedan en T11. Adaptación de UI T7 posterior. Sin aprobación nativa ni commits realizados por el worker.
