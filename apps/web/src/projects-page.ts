import { Component, ElementRef, HostListener, Injectable, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, apiRequest, type Tag } from './notes-api';

export type ProjectState = 'active' | 'paused' | 'completed' | 'archived';
export type ProjectPanel = 'state' | 'tags' | 'delete';

interface ProjectWarning { code: string; fields: string[]; message: string }

export interface Project {
  id: string;
  clientId: string;
  client: { id: string; fullName: string; shortName: string | null; archivedAt: number | null };
  name: string;
  description: string | null;
  state: ProjectState;
  plannedStartDay: string | null;
  plannedEndDay: string | null;
  tags: Tag[];
  warnings: ProjectWarning[];
  revision: number;
}

interface ProjectPage { items: Project[]; total: number; offset: number; limit: number }
interface ClientOption { id: string; fullName: string }

const STATE_LABELS: Record<ProjectState, string> = {
  active: 'Activo', paused: 'Pausado', completed: 'Completado', archived: 'Archivado',
};

/** Root service, like ClientsStore, so a draft survives the component being destroyed (for example on session expiry). */
@Injectable({ providedIn: 'root' })
export class ProjectsStore {
  readonly pageSize = 50;
  readonly states = Object.keys(STATE_LABELS) as ProjectState[];
  readonly items = signal<Project[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly stateFilter = signal<'' | ProjectState>('');
  readonly includeArchived = signal(false);
  readonly busy = signal(false);
  readonly listError = signal('');
  readonly query = signal('');
  readonly appliedQuery = signal('');
  readonly notice = signal('');

  readonly formOpen = signal(false);
  readonly editing = signal<Project | null>(null);
  /** Only non-archived clients can receive a new project; the server re-checks it. */
  readonly clients = signal<ClientOption[]>([]);
  readonly clientId = signal('');
  readonly name = signal('');
  readonly description = signal('');
  readonly plannedStartDay = signal('');
  readonly plannedEndDay = signal('');
  readonly formError = signal('');
  readonly conflict = signal(false);
  private initial = { name: '', description: '', plannedStartDay: '', plannedEndDay: '' };

  readonly menuFor = signal<string | null>(null);
  readonly menuPos = signal({ top: 0, left: 0 });
  readonly panel = signal<ProjectPanel | null>(null);
  readonly panelProject = signal<Project | null>(null);
  readonly panelError = signal('');
  readonly panelConflict = signal(false);
  readonly stateTarget = signal<'' | ProjectState>('');
  readonly allTags = signal<Tag[]>([]);
  readonly tagSelection = signal<string[]>([]);
  private tagsInitial: string[] = [];
  readonly tagsDirty = computed(() => this.panel() === 'tags' && this.tagSelection().join(',') !== this.tagsInitial.join(','));
  private loadSeq = 0;

  readonly dirty = computed(() => this.formOpen() && (this.editing()
    ? this.name() !== this.initial.name || this.description() !== this.initial.description
      || this.plannedStartDay() !== this.initial.plannedStartDay || this.plannedEndDay() !== this.initial.plannedEndDay
    : !!(this.clientId() || this.name() || this.description() || this.plannedStartDay() || this.plannedEndDay())));
  readonly hasPages = computed(() => this.offset() > 0 || this.offset() + this.items().length < this.total());
  readonly hasNext = computed(() => this.offset() + this.pageSize < this.total());

  label(state: ProjectState) { return STATE_LABELS[state]; }

  private listPath(offset: number, query: string) {
    const params = new URLSearchParams({ offset: String(offset), limit: String(this.pageSize) });
    if (query) params.set('q', query);
    if (this.stateFilter()) params.set('state', this.stateFilter());
    if (this.includeArchived()) params.set('archived', 'include');
    return '/projects?' + params;
  }

  async load(offset = this.offset(), query = this.appliedQuery()) {
    const seq = ++this.loadSeq;
    this.busy.set(true);
    this.listError.set('');
    try {
      const page = await apiRequest<ProjectPage>(this.listPath(offset, query));
      if (seq !== this.loadSeq) return;
      if (!page.items.length && page.offset > 0) { await this.load(Math.max(0, page.offset - this.pageSize), query); return; }
      this.appliedQuery.set(query);
      this.items.set(page.items);
      this.total.set(page.total);
      this.offset.set(page.offset);
    } catch (error) {
      if (seq === this.loadSeq) this.listError.set(this.message(error));
    } finally { if (seq === this.loadSeq) this.busy.set(false); }
  }

  applySearch() {
    if (this.busy()) return;
    void this.load(0, this.query().trim());
  }

  setStateFilter(value: '' | ProjectState) {
    if (this.stateFilter() === value) return;
    this.stateFilter.set(value);
    void this.load(0);
  }

  setIncludeArchived(value: boolean) {
    this.includeArchived.set(value);
    void this.load(0);
  }

  private fill(project: Project | null) {
    this.editing.set(project);
    this.clientId.set('');
    this.name.set(project?.name ?? '');
    this.description.set(project?.description ?? '');
    this.plannedStartDay.set(project?.plannedStartDay ?? '');
    this.plannedEndDay.set(project?.plannedEndDay ?? '');
    this.initial = { name: this.name(), description: this.description(), plannedStartDay: this.plannedStartDay(), plannedEndDay: this.plannedEndDay() };
    this.formError.set('');
    this.conflict.set(false);
  }

  async openCreate() {
    if (this.busy()) return;
    this.busy.set(true);
    this.notice.set('');
    this.listError.set('');
    try {
      const page = await apiRequest<{ items: ClientOption[] }>('/clients?offset=0&limit=200');
      this.clients.set(page.items.map(client => ({ id: client.id, fullName: client.fullName })));
      this.fill(null);
      this.formOpen.set(true);
    } catch (error) { this.listError.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  /** Edit always starts from the server's current revision, never from the possibly stale row. */
  async openEdit(project: Project) {
    if (this.busy()) return;
    this.busy.set(true);
    this.listError.set('');
    this.notice.set('');
    try {
      this.fill(await apiRequest<Project>('/projects/' + encodeURIComponent(project.id)));
      this.formOpen.set(true);
    } catch (error) { this.listError.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

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
    try { this.fill(await apiRequest<Project>('/projects/' + encodeURIComponent(current.id))); }
    catch (error) { this.formError.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  async save() {
    if (this.busy()) return;
    const current = this.editing();
    if (!current && !this.clientId()) { this.formError.set('Selecciona el cliente del proyecto.'); return; }
    if (!this.name().trim()) { this.formError.set('El nombre del proyecto es obligatorio.'); return; }
    this.busy.set(true);
    this.formError.set('');
    this.conflict.set(false);
    const fields = {
      name: this.name(), description: this.description() || null,
      plannedStartDay: this.plannedStartDay() || null, plannedEndDay: this.plannedEndDay() || null,
    };
    let saved: Project;
    try {
      saved = current
        ? await apiRequest<Project>('/projects/' + encodeURIComponent(current.id), 'PATCH', { expectedRevision: current.revision, ...fields })
        : await apiRequest<Project>('/projects', 'POST', { clientId: this.clientId(), ...fields });
    } catch (error) {
      this.conflict.set(error instanceof ApiError && error.reason === 'REVISION_MISMATCH');
      this.formError.set(this.message(error));
      this.busy.set(false);
      return;
    }
    this.formOpen.set(false);
    // Warnings never block the save; they are shown once with the confirmation.
    this.notice.set(['Proyecto guardado.', ...saved.warnings.map(warning => warning.message)].join(' '));
    this.busy.set(false);
    await this.load(current ? this.offset() : 0);
  }

  toggleMenu(project: Project, event: Event) {
    if (this.menuFor() === project.id) { this.menuFor.set(null); return; }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const height = 120;
    const top = rect.bottom + 4 + height <= window.innerHeight - 8 ? rect.bottom + 4 : Math.max(8, rect.top - 4 - height);
    this.menuPos.set({ top, left: Math.max(8, Math.min(rect.right - 176, window.innerWidth - 184)) });
    this.menuFor.set(project.id);
  }

  /** Every panel starts from the server's current project, never from a possibly stale row. */
  async openPanel(panel: ProjectPanel, project: Project) {
    if (this.busy()) return;
    this.menuFor.set(null);
    this.busy.set(true);
    this.listError.set('');
    this.notice.set('');
    try {
      const current = await apiRequest<Project>('/projects/' + encodeURIComponent(project.id));
      if (panel === 'tags') {
        this.allTags.set(await apiRequest<Tag[]>('/tags'));
        this.tagsInitial = current.tags.map(tag => tag.id).sort();
        this.tagSelection.set([...this.tagsInitial]);
      }
      this.panelProject.set(current);
      this.stateTarget.set('');
      this.panelError.set('');
      this.panelConflict.set(false);
      this.panel.set(panel);
    } catch (error) { this.listError.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  closePanel(): boolean {
    if (this.busy()) return false;
    if (this.tagsDirty() && !window.confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?')) return false;
    this.panel.set(null);
    return true;
  }

  async reloadPanelProject() {
    const current = this.panelProject();
    if (!current || this.busy()) return;
    this.busy.set(true);
    try {
      this.panelProject.set(await apiRequest<Project>('/projects/' + encodeURIComponent(current.id)));
      this.panelError.set('');
      this.panelConflict.set(false);
    } catch (error) { this.panelError.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  private async runPanel(action: (project: Project) => Promise<unknown>, notice: string) {
    const project = this.panelProject();
    if (!project || this.busy()) return;
    this.busy.set(true);
    this.panelError.set('');
    this.panelConflict.set(false);
    try {
      await action(project);
      this.panel.set(null);
      this.notice.set(notice);
      this.busy.set(false);
      await this.load();
    } catch (error) {
      this.panelConflict.set(error instanceof ApiError && error.reason === 'REVISION_MISMATCH');
      // The client is never reactivated from here: that stays an explicit action in Clientes.
      this.panelError.set(error instanceof ApiError && error.reason === 'CLIENT_ARCHIVED'
        ? `${error.message} Ve a Clientes y reactiva «${project.client.fullName}» antes de cambiar este estado.`
        : this.message(error));
      this.busy.set(false);
    }
  }

  saveState() {
    const state = this.stateTarget();
    if (!state) return;
    return this.runPanel(project => apiRequest<Project>(`/projects/${encodeURIComponent(project.id)}/change-state`, 'POST',
      { expectedRevision: project.revision, state }), `Estado actualizado a ${this.label(state)}.`);
  }

  toggleTag(id: string, checked: boolean) {
    this.tagSelection.update(ids => (checked ? [...new Set([...ids, id])] : ids.filter(value => value !== id)).sort());
  }

  saveTags() {
    if (!this.tagsDirty()) return;
    return this.runPanel(project => apiRequest<Project>(`/projects/${encodeURIComponent(project.id)}/tags`, 'PUT',
      { expectedRevision: project.revision, tagIds: this.tagSelection() }), 'Etiquetas guardadas.');
  }

  deleteProject() {
    return this.runPanel(project => apiRequest<{ id: string }>('/projects/' + encodeURIComponent(project.id), 'DELETE',
      { expectedRevision: project.revision }), 'Proyecto eliminado.');
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'No se pudo completar la operación.';
  }
}

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './projects-page.html',
  styleUrls: ['./clients-page.css', './projects-page.css'],
})
export class ProjectsPage implements OnInit {
  readonly s = inject(ProjectsStore);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('projectDialog');
  private readonly panelDialog = viewChild<ElementRef<HTMLDialogElement>>('panelDialog');

  constructor() {
    effect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (!dialog) return;
      if (this.s.formOpen() && !dialog.open) {
        dialog.showModal();
        requestAnimationFrame(() => dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus());
      } else if (!this.s.formOpen() && dialog.open) dialog.close();
    });
    effect(() => {
      const dialog = this.panelDialog()?.nativeElement;
      if (!dialog) return;
      if (this.s.panel() !== null && !dialog.open) {
        dialog.showModal();
        requestAnimationFrame(() => dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus());
      } else if (this.s.panel() === null && dialog.open) dialog.close();
    });
  }

  tagNames(project: Project) { return project.tags.map(tag => tag.name).join(', '); }

  ngOnInit() { void this.s.load(); }

  onCancel(event: Event) {
    event.preventDefault();
    this.s.cancel();
  }

  onPanelCancel(event: Event) {
    event.preventDefault();
    this.s.closePanel();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!event.composedPath().some(node => node instanceof HTMLElement && node.classList.contains('row-menu'))) this.s.menuFor.set(null);
  }

  @HostListener('document:keydown.escape') onEscape() { this.s.menuFor.set(null); }
  @HostListener('window:resize') onResize() { this.s.menuFor.set(null); }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent) {
    if (this.s.dirty() || this.s.tagsDirty()) { event.preventDefault(); event.returnValue = ''; }
  }
}
