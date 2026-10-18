import { Component, ElementRef, HostListener, Injectable, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, apiRequest, type ScopePreview } from './notes-api';

export type TaskPriority = 'none' | 'low' | 'medium' | 'high';
export type TaskDate = null | { kind: 'day'; day: string } | { kind: 'instant'; at: number; zone: string };
export type DateMode = '' | 'day' | 'instant';

export interface TaskReference { id: string; url: string; name: string | null; position: number }

export interface Task {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  description: string | null;
  state: string;
  priority: TaskPriority;
  planned: TaskDate;
  due: TaskDate;
  references: TaskReference[];
  warnings: string[];
  childCount: number;
  context: { projectId: string; projectName: string; clientId: string; clientName: string };
  revision: number;
}

export interface ProjectOption { id: string; name: string; state: string; client?: { fullName?: string } }

interface TaskPage { items: Task[]; total: number; offset: number; limit: number }
/** Direct children of one expanded task, loaded by parent id and page, never derived from the flat list. */
interface ChildNode { items: Task[]; total: number }
interface TreeRow { key: string; kind: 'task' | 'more'; task: Task; depth: number }
interface ProjectPage { items: ProjectOption[] }

/** A date being edited: the mode picks the stored shape; `time` only matters for an instant. */
export interface DateDraft { mode: DateMode; day: string; time: string }
export interface ReferenceDraft { id?: string; url: string; name: string }

export const PRIORITY_LABELS: Record<TaskPriority, string> = { none: 'Ninguna', low: 'Baja', medium: 'Media', high: 'Alta' };
const STATE_LABELS: Record<string, string> = {
  new: 'Nueva', in_progress: 'En curso', blocked: 'Bloqueada', in_review: 'En revisión', done: 'Completada', cancelled: 'Cancelada',
};
const OPEN_STATES = ['new', 'in_progress', 'blocked', 'in_review'];
/** Targets named in a preview; the rest are summarised as a count. */
const NAMED_TARGETS = 10;

type EffectKind = 'cancel' | 'reopen';
/** Colombia has no daylight saving time, so America/Bogota is a fixed UTC-5. */
const BOGOTA_OFFSET_MS = 5 * 3600 * 1000;
const noDate = (): DateDraft => ({ mode: '', day: '', time: '' });

function toDraft(value: TaskDate): DateDraft {
  if (!value) return noDate();
  if (value.kind === 'day') return { mode: 'day', day: value.day, time: '' };
  const local = new Date(value.at - BOGOTA_OFFSET_MS).toISOString();
  return { mode: 'instant', day: local.slice(0, 10), time: local.slice(11, 16) };
}

/** Preserves the null / day / local shapes the API accepts; never sends kind 'instant'. */
function toInput(draft: DateDraft) {
  if (draft.mode === 'day') return { kind: 'day', day: draft.day };
  if (draft.mode === 'instant') return { kind: 'local', day: draft.day, time: draft.time };
  return null;
}

function dateError(label: string, draft: DateDraft): string {
  if (draft.mode && !draft.day) return `${label}: elige un día.`;
  if (draft.mode === 'instant' && !draft.time) return `${label}: elige una hora.`;
  return '';
}

export function formatTaskDate(value: TaskDate): string {
  if (!value) return '—';
  const draft = toDraft(value);
  const [year, month, day] = draft.day.split('-');
  return `${day}/${month}/${year}${value.kind === 'instant' ? ' ' + draft.time : ''}`;
}

/**
 * Tasks state lives in a root service so a form draft survives the component being destroyed,
 * for example when the session expires and the login screen replaces the shell.
 */
@Injectable({ providedIn: 'root' })
export class TasksStore {
  readonly pageSize = 50;
  /** Root tasks of the current page; deeper levels live in `children`. */
  readonly items = signal<Task[]>([]);
  readonly expanded = signal<ReadonlySet<string>>(new Set());
  readonly children = signal<Record<string, ChildNode>>({});
  readonly loadingNodes = signal<ReadonlySet<string>>(new Set());
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly projectFilter = signal('');
  readonly filterProjects = signal<ProjectOption[]>([]);
  readonly busy = signal(false);
  readonly listError = signal('');
  readonly notice = signal('');

