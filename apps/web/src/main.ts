import { bootstrapApplication } from '@angular/platform-browser';
import { NotesApp } from './notes-app';

bootstrapApplication(NotesApp).catch(() => {
  document.body.textContent = 'No se pudo iniciar Bitnode. Recarga la página para volver a intentarlo.';
});
