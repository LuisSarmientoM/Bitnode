import { Component, ElementRef, HostListener, computed, effect, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiError, apiRequest, notesRequest, setCsrf, type Note, type NotePage, type Tag } from './notes-api';
import { LiveMarkdown } from './live-markdown';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, DatePipe, LiveMarkdown],
  templateUrl: './notes-app.html',
})
export class NotesApp {
  readonly authenticated = signal(false);
  readonly authBusy = signal(true);
  readonly authError = signal('');
  readonly password = signal('');
  private notesReady = false;
  readonly items = signal<Note[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly pageSize = 50;
  readonly tags = signal<Tag[]>([]);
  readonly tagIds = signal<string[]>([]);
  readonly filterTags = signal<string[]>([]);
  readonly tagMode = signal('all');
  readonly appliedTags = signal<string[]>([]);
  readonly appliedTagMode = signal('all');
  readonly tagName = signal('');
  readonly tagColor = signal('');
  readonly tagsError = signal('');
  readonly assignedTags = computed(() => this.tags().filter(tag => this.tagIds().includes(tag.id)));
  readonly tagColors = [
    { name: 'Sin color', value: '' }, { name: 'Verde', value: '#07b478' },
    { name: 'Azul', value: '#60a5fa' }, { name: 'Violeta', value: '#a78bfa' },
    { name: 'Ámbar', value: '#fbbf24' }, { name: 'Rosa', value: '#f472b6' },
  ];
  readonly query = signal('');
  readonly sort = signal('updated');
  readonly appliedQuery = signal('');
  readonly appliedSort = signal('updated');
  readonly hasPages = computed(() => this.total() > this.pageSize);
  readonly selected = signal<Note | null>(null);
  readonly editing = signal(false);
  readonly title = signal('');
  readonly body = signal('');
  readonly busy = signal(true);
  readonly listError = signal('');
  readonly openError = signal('');
  readonly editorError = signal('');
  readonly conflict = signal(false);
  readonly saved = signal(false);
  readonly source = signal(false);
  readonly editorKey = signal(0);
  readonly mobile = signal(window.matchMedia('(max-width: 760px)').matches);
  readonly modalOpen = signal(false);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('editorDialog');
  readonly dirty = computed(() => this.editing() && (
    this.title() !== (this.selected()?.title ?? '') || this.body() !== (this.selected()?.body ?? '')
    || this.tagIds().join(',') !== (this.selected()?.tags ?? []).map(tag => tag.id).sort().join(',')
  ));
  readonly canSave = computed(() => this.editing() && this.dirty() && !this.busy()
    && !!(this.title().trim() || this.body().trim()));
  readonly titleLength = computed(() => [...this.title()].length);
  readonly status = computed(() => this.busy() ? 'Procesando…'
    : this.dirty() ? 'Cambios sin guardar' : this.saved() ? 'Guardada' : 'Sin cambios');

  constructor() {
    effect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (!dialog) return;
      if (this.mobile()) {
        if (this.modalOpen() && !dialog.matches(':modal')) { dialog.close(); dialog.showModal(); }
        else if (!this.modalOpen()) dialog.close();
      } else {
        if (dialog.matches(':modal')) dialog.close();
        dialog.open = true;
      }
    });
    void this.checkSession();
  }

  private async enterSession(csrf: string) {
    setCsrf(csrf);
    this.authenticated.set(true);
    if (!this.notesReady) {
      this.notesReady = true;
      await this.loadPage(0, true);
    }
  }

  private async checkSession() {
    try { await this.enterSession((await apiRequest<{ csrf: string }>('/auth/session')).csrf); }
    catch (error) {
      if (!(error instanceof ApiError && error.code === 'UNAUTHENTICATED')) this.authError.set(this.message(error));
    } finally { this.authBusy.set(false); }
  }

  async login() {
    if (this.authBusy()) return;
    this.authBusy.set(true);
    this.authError.set('');
    const password = this.password();
    this.password.set('');
    try {
      setCsrf((await apiRequest<{ csrf: string }>('/auth/pre-session')).csrf);
      const session = await apiRequest<{ csrf: string }>('/auth/login', 'POST', { password });
      await this.enterSession(session.csrf);
    } catch (error) { setCsrf(''); this.authError.set(this.message(error)); }
    finally { this.authBusy.set(false); }
  }

  @HostListener('window:bitnode-auth-required')
  requireLogin() {
    this.authenticated.set(false);
    this.authError.set('La sesión cambió. Vuelve a entrar; tu borrador sigue en esta pestaña.');
  }

  @HostListener('window:resize')
  onResize() { this.mobile.set(window.matchMedia('(max-width: 760px)').matches); }

  closeEditor(event?: Event) {
    event?.preventDefault();
    if (this.busy() || !this.canDiscard()) return;
    if (this.dirty()) this.setNote(this.selected());
    this.modalOpen.set(false);
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent) {
    if (this.dirty()) { event.preventDefault(); event.returnValue = ''; }
  }

  private canDiscard(): boolean {
    return !this.dirty() || window.confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?');
  }

  private setNote(note: Note | null) {
    this.editorKey.update(key => key + 1);
    this.selected.set(note);
    this.title.set(note?.title ?? '');
    this.body.set(note?.body ?? '');
    this.tagIds.set((note?.tags ?? []).map(tag => tag.id).sort());
    this.editing.set(true);
    this.source.set(false);
    this.saved.set(false);
    this.editorError.set('');
    this.openError.set('');
    this.conflict.set(false);
  }

  private focusTitle() {
    requestAnimationFrame(() => document.getElementById('note-title')?.focus());
  }

  newNote() {
    if (this.busy() || !this.canDiscard()) return;
    this.setNote(null);
    this.modalOpen.set(true);
    this.focusTitle();
  }

  async openNote(note: Note) {
    if (this.busy()) return;
    this.openError.set('');
    if (this.selected()?.id === note.id && !this.conflict()) {
      this.modalOpen.set(true);
      return;
    }
    if (!this.canDiscard()) return;
    this.busy.set(true);
    this.editorError.set('');
    try {
      this.setNote(await notesRequest<Note>('/' + encodeURIComponent(note.id)));
      this.modalOpen.set(true);
      this.focusTitle();
    } catch (error) {
      this.openError.set(this.message(error));
    } finally { this.busy.set(false); }
  }

  toggleTag(id: string, checked: boolean, filter = false) {
    const target = filter ? this.filterTags : this.tagIds;
    target.update(ids => (checked ? [...new Set([...ids, id])] : ids.filter(value => value !== id)).sort());
  }

  async createTag() {
    if (this.busy() || !this.tagName().trim()) return;
    this.busy.set(true);
    this.tagsError.set('');
    try {
      const tag = await apiRequest<Tag>('/tags', 'POST', { name: this.tagName(), ...(this.tagColor() ? { color: this.tagColor() } : {}) });
      this.tags.update(tags => [...tags, tag]);
      this.toggleTag(tag.id, true);
      this.tagName.set('');
      this.tagColor.set('');
    } catch (error) { this.tagsError.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  private listPath(offset: number, query = this.appliedQuery(), sort = this.appliedSort(), tagIds = this.appliedTags(), tagMode = this.appliedTagMode()) {
    return '?' + new URLSearchParams({ offset: String(offset), limit: String(this.pageSize), q: query, sort, tagIds: tagIds.join(','), tagMode });
  }

  async applyFilters() {
    await this.loadPage(0, false, true);
  }

  async loadPage(offset: number, initial = false, apply = false) {
    if (!initial && (this.busy() || !this.canDiscard())) return;
    this.busy.set(true);
    this.listError.set('');
    try {
      const query = apply ? this.query().trim() : this.appliedQuery();
      const sort = apply ? this.sort() : this.appliedSort();
      const tagIds = apply ? this.filterTags() : this.appliedTags();
      const tagMode = apply ? this.tagMode() : this.appliedTagMode();
      const tags = await apiRequest<Tag[]>('/tags');
      const page = await notesRequest<NotePage>(this.listPath(offset, query, sort, tagIds, tagMode));
      this.tags.set(tags);
      this.appliedTags.set(tagIds);
      this.appliedTagMode.set(tagMode);
      this.appliedQuery.set(query);
      this.appliedSort.set(sort);
      this.items.set(page.items);
      this.total.set(page.total);
      this.offset.set(page.offset);
      const first = page.items[0];
      if (first) this.setNote(first);
      else { this.editing.set(false); this.selected.set(null); }
    } catch (error) {
      this.listError.set(this.message(error));
    } finally { this.busy.set(false); }
  }

  async save() {
    if (!this.canSave()) return;
    if (this.titleLength() > 500 || new TextEncoder().encode(this.body()).length > 1048576) {
      this.editorError.set('El título admite 500 caracteres Unicode y el contenido hasta 1 MiB UTF-8.');
      return;
    }
    this.busy.set(true);
    this.editorError.set('');
    this.saved.set(false);
    const current = this.selected();
    try {
      const note = await notesRequest<Note>(current ? '/' + encodeURIComponent(current.id) : '', current ? 'PATCH' : 'POST', {
        title: this.title(), body: this.body(), tagIds: this.tagIds(), ...(current ? { expectedRevision: current.revision } : {}),
      });
      this.setNote(note);
      this.saved.set(true);
      try {
        const page = await notesRequest<NotePage>(this.listPath(0));
        this.items.set(page.items);
        this.total.set(page.total);
        this.offset.set(0);
        this.listError.set('');
      } catch {
        this.listError.set('La nota se guardó, pero no se pudo actualizar la lista. Vuelve a cargarla.');
      }
    } catch (error) {
      this.conflict.set(error instanceof ApiError && error.code === 'REVISION_CONFLICT');
      this.editorError.set(this.message(error));
    } finally { this.busy.set(false); }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'No se pudo completar la operación. Tu borrador sigue aquí.';
  }
}
