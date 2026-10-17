import { clientNameKey, revisionOf, type ClientScope } from './clients.ts';
import { dayInput } from './days.ts';
import { normalizeText } from './note-query.ts';
import { inputObject, invalid } from './notes.ts';
import { tagIdsInput, type Tag } from './tags.ts';

export const PROJECT_STATES = ['active', 'paused', 'completed', 'archived'] as const;
export type ProjectState = typeof PROJECT_STATES[number];

export interface ProjectWarning { code: 'PROJECT_END_BEFORE_START'; fields: string[]; message: string }

/** Client fields are derived context from the current client row, never a copy stored on the project. */
export interface ProjectClient { id: string; fullName: string; shortName: string | null; scope: ClientScope; archivedAt: number | null }

export interface Project {
  id: string;
  clientId: string;
  client: ProjectClient;
  name: string;
  description: string | null;
  state: ProjectState;
  plannedStartDay: string | null;
  plannedEndDay: string | null;
  tags: Tag[];
  warnings: ProjectWarning[];
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectPage { items: Project[]; total: number; offset: number; limit: number }
export interface ProjectQuery {
  state: ProjectState | undefined; clientId: string | undefined; includeArchived: boolean; query: string; terms: string[];
}

export interface ProjectsRepository {
  list(offset: number, limit: number, query?: Partial<ProjectQuery>): ProjectPage;
  get(id: string): Project;
  create(value: unknown): Project;
  update(id: string, value: unknown): Project;
  changeState(id: string, value: unknown): Project;
  setTags(id: string, value: unknown): Project;
  remove(id: string, value: unknown): void;
}

const NAME_LIMIT = 500;
const DESCRIPTION_BYTES = 1048576;

const isState = (value: unknown): value is ProjectState => PROJECT_STATES.includes(value as ProjectState);

function nameInput(value: unknown): string {
  if (typeof value !== 'string') invalid('El nombre del proyecto debe ser texto.');
  const name = value.trim();
  if (!name) invalid('El nombre del proyecto es obligatorio.');
  if ([...name].length > NAME_LIMIT) invalid('El nombre del proyecto admite hasta 500 caracteres Unicode.');
  return name;
}

function descriptionInput(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') invalid('La descripción debe ser texto.');
  const text = value.trim();
  if (new TextEncoder().encode(text).length > DESCRIPTION_BYTES) invalid('La descripción admite hasta 1 MiB de texto UTF-8.');
  return text || null;
}

const startInput = (value: unknown) => dayInput(value, 'El inicio planificado');
const endInput = (value: unknown) => dayInput(value, 'El fin planificado');

function clientIdInput(value: unknown): string {
  if (typeof value !== 'string' || !value) invalid('Selecciona el cliente del proyecto.');
  return value;
}

/** New projects start active; the state only changes through `change-state`. Uniqueness reuses the client name key rules. */
export function projectInput(value: unknown) {
  const input = inputObject(value, ['clientId', 'name', 'description', 'plannedStartDay', 'plannedEndDay']);
  const name = nameInput(input.name);
  return {
    clientId: clientIdInput(input.clientId), name, nameKey: clientNameKey(name), description: descriptionInput(input.description),
    plannedStartDay: startInput(input.plannedStartDay), plannedEndDay: endInput(input.plannedEndDay),
  };
}

/** The client is fixed: a `clientId` here is rejected, not ignored, like any other unknown field. */
export function projectPatch(value: unknown) {
  const input = inputObject(value, ['name', 'description', 'plannedStartDay', 'plannedEndDay', 'expectedRevision']);
  const revision = revisionOf(input.expectedRevision);
  const changes: Partial<Omit<ReturnType<typeof projectInput>, 'clientId'>> = {};
  if (input.name !== undefined) {
    changes.name = nameInput(input.name);
    changes.nameKey = clientNameKey(changes.name);
  }
  if (input.description !== undefined) changes.description = descriptionInput(input.description);
  if (input.plannedStartDay !== undefined) changes.plannedStartDay = startInput(input.plannedStartDay);
  if (input.plannedEndDay !== undefined) changes.plannedEndDay = endInput(input.plannedEndDay);
  if (!Object.keys(changes).length) invalid('Indica el dato del proyecto que quieres editar.');
  return { revision, changes };
}

export function projectStateInput(value: unknown) {
  const input = inputObject(value, ['state', 'expectedRevision']);
  const revision = revisionOf(input.expectedRevision);
  if (!isState(input.state)) invalid('El estado del proyecto no es válido.');
  return { revision, state: input.state };
}

export function projectRevision(value: unknown): number {
  return revisionOf(inputObject(value, ['expectedRevision']).expectedRevision);
}

export function projectTagsInput(value: unknown) {
  const input = inputObject(value, ['tagIds', 'expectedRevision']);
  return { revision: revisionOf(input.expectedRevision), tagIds: tagIdsInput(input.tagIds) };
}

/** Inverted planning days warn but never block. Days compare as text because both are canonical `YYYY-MM-DD`. */
export function projectWarnings(start: string | null, end: string | null): ProjectWarning[] {
  return start !== null && end !== null && end < start ? [{
    code: 'PROJECT_END_BEFORE_START', fields: ['plannedStartDay', 'plannedEndDay'],
    message: 'La fecha de fin planificada es anterior a la de inicio.',
  }] : [];
}

const words = (value: string) => normalizeText(value).match(/[\p{L}\p{N}\p{M}]+/gu) ?? [];

/** Every term must prefix some word of the project name, description or the client's names, even across fields. */
export function matchesProject(fields: (string | null)[], terms: string[]): boolean {
  const tokens = words(fields.map(field => field ?? '').join('\n'));
  return terms.every(term => tokens.some(token => token.startsWith(term)));
}

/** Archived projects are hidden unless included, or unless the archived state itself is the filter. */
export function projectQuery(value: { state?: unknown; clientId?: unknown; archived?: unknown; q?: unknown }): ProjectQuery {
  if (value.state !== undefined && !isState(value.state)) invalid('El filtro de estado no es válido.');
  if (value.clientId !== undefined && (typeof value.clientId !== 'string' || !value.clientId)) invalid('El filtro de cliente no es válido.');
  if (value.archived !== undefined && value.archived !== 'include') invalid('El filtro de archivados no es válido.');
  if (value.q !== undefined && typeof value.q !== 'string') invalid('La búsqueda debe ser texto.');
  const query = (value.q ?? '').trim();
  if ([...query].length > NAME_LIMIT) invalid('La búsqueda admite hasta 500 caracteres.');
  return {
    state: value.state as ProjectState | undefined, clientId: value.clientId as string | undefined,
    includeArchived: value.archived === 'include', query, terms: [...new Set(words(query))],
  };
}