  readonly formOpen = signal(false);
  readonly editing = signal<Task | null>(null);
  /** A fetched, saved task, never inferred from the paginated list. */
  readonly parent = signal<Task | null>(null);
  readonly selectedState = signal('');
  readonly formNotice = signal('');
  /** Effects the server asked the user to accept; nothing is sent again until Confirmar. */
  readonly effect = signal<{ kind: EffectKind; preview: ScopePreview } | null>(null);
  readonly effectNames = signal<Record<string, string>>({});
  readonly hierarchyTarget = signal<Task | null>(null);
  readonly parentOptions = signal<Task[]>([]);
  readonly selectedParentId = signal('');
  /** Only active or paused projects accept new tasks. */
  readonly openProjects = signal<ProjectOption[]>([]);
  readonly projectId = signal('');
  readonly title = signal('');
  readonly description = signal('');
  readonly priority = signal<TaskPriority>('none');
  readonly planned = signal<DateDraft>(noDate());
  readonly due = signal<DateDraft>(noDate());
  readonly references = signal<ReferenceDraft[]>([]);
  readonly formError = signal('');
  readonly conflict = signal(false);
  private initial = '';
  private loadSeq = 0;
  private treeKey = '';

  /** Flattened visible tree, in display order; each row is keyed by its path so a task shown twice never collides. */
  readonly rows = computed(() => {
    const out: TreeRow[] = [];
    const open = this.expanded();
    const nodes = this.children();
    const walk = (task: Task, depth: number, path: string) => {
      if (`/${path}/`.includes(`/${task.id}/`)) return;
      const key = path ? `${path}/${task.id}` : task.id;
      out.push({ key, kind: 'task', task, depth });
      const node = open.has(task.id) ? nodes[task.id] : undefined;
      if (!node) return;
      for (const child of node.items) walk(child, depth + 1, key);
      if (node.items.length < node.total) out.push({ key: `${key}/more`, kind: 'more', task, depth: depth + 1 });
    };
    for (const root of this.items()) walk(root, 0, '');
    return out;
  });

  private snapshot() {
    return JSON.stringify([this.projectId(), this.title(), this.description(), this.priority(), this.planned(), this.due(), this.references(), this.selectedParentId()]);
  }
  readonly dirty = computed(() => this.formOpen() && this.snapshot() !== this.initial);
  readonly hasPages = computed(() => this.offset() > 0 || this.offset() + this.items().length < this.total());
  readonly hasNext = computed(() => this.offset() + this.pageSize < this.total());

  priorityLabel(priority: TaskPriority) { return PRIORITY_LABELS[priority]; }
  stateLabel(state: string) { return STATE_LABELS[state] ?? state; }
  hasWarning(task: Task) { return task.warnings.includes('PLANNED_AFTER_DUE'); }
  isOpen(task: Task) { return OPEN_STATES.includes(task.state); }

  /** Human-readable lines for the previewed effects; unknown effect codes get one generic line. */
  readonly effectLines = computed(() => {
    const effect = this.effect();
    const task = this.editing();
    if (!effect || !task) return [];
    const names = this.effectNames();
    const list = (targets: string[]) => {
      const shown = targets.slice(0, NAMED_TARGETS).map(id => `«${names[id] ?? 'otra tarea'}»`).join(', ');
      return targets.length > NAMED_TARGETS ? `${shown} y ${targets.length - NAMED_TARGETS} más` : shown;
    };
    return effect.preview.effects.map(item => {
      if (item.code === 'CANCEL_DESCENDANTS') return `Se cancelarán estos descendientes abiertos: ${list(item.targets)}.`;
      if (item.code === 'REOPEN_ANCESTORS') return `Se reabrirán estos ancestros cerrados: ${list(item.targets)}.`;
      if (item.code === 'REACTIVATE_PROJECT') return `Se reactivará el proyecto «${task.context.projectName}».`;
      return 'Este cambio también afecta a otros elementos relacionados con la tarea.';
    });
  });

