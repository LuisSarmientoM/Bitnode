import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';
import { Compartment, EditorState } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, type DecorationSet } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { liveTables } from './live-tables.js';

class Bullet extends WidgetType {
  toDOM() { const bullet = document.createElement('span'); bullet.textContent = '•'; return bullet; }
  eq() { return true; }
}

function renderedLines(view: EditorView): DecorationSet {
  const decorations: { from: number; to: number; value: Decoration }[] = [];
  const { state } = view;
  const active = view.hasFocus ? state.selection.ranges : [];
  const editing = (from: number, to: number) => active.some(range =>
    state.doc.lineAt(range.from).from <= to && state.doc.lineAt(range.to).to >= from);
  const add = (from: number, to: number, value: Decoration) => decorations.push({ from, to, value });
  // Never replace source text. Decorations disappear on the focused/selected lines.
  syntaxTree(state).iterate({
    enter(node) {
      const { from, to, name } = node;
      if (name === 'Table' && !editing(from, to)) return false;
      if (/^ATXHeading/.test(name)) {
        const line = state.doc.lineAt(from);
        if (!editing(line.from, line.to)) add(line.from, line.from,
          Decoration.line({ class: 'cm-live-heading cm-live-h' + name.slice(-1) }));
      }
      if (editing(from, to)) return;
      if (name === 'ListMark' && /^[-+*]$/.test(state.doc.sliceString(from, to))) {
        add(from, to, Decoration.replace({ widget: new Bullet() }));
      }
      if (name === 'QuoteMark') add(state.doc.lineAt(from).from, state.doc.lineAt(from).from,
        Decoration.line({ class: 'cm-live-quote' }));
      const style: Record<string, string> = {
        StrongEmphasis: 'strong', Emphasis: 'em', InlineCode: 'code',
        Link: 'link', Strikethrough: 'strike', CodeText: 'code',
      };
      if (style[name]) add(from, to, Decoration.mark({ class: 'cm-live-' + style[name] }));
      if (['HeaderMark', 'EmphasisMark', 'CodeMark', 'QuoteMark', 'LinkMark', 'URL', 'CodeInfo'].includes(name)) {
        // Bare URLs remain visible. Only conceal destinations inside Markdown links.
        if (name === 'URL' && node.node.parent?.name !== 'Link') return;
        let end = to;
        if (name === 'HeaderMark' && state.doc.sliceString(to, to + 1) === ' ') end++;
        add(from, end, Decoration.replace({}));
      }
    },
  });
  return Decoration.set(decorations.map(item => item.value.range(item.from, item.to)), true);
}

const livePreview = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = renderedLines(view); }
  update(update: import('@codemirror/view').ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.focusChanged || update.viewportChanged
      || syntaxTree(update.startState) !== syntaxTree(update.state)) {
      this.decorations = renderedLines(update.view);
    }
  }
}, { decorations: plugin => plugin.decorations });

@Component({
  selector: 'live-markdown',
  standalone: true,
  template: '<div #host class="live-markdown"></div>',
})
export class LiveMarkdown {
  readonly value = input('');
  readonly disabled = input(false);
  readonly valueChange = output<string>();
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly editable = new Compartment();
  private editor?: EditorView;

  constructor() {
    effect(onCleanup => {
      const editor = new EditorView({
        parent: this.host().nativeElement,
        state: EditorState.create({
          extensions: [
            markdown({ base: markdownLanguage }), history(), keymap.of([...defaultKeymap, ...historyKeymap]),
            EditorView.lineWrapping, livePreview, liveTables,
            EditorView.contentAttributes.of({ 'aria-label': 'Contenido Markdown', 'aria-multiline': 'true' }),
            this.editable.of(EditorState.readOnly.of(false)),
            EditorView.updateListener.of(update => {
              if (update.docChanged) this.valueChange.emit(update.state.doc.toString());
            }),
          ],
        }),
      });
      this.editor = editor;
      onCleanup(() => { editor.destroy(); this.editor = undefined; });
    });
    effect(() => {
      const value = this.value();
      if (this.editor && this.editor.state.doc.toString() !== value) {
        this.editor.dispatch({ changes: { from: 0, to: this.editor.state.doc.length, insert: value } });
      }
    });
    effect(() => {
      this.editor?.dispatch({ effects: this.editable.reconfigure([
        EditorState.readOnly.of(this.disabled()), EditorView.editable.of(!this.disabled()),
      ]) });
    });
  }
}
