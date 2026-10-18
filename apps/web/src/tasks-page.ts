import { Component, ElementRef, HostListener, Injectable, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, apiRequest } from './notes-api';

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
  context: { projectId: string; projectName: string; clientId: string; clientName: string };
  revision: number;
}

export interface ProjectOption { id: string; name: string; state: string; client?: { fullName?: string } }

interface TaskPage { items: Task[]; total: number; offset: number; limit: number }
interface ProjectPage { items: ProjectOption[] }

/** A date being edited: the mode picks the stored shape; `time` only matters for an instant. */
export interface DateDraft { mode: DateMode; day: string; time: string }
export interface ReferenceDraft { id?: string; url: string; name: string }

export const PRIORITY_LABELS: Record<TaskPriority, string> = { none: 'Ninguna', low: 'Baja', medium: 'Media', high: 'Alta' };
const STATE_LABELS: Record<string, string> = { new: 'Nueva' };
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
  readonly items = signal<Task[]>([]);
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

  private snapshot() {
    return JSON.stringify([this.projectId(), this.title(), this.description(), this.priority(), this.planned(), this.due(), this.references()]);
  }
  readonly dirty = computed(() => this.formOpen() && this.snapshot() !== this.initial);
  readonly hasPages = computed(() => this.offset() > 0 || this.offset() + this.items().length < this.total());
  readonly hasNext = computed(() => this.offset() + this.pageSize < this.total());

  priorityLabel(priority: TaskPriority) { return PRIORITY_LABELS[priority]; }
  stateLabel(state: string) { return STATE_LABELS[state] ?? state; }
  hasWarning(task: Task) { return task.warnings.includes('PLANNED_AFTER_DUE'); }

  private listPath(offset: number) {
    const params = new URLSearchParams({ offset: String(offset), limit: String(this.pageSize) });
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
    } catch (error) {
      if (seq === this.loadSeq) this.listError.set(this.message(error));
    } finally { if (seq === this.loadSeq) this.busy.set(false); }
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
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('taskDialog');

  constructor() {
    effect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (!dialog) return;
      if (this.s.formOpen() && !dialog.open) {
        dialog.showModal();
        // The form renders after showModal, so the native autofocus pass finds nothing to focus.
        requestAnimationFrame(() => dialog.querySelector<HTMLElement>('#task-title')?.focus());
      }
      else if (!this.s.formOpen() && dialog.open) dialog.close();
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