  private listPath(offset: number) {
    const params = new URLSearchParams({ roots: 'true', offset: String(offset), limit: String(this.pageSize) });
    if (this.projectFilter()) params.set('projectId', this.projectFilter());
    return '/tasks?' + params;
  }

  async load(offset = this.offset()) {
    const seq = ++this.loadSeq;
    this.busy.set(true);
    this.listError.set('');
    try {
      const page = await apiRequest<TaskPage>(this.listPath(offset));
      if (seq !== this.loadSeq) return;
      if (!page.items.length && page.offset > 0) { await this.load(Math.max(0, page.offset - this.pageSize)); return; }
      this.items.set(page.items);
      this.total.set(page.total);
      this.offset.set(page.offset);
      await this.syncTree(seq);
    } catch (error) {
      if (seq === this.loadSeq) this.listError.set(this.message(error));
    } finally { if (seq === this.loadSeq) this.busy.set(false); }
  }

  /** A new filter or page starts collapsed; reloading the same page keeps what the user expanded. */
  private async syncTree(seq: number) {
    const key = `${this.projectFilter()}|${this.offset()}`;
    if (key !== this.treeKey) {
      this.treeKey = key;
      this.expanded.set(new Set());
      this.children.set({});
      return;
    }
    const nodes = await Promise.all([...this.expanded()].map(async (id): Promise<[string, ChildNode] | null> => {
      // A node that fails to refresh keeps its last rows.
      try { return [id, await this.fetchNode(id, Math.max(this.pageSize, this.children()[id]?.items.length ?? 0))]; } catch { return null; }
    }));
    if (seq !== this.loadSeq) return;
    this.children.update(map => ({ ...map, ...Object.fromEntries(nodes.filter((node): node is [string, ChildNode] => node !== null)) }));
  }

  private childrenPath(id: string, offset: number) {
    return '/tasks?' + new URLSearchParams({ parentId: id, offset: String(offset), limit: String(this.pageSize) });
  }

  /** Reads pages from the start until `want` children are loaded, so a refresh keeps what "Cargar más" had added. */
  private async fetchNode(id: string, want = this.pageSize): Promise<ChildNode> {
    const items: Task[] = [];
    while (true) {
      const page = await apiRequest<TaskPage>(this.childrenPath(id, items.length));
      items.push(...page.items);
      if (!page.items.length || items.length >= page.total || items.length >= want) return { items, total: page.total };
    }
  }

  private async trackNode(id: string, work: () => Promise<void>) {
    this.loadingNodes.update(set => new Set(set).add(id));
    try { await work(); } finally {
      this.loadingNodes.update(set => { const next = new Set(set); next.delete(id); return next; });
    }
  }

  /** Expanding loads the direct children; collapsing drops the whole subtree so it reopens collapsed. */
  async toggleNode(task: Task) {
    if (this.expanded().has(task.id)) { this.collapse(task.id); return; }
    this.expanded.update(open => new Set(open).add(task.id));
    await this.trackNode(task.id, async () => {
      try {
        const node = await this.fetchNode(task.id);
        if (this.expanded().has(task.id)) this.children.update(map => ({ ...map, [task.id]: node }));
      } catch (error) {
        this.expanded.update(open => { const next = new Set(open); next.delete(task.id); return next; });
        this.listError.set(this.message(error));
      }
    });
  }

  private collapse(id: string) {
    const dropped = new Set<string>();
    const walk = (nodeId: string) => {
      dropped.add(nodeId);
      for (const child of this.children()[nodeId]?.items ?? []) walk(child.id);
    };
    walk(id);
    this.expanded.update(open => new Set([...open].filter(value => !dropped.has(value))));
    this.children.update(map => Object.fromEntries(Object.entries(map).filter(([key]) => !dropped.has(key))));
  }

