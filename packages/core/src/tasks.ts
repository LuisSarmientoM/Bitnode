import { inputObject, invalid } from './notes.ts';

export type TaskState = 'new' | 'in_progress' | 'blocked' | 'in_review' | 'done' | 'cancelled';
export type TaskPriority = 'none' | 'low' | 'medium' | 'high';
export type TaskDate = { kind: 'day'; day: string } | { kind: 'instant'; at: number; zone: 'America/Bogota' } | null;
export type TaskWarning = 'PLANNED_AFTER_DUE';

export interface TaskReference { id: string; url: string; name: string | null; position: number }

/** Derived, read-only context; never an editable link. */
export interface TaskContext { projectId: string; projectName: string; clientId: string; clientName: string }

export interface Task {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  description: string;
  state: TaskState;
  lastCompletedAt: number | null;
  priority: TaskPriority;
  planned: TaskDate;
  due: TaskDate;
  references: TaskReference[];
  warnings: TaskWarning[];
  context: TaskContext;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface TaskPage { items: Task[]; total: number; offset: number; limit: number }
export interface TaskQuery { projectId: string | undefined }

export interface TasksRepository {
  list(offset: number, limit: number, query?: TaskQuery): TaskPage;
  get(id: string): Task;
  create(value: unknown): Task;
  update(id: string, value: unknown): Task;
  reparent(id: string, value: unknown): Task;
  detach(id: string, value: unknown): Task;
  changeState(id: string, value: unknown): Task;
}

export interface ReferenceInput { id: string | null; url: string; name: string | null }

export const OPEN_TASK_STATES: readonly TaskState[] = ['new', 'in_progress', 'blocked', 'in_review'];
const PRIORITIES: readonly TaskPriority[] = ['none', 'low', 'medium', 'high'];
const TITLE_LIMIT = 500;
const DESCRIPTION_BYTES = 1048576;
const URL_LIMIT = 4096;
const REFERENCE_LIMIT = 100;
/** Colombia has no daylight saving time, so America/Bogota is a fixed UTC-05:00 offset. */
const BOGOTA_OFFSET_MS = 5 * 3600000;

function titleInput(value: unknown): string {
  if (typeof value !== 'string') invalid('El título de la tarea debe ser texto.');
  const title = value.trim();
  if (!title) invalid('El título de la tarea es obligatorio.');
  if ([...title].length > TITLE_LIMIT) invalid('El título de la tarea admite hasta 500 caracteres Unicode.');
  return title;
}

function descriptionInput(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') invalid('La descripción debe ser texto Markdown.');
  if (new TextEncoder().encode(value).length > DESCRIPTION_BYTES) invalid('La descripción admite hasta 1 MiB de texto UTF-8.');
  return value;
}

function civilDay(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid('La fecha debe tener el formato AAAA-MM-DD.');
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1000 || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) invalid('La fecha no existe en el calendario.');
  return value;
}

/** Accepts null, a civil day, or a Colombia local day+HH:mm; `local` is input only and is stored as an instant. */
export function taskDateInput(value: unknown): TaskDate {
  if (value === null) return null;
  const kind = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>).kind : undefined;
  if (kind === 'day') {
    const input = inputObject(value, ['kind', 'day']);
    return { kind: 'day', day: civilDay(input.day) };
  }
  if (kind === 'local') {
    const input = inputObject(value, ['kind', 'day', 'time']);
    const day = civilDay(input.day);
    if (typeof input.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) invalid('La hora debe tener el formato HH:mm.');
    const [year, month, date] = day.split('-').map(Number) as [number, number, number];
    const [hours, minutes] = input.time.split(':').map(Number) as [number, number];
    return { kind: 'instant', at: Date.UTC(year, month - 1, date, hours, minutes) + BOGOTA_OFFSET_MS, zone: 'America/Bogota' };
  }
  invalid('La fecha debe ser vacía, un día o un día con hora de Colombia.');
}

