import { Component, ElementRef, HostListener, Injectable, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, apiRequest, type Tag } from './notes-api';

export type ContactScope = 'work' | 'personal';
export type ScopeFilter = '' | ContactScope;
export type Panel = 'clients' | 'tags';

export interface LinkedClient {
  id: string;
  fullName: string;
  shortName: string | null;
  scope: ContactScope;
  archivedAt: number | null;
}

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  observations: string | null;
  archivedAt: number | null;
  scopes: ContactScope[];
  clients: LinkedClient[];
  tags: Tag[];
  revision: number;
}

interface ContactPage { items: Contact[]; total: number; offset: number; limit: number }
interface ClientPage { items: LinkedClient[]; total: number; offset: number; limit: number }

const SCOPE_LABELS: Record<ContactScope, string> = { work: 'Trabajo', personal: 'Personal' };
const SCOPE_ORDER: ContactScope[] = ['work', 'personal'];
const CLIENT_PAGE = 200;

/**
 * Contacts state lives in a root service so a form draft survives the component being destroyed,
 * for example when the session expires and the login screen replaces the shell.
 */
@Injectable({ providedIn: 'root' })
export class ContactsStore {
  readonly pageSize = 50;
  readonly items = signal<Contact[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly scopeFilter = signal<ScopeFilter>('');
  readonly includeArchived = signal(false);
  readonly busy = signal(false);
  readonly listError = signal('');
  /** A rejected archive/reactivate; kept across the refresh that follows so the reason is not lost. */
  readonly actionError = signal('');
  readonly notice = signal('');
  readonly query = signal('');
  readonly appliedQuery = signal('');
  readonly allTags = signal<Tag[]>([]);
  readonly filterTags = signal<string[]>([]);
  readonly filterMode = signal<'all' | 'any'>('all');
  readonly appliedTags = signal<string[]>([]);
  readonly appliedMode = signal<'all' | 'any'>('all');

  readonly formOpen = signal(false);
  readonly editing = signal<Contact | null>(null);
  readonly name = signal('');
  readonly email = signal('');
  readonly phone = signal('');
  readonly observations = signal('');
  readonly formError = signal('');
  readonly conflict = signal(false);
  private initial = { name: '', email: '', phone: '', observations: '' };

  // Separate-action dialogs (clients, tags). Never part of the PATCH form.
  readonly panel = signal<Panel | null>(null);
  readonly panelContact = signal<Contact | null>(null);
  readonly panelError = signal('');
  readonly panelConflict = signal(false);
  readonly clientOptions = signal<LinkedClient[]>([]);
  readonly clientSelection = signal<string[]>([]);
  readonly clientSearch = signal('');
  readonly showArchivedClients = signal(false);
  private clientsInitial: string[] = [];
  readonly tagSelection = signal<string[]>([]);
  readonly newTagName = signal('');
  readonly newTagColor = signal('');
  private tagsInitial: string[] = [];
  private loadSeq = 0;

  readonly clientsDirty = computed(() => this.panel() === 'clients' && this.clientSelection().join(',') !== this.clientsInitial.join(','));
  readonly tagsDirty = computed(() => this.panel() === 'tags' && this.tagSelection().join(',') !== this.tagsInitial.join(','));
  readonly panelDirty = computed(() => this.clientsDirty() || this.tagsDirty());
  /** Active clients, plus archived ones only when asked for or already linked to the contact. */
  readonly visibleClients = computed(() => {
    const term = this.clientSearch().trim().toLocaleLowerCase();
    const selected = this.clientSelection();
    return this.clientOptions().filter(client => {
      if (client.archivedAt !== null && !this.showArchivedClients() && !this.clientsInitial.includes(client.id) && !selected.includes(client.id)) return false;
      return !term || client.fullName.toLocaleLowerCase().includes(term) || (client.shortName ?? '').toLocaleLowerCase().includes(term);
    });
  });
  readonly dirty = computed(() => this.formOpen() && (this.editing()
    ? this.name() !== this.initial.name || this.email() !== this.initial.email || this.phone() !== this.initial.phone
      || this.observations() !== this.initial.observations
    : !!(this.name() || this.email() || this.phone() || this.observations())));
  readonly hasPages = computed(() => this.offset() > 0 || this.offset() + this.items().length < this.total());
  readonly hasNext = computed(() => this.offset() + this.pageSize < this.total());

  /** Derived by the server from the linked clients; no linked clients means a free contact. */
  scopeText(contact: Contact): string {
    const scopes = SCOPE_ORDER.filter(scope => contact.scopes.includes(scope));
    return scopes.length ? scopes.map(scope => SCOPE_LABELS[scope]).join(', ') : 'Libre';
  }

  clientName(client: LinkedClient, short = true): string {
    const name = short ? client.shortName || client.fullName : client.fullName;
    return client.archivedAt !== null ? `${name} (archivado)` : name;
  }

  private listPath(offset: number, query: string) {
    const params = new URLSearchParams({ offset: String(offset), limit: String(this.pageSize) });
    if (query) params.set('q', query);
    if (this.scopeFilter()) params.set('scope', this.scopeFilter());
    if (this.includeArchived()) params.set('archived', 'include');
    if (this.appliedTags().length) {
      params.set('tagIds', this.appliedTags().join(','));
      params.set('tagMode', this.appliedMode());
    }
    return '/contacts?' + params;
  }

  /** The applied query only changes when the server answers, so a failed search keeps the previous list and its paging. */
  async load(offset = this.offset(), query = this.appliedQuery()) {
    const seq = ++this.loadSeq;
    this.busy.set(true);
    this.listError.set('');
    try {
      const page = await apiRequest<ContactPage>(this.listPath(offset, query));
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

  async loadTags() {
    try { this.allTags.set(await apiRequest<Tag[]>('/tags')); } catch { /* The tag filter simply stays unavailable. */ }
  }

  /** Applies the draft query and the draft tag filter together; the previous list stays if the server fails. */
  async applySearch() {
    if (this.busy()) return;
    const tags = this.filterTags();
    const mode = this.filterMode();
    const previous = { tags: this.appliedTags(), mode: this.appliedMode() };
    this.appliedTags.set(tags);
    this.appliedMode.set(mode);
    await this.load(0, this.query().trim());
    if (this.listError()) { this.appliedTags.set(previous.tags); this.appliedMode.set(previous.mode); }
  }

  toggleFilterTag(id: string, checked: boolean) {
    this.filterTags.update(ids => (checked ? [...new Set([...ids, id])] : ids.filter(value => value !== id)).sort());
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

  private fill(contact: Contact | null) {
    this.editing.set(contact);
    this.name.set(contact?.name ?? '');
    this.email.set(contact?.email ?? '');
    this.phone.set(contact?.phone ?? '');
    this.observations.set(contact?.observations ?? '');
    this.initial = { name: this.name(), email: this.email(), phone: this.phone(), observations: this.observations() };
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
  async openEdit(contact: Contact) {
    if (this.busy()) return;
    this.busy.set(true);
    this.listError.set('');
    this.notice.set('');
    try {
      this.fill(await apiRequest<Contact>('/contacts/' + encodeURIComponent(contact.id)));
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
    try { this.fill(await apiRequest<Contact>('/contacts/' + encodeURIComponent(current.id))); }
    catch (error) { this.formError.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  async save() {
    if (this.busy()) return;
    const current = this.editing();
    if (!this.name().trim()) { this.formError.set('El nombre es obligatorio.'); return; }
    this.busy.set(true);
    this.formError.set('');
    this.conflict.set(false);
    try {
      if (current) {
        await apiRequest<Contact>('/contacts/' + encodeURIComponent(current.id), 'PATCH', {
          expectedRevision: current.revision, name: this.name(), email: this.email().trim() || null,
          phone: this.phone().trim() || null, observations: this.observations().trim() ? this.observations() : null,
        });
      } else {
        await apiRequest<Contact>('/contacts', 'POST', {
          name: this.name(),
          ...(this.email().trim() ? { email: this.email() } : {}),
          ...(this.phone().trim() ? { phone: this.phone() } : {}),
          ...(this.observations().trim() ? { observations: this.observations() } : {}),
        });
      }
    } catch (error) {
      this.conflict.set(this.isMismatch(error));
      this.formError.set(this.message(error));
      this.busy.set(false);
      return;
    }
    this.formOpen.set(false);
    this.notice.set('Contacto guardado.');
    this.busy.set(false);
    await this.load(current ? this.offset() : 0);
  }

  async setArchived(contact: Contact, archived: boolean) {
    if (this.busy()) return;
    this.busy.set(true);
    this.listError.set('');
    this.actionError.set('');
    this.notice.set('');
    try {
      await apiRequest<Contact>(`/contacts/${encodeURIComponent(contact.id)}/${archived ? 'archive' : 'reactivate'}`, 'POST',
        { expectedRevision: contact.revision });
      this.notice.set(archived ? 'Contacto archivado.' : 'Contacto reactivado.');
    } catch (error) {
      // Not retried automatically: the mutation may or may not have been applied, and the refresh below shows the truth.
      this.actionError.set(this.message(error));
    }
    this.busy.set(false);
    await this.load();
  }

  private async allClients(): Promise<LinkedClient[]> {
    const clients: LinkedClient[] = [];
    for (let offset = 0; ; offset += CLIENT_PAGE) {
      const page = await apiRequest<ClientPage>(`/clients?offset=${offset}&limit=${CLIENT_PAGE}&archived=include`);
      clients.push(...page.items);
      if (!page.items.length || offset + page.items.length >= page.total) return clients;
    }
  }

  private fillPanel(panel: Panel, contact: Contact) {
    if (panel === 'clients') {
      this.clientsInitial = contact.clients.map(client => client.id).sort();
      this.clientSelection.set([...this.clientsInitial]);
    } else {
      this.tagsInitial = contact.tags.map(tag => tag.id).sort();
      this.tagSelection.set([...this.tagsInitial]);
    }
    this.panelContact.set(contact);
    this.panelError.set('');
    this.panelConflict.set(false);
  }

  /** Every panel starts from the server's current contact, never from a possibly stale row. */
  async openPanel(panel: Panel, contact: Contact) {
    if (this.busy()) return;
    this.busy.set(true);
    this.listError.set('');
    this.notice.set('');
    try {
      const current = await apiRequest<Contact>('/contacts/' + encodeURIComponent(contact.id));
      if (panel === 'tags') {
        this.allTags.set(await apiRequest<Tag[]>('/tags'));
        this.newTagName.set('');
        this.newTagColor.set('');
      } else {
        this.clientOptions.set(await this.allClients());
        this.clientSearch.set('');
        this.showArchivedClients.set(false);
      }
      this.fillPanel(panel, current);
      this.panel.set(panel);
    } catch (error) { this.listError.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  /** Closing never writes. Returns false when the user keeps an unsaved selection. */
  closePanel(): boolean {
    if (this.busy()) return false;
    if (this.panelDirty() && !window.confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?')) return false;
    this.panel.set(null);
    return true;
  }

  /** Refetches the current revision and keeps the selection draft, so the user can save it again. */
  async reloadPanelContact() {
    const current = this.panelContact();
    if (!current || this.busy()) return;
    this.busy.set(true);
    try {
      this.panelContact.set(await apiRequest<Contact>('/contacts/' + encodeURIComponent(current.id)));
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
    this.panelConflict.set(this.isMismatch(error));
    this.panelError.set(this.message(error));
  }

  toggleClient(id: string, checked: boolean) {
    this.clientSelection.update(ids => (checked ? [...new Set([...ids, id])] : ids.filter(value => value !== id)).sort());
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

  async saveClients() {
    const contact = this.panelContact();
    if (!contact || !this.clientsDirty() || this.busy()) return;
    this.busy.set(true);
    this.panelError.set('');
    this.panelConflict.set(false);
    try {
      await apiRequest<Contact>(`/contacts/${encodeURIComponent(contact.id)}/clients`, 'PUT',
        { expectedRevision: contact.revision, clientIds: this.clientSelection() });
      await this.finishPanel('Clientes vinculados guardados.');
    } catch (error) { this.failPanel(error); }
    finally { this.busy.set(false); }
  }

  async saveTags() {
    const contact = this.panelContact();
    if (!contact || !this.tagsDirty() || this.busy()) return;
    this.busy.set(true);
    this.panelError.set('');
    this.panelConflict.set(false);
    try {
      await apiRequest<Contact>(`/contacts/${encodeURIComponent(contact.id)}/tags`, 'PUT',
        { expectedRevision: contact.revision, tagIds: this.tagSelection() });
      await this.finishPanel('Etiquetas guardadas.');
    } catch (error) { this.failPanel(error); }
    finally { this.busy.set(false); }
  }

  private isMismatch(error: unknown) {
    return error instanceof ApiError && (error.code === 'REVISION_CONFLICT' || error.reason === 'REVISION_MISMATCH');
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'No se pudo completar la operación.';
  }
}

@Component({
  selector: 'app-contacts',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './contacts-page.html',
  styleUrl: './contacts-page.css',
})
export class ContactsPage implements OnInit {
  readonly s = inject(ContactsStore);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('contactDialog');
  private readonly panelDialog = viewChild<ElementRef<HTMLDialogElement>>('panelDialog');
  private lastTrigger = '';

  constructor() {
    effect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (!dialog) return;
      if (this.s.formOpen() && !dialog.open) {
        dialog.showModal();
        // The form renders after showModal, so the native autofocus pass finds nothing to focus.
        requestAnimationFrame(() => dialog.querySelector<HTMLElement>('#contact-name')?.focus());
      } else if (!this.s.formOpen() && dialog.open) dialog.close();
    });
  }

  private readonly panelEffects = (() => {
    effect(() => {
      const dialog = this.panelDialog()?.nativeElement;
      if (!dialog) return;
      const panel = this.s.panel();
      if (panel && !dialog.open) {
        this.lastTrigger = `${panel}-${this.s.panelContact()?.id}`;
        dialog.showModal();
        requestAnimationFrame(() => dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus());
      } else if (!panel && dialog.open) {
        dialog.close();
        const trigger = this.lastTrigger;
        requestAnimationFrame(() => (document.querySelector<HTMLElement>(`[data-trigger="${trigger}"]`)
          ?? document.getElementById('contact-search'))?.focus());
      }
    });
  })();

  ngOnInit() {
    void this.s.load();
    void this.s.loadTags();
  }

  tagNames(contact: Contact) { return contact.tags.map(tag => tag.name).join(', '); }

  onCancel(event: Event) {
    event.preventDefault();
    this.s.cancel();
  }

  onPanelCancel(event: Event) {
    event.preventDefault();
    this.s.closePanel();
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent) {
    if (this.s.dirty() || this.s.panelDirty()) { event.preventDefault(); event.returnValue = ''; }
  }
}
