import { Component, ElementRef, HostListener, Injectable, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, apiRequest, type ScopePreview, type Tag } from './notes-api';

export type ClientScope = 'work' | 'personal';
export type ScopeFilter = '' | ClientScope;
export type Panel = 'scope' | 'tags' | 'delete';

export interface Client {
  id: string;
  fullName: string;
  shortName: string | null;
  scope: ClientScope;
  observations: string | null;
  archivedAt: number | null;
  tags: Tag[];
  revision: number;
}

interface ClientPage { items: Client[]; total: number; offset: number; limit: number }

const SCOPE_LABELS: Record<ClientScope, string> = { work: 'Trabajo', personal: 'Personal' };

/**
 * Clients state lives in a root service so a form draft survives the component being destroyed,
 * for example when the session expires and the login screen replaces the shell.
 */
@Injectable({ providedIn: 'root' })
export class ClientsStore {
  readonly pageSize = 50;
  readonly items = signal<Client[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly scopeFilter = signal<ScopeFilter>('');
  readonly includeArchived = signal(false);
  readonly busy = signal(false);
  readonly listError = signal('');
  /** A rejected archive/reactivate; kept across the refresh that follows so the reason is not lost. */
  readonly actionError = signal('');
  readonly query = signal('');
  readonly appliedQuery = signal('');
  readonly notice = signal('');

  readonly formOpen = signal(false);
  readonly editing = signal<Client | null>(null);
  readonly fullName = signal('');
  readonly shortName = signal('');
  readonly scope = signal<'' | ClientScope>('');
  readonly observations = signal('');
  readonly formError = signal('');
  readonly conflict = signal(false);
  private initial = { fullName: '', shortName: '', observations: '' };

  // Separate-action dialogs (scope change, tags, delete). Never part of the PATCH form.
  readonly menuFor = signal<string | null>(null);
  readonly menuPos = signal({ top: 0, left: 0 });
  /** The menu is measured after it renders, so it stays hidden until it has been placed inside the viewport. */
  readonly menuPlaced = signal(false);
  private menuAnchor = { top: 0, bottom: 0 };
  readonly panel = signal<Panel | null>(null);
  readonly panelClient = signal<Client | null>(null);
  readonly panelError = signal('');
  readonly panelConflict = signal(false);
  readonly scopeTarget = signal<'' | ClientScope>('');
  readonly scopePreview = signal<ScopePreview | null>(null);
  readonly allTags = signal<Tag[]>([]);
  readonly tagSelection = signal<string[]>([]);
  readonly newTagName = signal('');
  readonly newTagColor = signal('');
  private tagsInitial: string[] = [];
  readonly tagsDirty = computed(() => this.panel() === 'tags' && this.tagSelection().join(',') !== this.tagsInitial.join(','));
  /** Human-readable lines for the previewed effects; unknown effect codes get one generic line. */
  readonly previewLines = computed(() => {
    const preview = this.scopePreview();
    const client = this.panelClient();
    if (!preview || !client) return [];
    const lines: string[] = [];
    let generic = false;
    for (const effect of preview.effects) {
      if (effect.code === 'CHANGE_CLIENT_SCOPE') {
        lines.push(`«${client.fullName}» pasará de ${this.label(this.scopeDetail(effect.details?.['fromScope'], client.scope))} a ${this.label(this.scopeDetail(effect.details?.['toScope'], this.scopeTarget() || client.scope))}.`);
      } else if (effect.code === 'CHANGE_CONTACT_SCOPES') {
        const raw = effect.details?.['count'];
        const count = typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : effect.targets.length;
        lines.push(count === 1 ? '1 contacto vinculado cambiará su ámbito.' : `${count} contactos vinculados cambiarán su ámbito.`);
      } else if (effect.code === 'CHANGE_PROJECT_SCOPES') {
        const count = effect.targets.length;
        lines.push(count === 1 ? '1 proyecto del cliente cambiará su ámbito.' : `${count} proyectos del cliente cambiarán su ámbito.`);
      } else generic = true;
    }
    if (generic) lines.push('Este cambio también afecta a otros elementos relacionados con el cliente.');
    return lines;
  });
  readonly previewTitle = computed(() => {
    const client = this.panelClient();
    const effect = this.scopePreview()?.effects.find(item => item.code === 'CHANGE_CLIENT_SCOPE');
    if (!client || !effect) return '';
    return `${this.label(this.scopeDetail(effect.details?.['fromScope'], client.scope))} → ${this.label(this.scopeDetail(effect.details?.['toScope'], this.scopeTarget() || client.scope))}`;
  });
  private loadSeq = 0;

  readonly dirty = computed(() => this.formOpen() && (this.editing()
    ? this.fullName() !== this.initial.fullName || this.shortName() !== this.initial.shortName
      || this.observations() !== this.initial.observations
    : !!(this.fullName() || this.shortName() || this.scope() || this.observations())));
  readonly hasPages = computed(() => this.offset() > 0 || this.offset() + this.items().length < this.total());
  readonly hasNext = computed(() => this.offset() + this.pageSize < this.total());

  label(scope: ClientScope) { return SCOPE_LABELS[scope]; }
  private scopeDetail(value: unknown, fallback: ClientScope): ClientScope { return value === 'work' || value === 'personal' ? value : fallback; }

  private listPath(offset: number, query: string) {
    const params = new URLSearchParams({ offset: String(offset), limit: String(this.pageSize) });
    if (query) params.set('q', query);
    if (this.scopeFilter()) params.set('scope', this.scopeFilter());
    if (this.includeArchived()) params.set('archived', 'include');
    return '/clients?' + params;
  }

  /** The applied query only changes when the server answers, so a failed search keeps the previous list and its paging. */
  async load(offset = this.offset(), query = this.appliedQuery()) {
    const seq = ++this.loadSeq;
    this.busy.set(true);
    this.listError.set('');
    try {
      const page = await apiRequest<ClientPage>(this.listPath(offset, query));
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

  setScopeFilter(value: ScopeFilter) {
    if (this.scopeFilter() === value) return;
    this.scopeFilter.set(value);
    void this.load(0);
  }

  setIncludeArchived(value: boolean) {
    this.includeArchived.set(value);
    void this.load(0);
  }

  private fill(client: Client | null) {
    this.editing.set(client);
    this.fullName.set(client?.fullName ?? '');
    this.shortName.set(client?.shortName ?? '');
    this.scope.set(client?.scope ?? '');
    this.observations.set(client?.observations ?? '');
    this.initial = { fullName: this.fullName(), shortName: this.shortName(), observations: this.observations() };
    this.formError.set('');
    this.conflict.set(false);
  }

  openCreate() {
    if (this.busy()) return;
    this.notice.set('');
    this.fill(null);
    this.formOpen.set(true);
  }

  /** Edit always starts from the server's current revision, never from the possibly stale row. */
  async openEdit(client: Client) {
    if (this.busy()) return;
    this.busy.set(true);
    this.listError.set('');
    this.notice.set('');
    try {
      this.fill(await apiRequest<Client>('/clients/' + encodeURIComponent(client.id)));
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
    try { this.fill(await apiRequest<Client>('/clients/' + encodeURIComponent(current.id))); }
    catch (error) { this.formError.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  async save() {
    if (this.busy()) return;
    const current = this.editing();
    if (!this.fullName().trim()) { this.formError.set('El nombre completo es obligatorio.'); return; }
    if (!current && !this.scope()) { this.formError.set('Selecciona Trabajo o Personal para el cliente.'); return; }
    this.busy.set(true);
    this.formError.set('');
    this.conflict.set(false);
    try {
      if (current) {
        await apiRequest<Client>('/clients/' + encodeURIComponent(current.id), 'PATCH', {
          expectedRevision: current.revision, fullName: this.fullName(), shortName: this.shortName(), observations: this.observations(),
        });
      } else {
        await apiRequest<Client>('/clients', 'POST', {
          fullName: this.fullName(), scope: this.scope(),
          ...(this.shortName().trim() ? { shortName: this.shortName() } : {}),
          ...(this.observations().trim() ? { observations: this.observations() } : {}),
        });
      }
    } catch (error) {
      this.conflict.set(error instanceof ApiError && (error.code === 'REVISION_CONFLICT' || error.reason === 'REVISION_MISMATCH'));
      this.formError.set(this.message(error));
      this.busy.set(false);
      return;
    }
    this.formOpen.set(false);
    this.notice.set('Cliente guardado.');
    this.busy.set(false);
    await this.load(current ? this.offset() : 0);
  }

  async setArchived(client: Client, archived: boolean) {
    if (this.busy()) return;
    this.busy.set(true);
    this.listError.set('');
    this.actionError.set('');
    this.notice.set('');
    try {
      await apiRequest<Client>(`/clients/${encodeURIComponent(client.id)}/${archived ? 'archive' : 'reactivate'}`, 'POST',
        { expectedRevision: client.revision });
      this.notice.set(archived ? 'Cliente archivado.' : 'Cliente reactivado.');
    } catch (error) {
      // Not retried automatically: the mutation may or may not have been applied, and the refresh below shows the truth.
      this.actionError.set(this.message(error));
    }
    this.busy.set(false);
    await this.load();
  }

  toggleMenu(client: Client, event: Event) {
    if (this.menuFor() === client.id) { this.menuFor.set(null); return; }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    // Fixed position: the scrollable table would otherwise clip the menu on the last rows.
    this.menuAnchor = { top: rect.top, bottom: rect.bottom };
    this.menuPos.set({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.right - 176, window.innerWidth - 184)) });
    this.menuPlaced.set(false);
    this.menuFor.set(client.id);
  }

  /** Opens below the trigger when it fits, above it otherwise; the CSS max-height scrolls it when neither side fits. */
  placeMenu(height: number) {
    const margin = 8;
    const below = this.menuAnchor.bottom + 4;
    const fitsBelow = below + height <= window.innerHeight - margin;
    const above = this.menuAnchor.top - 4 - height;
    const top = fitsBelow ? below : above >= margin ? above : Math.max(margin, window.innerHeight - margin - height);
    this.menuPos.update(pos => ({ ...pos, top }));
    this.menuPlaced.set(true);
  }

  /** Every panel starts from the server's current client, never from a possibly stale row. */
  async openPanel(panel: Panel, client: Client) {
    if (this.busy()) return;
    this.menuFor.set(null);
    this.busy.set(true);
    this.listError.set('');
    this.notice.set('');
    try {
      const current = await apiRequest<Client>('/clients/' + encodeURIComponent(client.id));
      if (panel === 'tags') {
        this.allTags.set(await apiRequest<Tag[]>('/tags'));
        this.tagsInitial = current.tags.map(tag => tag.id).sort();
        this.tagSelection.set([...this.tagsInitial]);
        this.newTagName.set('');
        this.newTagColor.set('');
      }
      this.panelClient.set(current);
      this.scopeTarget.set('');
      this.scopePreview.set(null);
      this.panelError.set('');
      this.panelConflict.set(false);
      this.panel.set(panel);
    } catch (error) { this.listError.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  /** Closing never writes. Returns false when the user keeps an unsaved tag selection. */
  closePanel(): boolean {
    if (this.busy()) return false;
    if (this.tagsDirty() && !window.confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?')) return false;
    this.panel.set(null);
    return true;
  }

  /** Refetches the current revision; scope preview is dropped (re-review required), the tag selection draft is kept. */
  async reloadPanelClient() {
    const current = this.panelClient();
    if (!current || this.busy()) return;
    this.busy.set(true);
    try {
      this.panelClient.set(await apiRequest<Client>('/clients/' + encodeURIComponent(current.id)));
      this.scopePreview.set(null);
      this.panelError.set('');
      this.panelConflict.set(false);
    } catch (error) { this.panelError.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  private async finishPanel(notice: string) {
    this.panel.set(null);
    this.notice.set(notice);
    await this.load();
  }

  private failPanel(error: unknown) {
    this.panelConflict.set(error instanceof ApiError && error.reason === 'REVISION_MISMATCH');
    this.panelError.set(this.message(error));
  }

  private scopeUrl(client: Client) { return `/clients/${encodeURIComponent(client.id)}/change-scope`; }

  /** First request, without acceptance: the server answers with the preview and changes nothing. */
  async reviewScope() {
    const client = this.panelClient();
    const scope = this.scopeTarget();
    if (!client || !scope || scope === client.scope || this.busy()) return;
    this.busy.set(true);
    this.panelError.set('');
    this.panelConflict.set(false);
    try {
      await apiRequest<Client>(this.scopeUrl(client), 'POST', { expectedRevision: client.revision, scope });
      await this.finishPanel('El cliente ya estaba en ese ámbito.');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CONFIRMATION_REQUIRED' && error.preview) this.scopePreview.set(error.preview);
      else if (error instanceof ApiError && error.code === 'CONFIRMATION_REQUIRED') this.panelError.set('No se pudo preparar la revisión del cambio.');
      else this.failPanel(error);
    } finally { this.busy.set(false); }
  }

  /** Always triggered by a human click; a changed preview is shown, never accepted automatically. */
  async confirmScope() {
    const client = this.panelClient();
    const scope = this.scopeTarget();
    const preview = this.scopePreview();
    if (!client || !scope || !preview || this.busy()) return;
    this.busy.set(true);
    this.panelError.set('');
    this.panelConflict.set(false);
    try {
      await apiRequest<Client>(this.scopeUrl(client), 'POST', {
        expectedRevision: client.revision, scope, acceptance: { previewDigest: preview.previewDigest, effects: preview.effects },
      });
      await this.finishPanel('Ámbito actualizado.');
    } catch (error) {
      if (error instanceof ApiError && error.reason === 'PREVIEW_CHANGED' && error.preview) {
        this.scopePreview.set(error.preview);
        this.panelError.set('La información cambió. Revisa el cambio actualizado y confirma de nuevo.');
      } else this.failPanel(error);
    } finally { this.busy.set(false); }
  }

  toggleTag(id: string, checked: boolean) {
    this.tagSelection.update(ids => (checked ? [...new Set([...ids, id])] : ids.filter(value => value !== id)).sort());
  }

  async createTag() {
    const name = this.newTagName().trim();
    if (this.busy() || !name) return;
    this.busy.set(true);
    this.panelError.set('');
    this.panelConflict.set(false);
    const color = this.newTagColor();
    try {
      const tag = await apiRequest<Tag>('/tags', 'POST', { name, ...(color ? { color } : {}) });
      this.allTags.update(tags => [...tags, tag]);
      this.toggleTag(tag.id, true);
      this.newTagName.set('');
      this.newTagColor.set('');
    } catch (error) { this.panelError.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  async saveTags() {
    const client = this.panelClient();
    if (!client || !this.tagsDirty() || this.busy()) return;
    this.busy.set(true);
    this.panelError.set('');
    this.panelConflict.set(false);
    try {
      await apiRequest<Client>(`/clients/${encodeURIComponent(client.id)}/tags`, 'PUT', { expectedRevision: client.revision, tagIds: this.tagSelection() });
      await this.finishPanel('Etiquetas guardadas.');
    } catch (error) { this.failPanel(error); }
    finally { this.busy.set(false); }
  }

  /** One attempt per click: a failure may leave the client untouched or deleted, so nothing is retried or faked. */
  async deleteClient() {
    const client = this.panelClient();
    if (!client || this.busy()) return;
    this.busy.set(true);
    this.panelError.set('');
    this.panelConflict.set(false);
    try {
      await apiRequest<{ id: string }>('/clients/' + encodeURIComponent(client.id), 'DELETE', { expectedRevision: client.revision });
      await this.finishPanel('Cliente eliminado.');
    } catch (error) { this.failPanel(error); }
    finally { this.busy.set(false); }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'No se pudo completar la operación.';
  }
}

@Component({
  selector: 'app-clients',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './clients-page.html',
  styleUrl: './clients-page.css',
})
export class ClientsPage implements OnInit {
  readonly s = inject(ClientsStore);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('clientDialog');
  private readonly panelDialog = viewChild<ElementRef<HTMLDialogElement>>('panelDialog');
  private lastPanelClient: string | null = null;

  constructor() {
    effect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (!dialog) return;
      if (this.s.formOpen() && !dialog.open) {
        dialog.showModal();
        // The form renders after showModal, so the native autofocus pass finds nothing to focus.
        requestAnimationFrame(() => dialog.querySelector<HTMLElement>('#client-full-name')?.focus());
      }
      else if (!this.s.formOpen() && dialog.open) dialog.close();
    });
  }

  /** Focus handling for the action dialogs (scope, tags, delete). */
  private readonly panelEffects = (() => {
    effect(() => {
      const dialog = this.panelDialog()?.nativeElement;
      if (!dialog) return;
      const open = this.s.panel() !== null;
      if (open && !dialog.open) {
        this.lastPanelClient = this.s.panelClient()?.id ?? null;
        dialog.showModal();
        requestAnimationFrame(() => dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus());
      } else if (!open && dialog.open) {
        dialog.close();
        const id = this.lastPanelClient;
        requestAnimationFrame(() => (document.querySelector<HTMLElement>(`[data-menu-trigger="${id}"]`)
          ?? document.getElementById('client-search'))?.focus());
      }
    });
    effect(() => {
      if (this.s.menuFor() === null) return;
      requestAnimationFrame(() => {
        const menu = document.querySelector<HTMLElement>('.menu-list');
        if (menu) this.s.placeMenu(menu.getBoundingClientRect().height);
      });
    });
    effect(() => {
      // A new or refreshed preview moves focus to its confirm button.
      if (this.s.scopePreview()) requestAnimationFrame(() => document.getElementById('scope-confirm')?.focus());
      else if (this.s.panel() === 'scope') requestAnimationFrame(() => document.getElementById('scope-target')?.focus());
    });
  })();

  tagNames(client: Client) { return client.tags.map(tag => tag.name).join(', '); }

  ngOnInit() { void this.s.load(); }

  onCancel(event: Event) {
    event.preventDefault();
    this.s.cancel();
  }

  onPanelCancel(event: Event) {
    event.preventDefault();
    this.s.closePanel();
  }

  private closeMenu(restoreFocus: boolean) {
    const id = this.s.menuFor();
    if (!id) return false;
    this.s.menuFor.set(null);
    if (restoreFocus) document.querySelector<HTMLElement>(`[data-menu-trigger="${id}"]`)?.focus();
    return true;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!event.composedPath().some(node => node instanceof HTMLElement && node.classList.contains('row-menu'))) this.closeMenu(false);
  }

  @HostListener('document:focusin', ['$event'])
  onFocusIn(event: FocusEvent) {
    if (!(event.target instanceof HTMLElement) || !event.target.closest('.row-menu')) this.closeMenu(false);
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event) {
    if (this.closeMenu(true)) event.preventDefault();
  }

  @HostListener('window:resize') onResize() { this.closeMenu(false); }
  @HostListener('window:scroll') onScroll() { this.closeMenu(false); }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent) {
    if (this.s.dirty() || this.s.tagsDirty()) { event.preventDefault(); event.returnValue = ''; }
  }
}