export function bogotaDay(at: number): string {
  return new Date(at - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Instants compare exactly; otherwise Colombia civil days, warning only when planned is unambiguously later. */
export function taskWarnings(planned: TaskDate, due: TaskDate): TaskWarning[] {
  if (!planned || !due) return [];
  if (planned.kind === 'instant' && due.kind === 'instant') return planned.at > due.at ? ['PLANNED_AFTER_DUE'] : [];
  const civil = (date: NonNullable<TaskDate>) => date.kind === 'day' ? date.day : bogotaDay(date.at);
  return civil(planned) > civil(due) ? ['PLANNED_AFTER_DUE'] : [];
}

function priorityInput(value: unknown): TaskPriority {
  if (!PRIORITIES.includes(value as TaskPriority)) invalid('La prioridad debe ser ninguna, baja, media o alta.');
  return value as TaskPriority;
}

function referenceInput(value: unknown): ReferenceInput {
  const input = inputObject(value, ['id', 'url', 'name']);
  if (input.id !== undefined && input.id !== null && (typeof input.id !== 'string' || !input.id)) invalid('La referencia no es válida.');
  if (typeof input.url !== 'string') invalid('La URL de la referencia debe ser texto.');
  const url = input.url.trim();
  if (url.length > URL_LIMIT) invalid('La URL admite hasta 4096 caracteres.');
  let protocol = '';
  try { protocol = new URL(url).protocol; } catch { invalid('Escribe una URL completa que empiece por http:// o https://.'); }
  if (protocol !== 'http:' && protocol !== 'https:') invalid('Escribe una URL completa que empiece por http:// o https://.');
  if (input.name !== undefined && input.name !== null && typeof input.name !== 'string') invalid('El nombre de la referencia debe ser texto.');
  const name = ((input.name as string | null | undefined) ?? '').trim();
  if ([...name].length > TITLE_LIMIT) invalid('El nombre de la referencia admite hasta 500 caracteres Unicode.');
  return { id: (input.id as string | null | undefined) ?? null, url, name: name || null };
}

/** Ordered replacement list; duplicate URLs stay, duplicate ids would make the edit ambiguous. */
function referencesInput(value: unknown): ReferenceInput[] {
  if (!Array.isArray(value)) invalid('Las referencias deben ser una lista.');
  if (value.length > REFERENCE_LIMIT) invalid('La tarea admite hasta 100 referencias.');
  const references = value.map(referenceInput);
  const ids = references.flatMap(reference => reference.id ?? []);
  if (new Set(ids).size !== ids.length) invalid('La lista de referencias repite una referencia.');
  return references;
}

export function taskRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) invalid('Indica la revisión de la tarea que estás editando.');
  return value;
}

/** New tasks are always `new` with no priority; a parent requires the revision the caller read. */
export function taskInput(value: unknown) {
  const input = inputObject(value, ['projectId', 'parentId', 'expectedParentRevision', 'title', 'description', 'planned', 'due']);
  if (typeof input.projectId !== 'string' || !input.projectId) invalid('Selecciona el proyecto de la tarea.');
  const parentId = input.parentId ?? null;
  if (parentId !== null && (typeof parentId !== 'string' || !parentId.trim())) invalid('Selecciona el padre de la subtarea.');
  if (parentId === null && input.expectedParentRevision !== undefined) invalid('La revisión del padre requiere un padre.');
  const parentRevision = parentId === null ? null : taskRevision(input.expectedParentRevision);
  return {
    projectId: input.projectId, parentId, parentRevision, title: titleInput(input.title), description: descriptionInput(input.description),
    planned: input.planned === undefined ? null : taskDateInput(input.planned),
    due: input.due === undefined ? null : taskDateInput(input.due),
  };
}

/** Cancel and reopen use separate commands, not change-state or PATCH. */
export function taskChangeState(value: unknown) {
  const input = inputObject(value, ['expectedRevision', 'state']);
  if (input.state !== 'done' && !OPEN_TASK_STATES.includes(input.state as TaskState)) {
    invalid('Selecciona un estado abierto o completada. Cancelar requiere su propio comando.');
  }
  return { revision: taskRevision(input.expectedRevision), state: input.state as Exclude<TaskState, 'cancelled'> };
}

/** Hierarchy commands never accept project or state changes. */
export function taskReparent(value: unknown) {
  const input = inputObject(value, ['expectedRevision', 'parentId', 'expectedParentRevision']);
  if (typeof input.parentId !== 'string' || !input.parentId.trim()) invalid('Selecciona el nuevo padre.');
  return {
    revision: taskRevision(input.expectedRevision), parentId: input.parentId,
    parentRevision: taskRevision(input.expectedParentRevision),
  };
}

export function taskDetach(value: unknown) {
  const input = inputObject(value, ['expectedRevision']);
  return { revision: taskRevision(input.expectedRevision) };
}

export interface TaskChanges {
  title?: string; description?: string; priority?: TaskPriority; planned?: TaskDate; due?: TaskDate; references?: ReferenceInput[];
}

/** State, project, parent and deletion have their own commands; PATCH rejects them as unknown fields. */
export function taskPatch(value: unknown): { revision: number; changes: TaskChanges } {
  const input = inputObject(value, ['title', 'description', 'priority', 'planned', 'due', 'references', 'expectedRevision']);
  const revision = taskRevision(input.expectedRevision);
  const changes: TaskChanges = {};
  if (input.title !== undefined) changes.title = titleInput(input.title);
  if (input.description !== undefined) changes.description = descriptionInput(input.description);
  if (input.priority !== undefined) changes.priority = priorityInput(input.priority);
  if (input.planned !== undefined) changes.planned = taskDateInput(input.planned);
  if (input.due !== undefined) changes.due = taskDateInput(input.due);
  if (input.references !== undefined) changes.references = referencesInput(input.references);
  if (!Object.keys(changes).length) invalid('Indica el dato de la tarea que quieres editar.');
  return { revision, changes };
}

export function taskQuery(value: { projectId?: unknown }): TaskQuery {
  if (value.projectId !== undefined && (typeof value.projectId !== 'string' || !value.projectId)) invalid('El filtro de proyecto no es válido.');
  return { projectId: value.projectId as string | undefined };
}
