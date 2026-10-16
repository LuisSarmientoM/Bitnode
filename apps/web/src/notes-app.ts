import { Component, ElementRef, HostListener, computed, effect, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiError, notesRequest, type Note, type NotePage } from './notes-api';
import { LiveMarkdown } from './live-markdown';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, DatePipe, LiveMarkdown],
  templateUrl: './notes-app.html',
})
export class NotesApp {
  readonly items = signal<Note[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly pageSize = 50;
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
    void this.loadPage(0, true);
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

  private listPath(offset: number, query = this.appliedQuery(), sort = this.appliedSort()) {
    return '?' + new URLSearchParams({ offset: String(offset), limit: String(this.pageSize), q: query, sort });
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
      const page = await notesRequest<NotePage>(this.listPath(offset, query, sort));
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
        title: this.title(), body: this.body(), ...(current ? { expectedRevision: current.revision } : {}),
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