  async loadMore(task: Task) {
    const node = this.children()[task.id];
    if (!node || this.loadingNodes().has(task.id)) return;
    await this.trackNode(task.id, async () => {
      try {
        const page = await apiRequest<TaskPage>(this.childrenPath(task.id, node.items.length));
        this.children.update(map => map[task.id] ? { ...map, [task.id]: { items: [...map[task.id]!.items, ...page.items], total: page.total } } : map);
      } catch (error) { this.listError.set(this.message(error)); }
    });
  }

  /** The filter offers every project; failing to load it never blocks the task list. */
  async loadFilterProjects() {
    try { this.filterProjects.set((await apiRequest<ProjectPage>('/projects?limit=200')).items); }
    catch { /* the list still works without the filter options */ }
  }

  setProjectFilter(value: string) {
    if (this.projectFilter() === value) return;
    this.projectFilter.set(value);
    void this.load(0);
  }

  private async loadOpenProjects() {
    const [active, paused] = await Promise.all([
      apiRequest<ProjectPage>('/projects?state=active&limit=200'),
      apiRequest<ProjectPage>('/projects?state=paused&limit=200'),
    ]);
    this.openProjects.set([...active.items, ...paused.items].sort((a, b) => a.name.localeCompare(b.name)));
  }

  private fill(task: Task | null) {
    this.editing.set(task);
    this.parent.set(null);
    this.selectedState.set(task?.state ?? '');
    this.formNotice.set('');
    this.effect.set(null);
    this.effectNames.set({});
    this.hierarchyTarget.set(null);
    this.parentOptions.set([]);
    this.selectedParentId.set('');
    this.projectId.set(task?.projectId ?? '');
    this.title.set(task?.title ?? '');
    this.description.set(task?.description ?? '');
    this.priority.set(task?.priority ?? 'none');
    this.planned.set(toDraft(task?.planned ?? null));
    this.due.set(toDraft(task?.due ?? null));
    this.references.set((task?.references ?? []).map(ref => ({ id: ref.id, url: ref.url, name: ref.name ?? '' })));
    this.initial = this.snapshot();
    this.formError.set('');
    this.conflict.set(false);
  }

