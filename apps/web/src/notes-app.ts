import { Component, HostListener, computed, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiError, notesRequest, type Note, type NotePage } from './notes-api';
import { previewMarkdown } from './markdown';
import appPackage from '../../../package.json';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './notes-app.html',
})
export class NotesApp {
  readonly version = appPackage.version;
  readonly items = signal<Note[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly pageSize = 50;
  readonly hasPages = computed(() => this.total() > this.pageSize);
  readonly selected = signal<Note | null>(null);
  readonly editing = signal(false);
  readonly title = signal('');
  readonly body = signal('');
  readonly busy = signal(true);
  readonly listError = signal('');
  readonly editorError = signal('');
  readonly conflict = signal(false);
  readonly saved = signal(false);
  readonly preview = signal(false);
  readonly dirty = computed(() => this.editing() && (
    this.title() !== (this.selected()?.title ?? '') || this.body() !== (this.selected()?.body ?? '')
  ));
  readonly canSave = computed(() => this.editing() && this.dirty() && !this.busy()
    && !!(this.title().trim() || this.body().trim()));
  readonly previewHtml = computed(() => this.preview() ? previewMarkdown(this.body()) : '');
  readonly titleLength = computed(() => [...this.title()].length);
  readonly status = computed(() => this.busy() ? 'Procesando…'
    : this.dirty() ? 'Cambios sin guardar' : this.saved() ? 'Guardada' : 'Sin cambios');

  constructor() { void this.loadPage(0, true); }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent) {
    if (this.dirty()) { event.preventDefault(); event.returnValue = ''; }
  }

  private canDiscard(): boolean {
    return !this.dirty() || window.confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?');
  }

  private setNote(note: Note | null) {
    this.selected.set(note);
    this.title.set(note?.title ?? '');
    this.body.set(note?.body ?? '');
    this.editing.set(true);
    this.preview.set(false);
    this.saved.set(false);
    this.editorError.set('');
    this.conflict.set(false);
  }

  private focusTitle() {
    requestAnimationFrame(() => document.getElementById('note-title')?.focus());
  }

  newNote() {
    if (this.busy() || !this.canDiscard()) return;
    this.setNote(null);
    this.focusTitle();
  }

  async openNote(note: Note) {
    if (this.busy() || (this.selected()?.id === note.id && !this.conflict()) || !this.canDiscard()) return;
    this.busy.set(true);
    this.editorError.set('');
    try {
      this.setNote(await notesRequest<Note>('/' + encodeURIComponent(note.id)));
      this.focusTitle();
    } catch (error) {
      this.editorError.set(this.message(error));
    } finally { this.busy.set(false); }
  }

  async loadPage(offset: number, initial = false) {
    if (!initial && (this.busy() || !this.canDiscard())) return;
    this.busy.set(true);
    this.listError.set('');
    try {
      const page = await notesRequest<NotePage>('?offset=' + offset + '&limit=' + this.pageSize);
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
        const page = await notesRequest<NotePage>('?offset=0&limit=' + this.pageSize);
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