  async openCreate() {
    if (this.busy()) return;
    this.busy.set(true);
    this.listError.set('');
    this.notice.set('');
    try {
      await this.loadOpenProjects();
      this.fill(null);
      this.formOpen.set(true);
    } catch (error) { this.listError.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  async openSubtask(task: Task) {
    if (this.busy()) return;
    this.busy.set(true);
    this.listError.set('');
    this.notice.set('');
    try {
      const parent = await apiRequest<Task>('/tasks/' + encodeURIComponent(task.id));
      if (parent.state === 'done' || parent.state === 'cancelled') {
        this.listError.set('Reabre explícitamente el padre y sus ancestros cerrados antes de crear la subtarea.');
        return;
      }
      this.fill(null);
      this.parent.set(parent);
      this.projectId.set(parent.projectId);
      this.initial = this.snapshot();
      this.formOpen.set(true);
    } catch (error) { this.listError.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  private async fillSaved(task: Task) {
    const parent = task.parentId ? await apiRequest<Task>('/tasks/' + encodeURIComponent(task.parentId)) : null;
    this.fill(task);
    this.parent.set(parent);
  }

  /** Edit always starts from the server's current revision, never from the possibly stale row. */
  async openEdit(task: Task) {
    if (this.busy()) return;
    this.busy.set(true);
    this.listError.set('');
    this.notice.set('');
    try {
      await this.fillSaved(await apiRequest<Task>('/tasks/' + encodeURIComponent(task.id)));
      this.formOpen.set(true);
    } catch (error) { this.listError.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  /** Load all project pages before offering candidates, independently of the visible list. */
  private async projectTasks(projectId: string): Promise<Task[]> {
    const tasks: Task[] = [];
    let offset = 0;
    while (true) {
      const params = new URLSearchParams({ projectId, offset: String(offset), limit: String(this.pageSize) });
      const page = await apiRequest<TaskPage>('/tasks?' + params);
      tasks.push(...page.items);
      offset += page.items.length;
      if (offset >= page.total) return tasks;
      if (!page.items.length) throw new Error('No se pudieron cargar todos los candidatos. Vuelve a abrir Cambiar padre.');
    }
  }

  async openHierarchy(task: Task) {
    if (this.busy()) return;
    this.busy.set(true);
    this.listError.set('');
    this.notice.set('');
    try {
      const current = await apiRequest<Task>('/tasks/' + encodeURIComponent(task.id));
      const tasks = await this.projectTasks(current.projectId);
      const children = new Map<string, string[]>();
      for (const candidate of tasks) {
        if (!candidate.parentId) continue;
        const siblings = children.get(candidate.parentId) ?? [];
        siblings.push(candidate.id);
        children.set(candidate.parentId, siblings);
      }
      const excluded = new Set<string>();
      const pending = [current.id];
      while (pending.length) {
        const id = pending.pop()!;
        if (excluded.has(id)) continue;
        excluded.add(id);
        pending.push(...(children.get(id) ?? []));
      }
      this.fill(null);
      this.hierarchyTarget.set(current);
      this.parentOptions.set(tasks.filter(candidate => candidate.projectId === current.projectId && !excluded.has(candidate.id)));
      this.selectedParentId.set(current.parentId ?? '');
      this.initial = this.snapshot();
      this.formOpen.set(true);
    } catch (error) { this.listError.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  async saveHierarchy() {
    const current = this.hierarchyTarget();
    if (!current || this.busy()) return;
    const parentId = this.selectedParentId();
    const parent = this.parentOptions().find(candidate => candidate.id === parentId);
    if (parentId && !parent) {
      this.formError.set('Selecciona un padre de la lista o Sin padre.');
      return;
    }
    this.busy.set(true);
    this.formError.set('');
    try {
      // Revisions are the ones read when opening, including for a no-op.
      await apiRequest<Task>('/tasks/' + encodeURIComponent(current.id) + (parent ? '/reparent' : '/detach'), 'POST', {
        expectedRevision: current.revision,
        ...(parent ? { parentId: parent.id, expectedParentRevision: parent.revision } : {}),
      });
    } catch (error) {
      const hint = error instanceof ApiError && error.code === 'REVISION_CONFLICT'
        ? ' Cancela y vuelve a abrir Cambiar padre para leer las revisiones actuales.' : '';
      this.formError.set(this.message(error) + hint);
      this.busy.set(false);
      return;
    }
    this.formOpen.set(false);
    this.notice.set('Padre guardado.');
    this.busy.set(false);
    await this.load();
  }

  /** Applies a simple state. The revision is the one read when the form opened or the last server answer, never refreshed here. */
  async applyState() {
    const current = this.editing();
    const state = this.selectedState();
    if (!current || !state || this.busy()) return;
    this.busy.set(true);
    this.formError.set('');
    this.formNotice.set('');
    this.conflict.set(false);
    try {
      const saved = await apiRequest<Task>(`/tasks/${encodeURIComponent(current.id)}/change-state`, 'POST', { expectedRevision: current.revision, state });
      this.editing.set(saved);
      this.formNotice.set('Estado actualizado.');
    } catch (error) {
      this.conflict.set(error instanceof ApiError && error.reason === 'REVISION_MISMATCH');
      this.formError.set(this.message(error));
      this.busy.set(false);
      return;
    }
    this.busy.set(false);
    await this.load();
  }

  /** Titles already on the page or fetched by id; only the first targets are named. */
  private async nameTargets(preview: ScopePreview) {
    const known = new Map(this.rows().filter(row => row.kind === 'task').map(row => [row.task.id, row.task.title]));
    const ids = [...new Set(preview.effects.flatMap(item => item.code === 'REACTIVATE_PROJECT' ? [] : item.targets.slice(0, NAMED_TARGETS)))];
    const titles = await Promise.all(ids.map(async (id): Promise<[string, string]> =>
      [id, known.get(id) ?? await apiRequest<Task>('/tasks/' + encodeURIComponent(id)).then(task => task.title, () => '')]));
    this.effectNames.set(Object.fromEntries(titles.filter(([, title]) => title)));
  }

  private async showEffect(kind: EffectKind, preview: ScopePreview) {
    await this.nameTargets(preview);
    this.effect.set({ kind, preview });
  }

  /** First request has no acceptance: the server answers with the effects, or applies directly when there are none. */
  async requestEffect(kind: EffectKind, accepted?: ScopePreview) {
    const current = this.editing();
    if (!current || this.busy()) return;
    this.busy.set(true);
    this.formError.set('');
    this.formNotice.set('');
    this.conflict.set(false);
    try {
      await apiRequest<Task>(`/tasks/${encodeURIComponent(current.id)}/${kind === 'cancel' ? 'cancel' : 'reopen'}`, 'POST', {
        expectedRevision: current.revision,
        ...(accepted ? { acceptance: { previewDigest: accepted.previewDigest, effects: accepted.effects.map(({ code, targets }) => ({ code, targets })) } } : {}),
      });
    } catch (error) {
      if (error instanceof ApiError && error.preview && (error.code === 'CONFIRMATION_REQUIRED' || error.reason === 'PREVIEW_CHANGED')) {
        await this.showEffect(kind, error.preview);
        if (error.reason === 'PREVIEW_CHANGED') this.formError.set('La información cambió. Revisa el resumen actualizado y confirma de nuevo.');
      } else {
        this.conflict.set(error instanceof ApiError && error.reason === 'REVISION_MISMATCH');
        this.formError.set(this.message(error));
      }
      this.busy.set(false);
      return;
    }
    this.formOpen.set(false);
    this.notice.set(kind === 'cancel' ? 'Tarea cancelada.' : 'Tarea reabierta.');
    this.busy.set(false);
    await this.load();
  }

  confirmEffect() {
    const effect = this.effect();
    if (effect) void this.requestEffect(effect.kind, effect.preview);
  }

  /** Back from the confirmation panel: nothing was changed. */
  dismissEffect() {
    this.effect.set(null);
    this.formError.set('');
  }

  /** Returns false when the user keeps a dirty draft. */
  cancel(): boolean {
    if (this.busy()) return false;
    if (this.dirty() && !window.confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?')) return false;
    this.formOpen.set(false);
    return true;
  }

  async reloadSaved() {
    const current = this.editing();
    if (!current || this.busy()) return;
    if (this.dirty() && !window.confirm('Se reemplazará tu borrador por la versión guardada. ¿Continuar?')) return;
    this.busy.set(true);
    try { await this.fillSaved(await apiRequest<Task>('/tasks/' + encodeURIComponent(current.id))); }
    catch (error) { this.formError.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  setDate(field: 'planned' | 'due', change: Partial<DateDraft>) {
    const target = field === 'planned' ? this.planned : this.due;
    target.update(draft => ({ ...draft, ...change }));
  }

  addReference() { this.references.update(list => [...list, { url: '', name: '' }]); }
  removeReference(index: number) { this.references.update(list => list.filter((_, position) => position !== index)); }
  setReference(index: number, change: Partial<ReferenceDraft>) {
    this.references.update(list => list.map((ref, position) => position === index ? { ...ref, ...change } : ref));
  }

  private validate(creating: boolean): string {
    if (creating && !this.projectId()) return 'Selecciona un proyecto para la tarea.';
    if (!this.title().trim()) return 'El título es obligatorio.';
    const dates = dateError('Planificación', this.planned()) || dateError('Límite', this.due());
    if (dates) return dates;
    const index = this.references().findIndex(ref => !ref.url.trim());
    return index >= 0 ? `La referencia ${index + 1} necesita una URL.` : '';
  }

  async save() {
    if (this.busy()) return;
    const current = this.editing();
    const problem = this.validate(!current);
    if (problem) { this.formError.set(problem); return; }
    this.busy.set(true);
    this.formError.set('');
    this.conflict.set(false);
    try {
      if (current) {
        await apiRequest<Task>('/tasks/' + encodeURIComponent(current.id), 'PATCH', {
          expectedRevision: current.revision, title: this.title(), description: this.description(), priority: this.priority(),
          planned: toInput(this.planned()), due: toInput(this.due()),
          references: this.references().map(ref => ({ ...(ref.id ? { id: ref.id } : {}), url: ref.url.trim(), ...(ref.name.trim() ? { name: ref.name } : {}) })),
        });
      } else {
        await apiRequest<Task>('/tasks', 'POST', {
          projectId: this.projectId(), parentId: this.parent()?.id ?? null, title: this.title(),
          ...(this.parent() ? { expectedParentRevision: this.parent()!.revision } : {}),
          ...(this.description().trim() ? { description: this.description() } : {}),
          ...(this.planned().mode ? { planned: toInput(this.planned()) } : {}),
          ...(this.due().mode ? { due: toInput(this.due()) } : {}),
          ...(this.references().length ? { references: this.references().map(ref => ({ url: ref.url.trim(), ...(ref.name.trim() ? { name: ref.name } : {}) })) } : {}),
        });
      }
    } catch (error) {
      this.conflict.set(error instanceof ApiError && (error.code === 'REVISION_CONFLICT' || error.reason === 'REVISION_MISMATCH'));
      const retryHint = !current && this.parent() && this.conflict()
        ? ' Cancela y vuelve a abrir Crear subtarea para leer el padre actualizado. Conserva tu texto antes de cancelar.' : '';
      this.formError.set(this.message(error) + retryHint);
      this.busy.set(false);
      return;
    }
    this.formOpen.set(false);
    this.notice.set('Tarea guardada.');
    this.busy.set(false);
    await this.load(current ? this.offset() : 0);
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'No se pudo completar la operación.';
  }
}

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './tasks-page.html',
  styleUrl: './tasks-page.css',
})
export class TasksPage implements OnInit {
  readonly s = inject(TasksStore);
  readonly formatDate = formatTaskDate;
  readonly priorities = Object.entries(PRIORITY_LABELS) as [TaskPriority, string][];
  readonly stateOptions = [...OPEN_STATES, 'done'];
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('taskDialog');

  constructor() {
    effect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (!dialog) return;
      if (this.s.formOpen() && !dialog.open) {
        dialog.showModal();
        // The form renders after showModal, so the native autofocus pass finds nothing to focus.
        requestAnimationFrame(() => dialog.querySelector<HTMLElement>(this.s.hierarchyTarget() ? '#task-parent' : '#task-title')?.focus());
      }
      else if (!this.s.formOpen() && dialog.open) dialog.close();
    });
    // A new or refreshed preview moves focus to its confirm button; going back returns it to the action that opened it.
    let kind: EffectKind | undefined;
    effect(() => {
      const shown = this.s.effect();
      if (shown) kind = shown.kind;
      requestAnimationFrame(() => document.getElementById(shown ? 'task-effect-confirm' : kind === 'reopen' ? 'task-reopen' : 'task-cancel')?.focus());
    });
  }

  ngOnInit() {
    void this.s.load();
    void this.s.loadFilterProjects();
  }

  onCancel(event: Event) {
    event.preventDefault();
    this.s.cancel();
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent) {
    if (this.s.dirty()) { event.preventDefault(); event.returnValue = ''; }
  }
}
