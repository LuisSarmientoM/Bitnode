import { StateEffect, StateField, type EditorState } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { Lexer, type Token, type Tokens } from 'marked';

const tableFocus = StateEffect.define<boolean>();
const inlineTags: Record<string, string> = { strong: 'strong', em: 'em', del: 's', codespan: 'code' };

/** Build DOM from a small safe inline vocabulary, never user HTML or image URLs. */
function inline(parent: HTMLElement, tokens: Token[]) {
  for (const token of tokens) {
    if (token.type === 'html') continue;
    if (token.type === 'br') { parent.append(document.createElement('br')); continue; }
    const tag = inlineTags[token.type];
    const element = tag ? document.createElement(tag) : parent;
    if ('tokens' in token && Array.isArray(token.tokens)) inline(element, token.tokens);
    else element.append(document.createTextNode('text' in token && typeof token.text === 'string' ? token.text : token.raw));
    if (tag) parent.append(element);
  }
}

class TableWidget extends WidgetType {
  constructor(readonly from: number, readonly source: string, readonly data: Tokens.Table, readonly readOnly: boolean) { super(); }
  eq(other: TableWidget) { return this.from === other.from && this.source === other.source && this.readOnly === other.readOnly; }
  toDOM(view: EditorView) {
    const figure = document.createElement('figure');
    figure.className = 'cm-live-table';
    const scroll = document.createElement('div');
    const table = document.createElement('table');
    const head = table.createTHead();
    const body = table.createTBody();
    [this.data.header, ...this.data.rows].forEach((cells, index) => {
      const row = document.createElement('tr');
      cells.forEach((cell, column) => {
        const element = document.createElement(index === 0 ? 'th' : 'td');
        if (index === 0) element.scope = 'col';
        const alignment = this.data.align[column];
        if (alignment) element.style.textAlign = alignment;
        inline(element, cell.tokens);
        row.append(element);
      });
      (index === 0 ? head : body).append(row);
    });
    scroll.append(table);
    figure.append(scroll);
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Editar tabla';
    edit.disabled = this.readOnly;
    edit.addEventListener('click', () => {
      if (view.state.readOnly) return;
      view.dispatch({ selection: { anchor: this.from }, effects: tableFocus.of(true) });
      view.focus();
    });
    figure.append(edit);
    return figure;
  }
  ignoreEvent() { return true; }
}

function tables(state: EditorState, focused: boolean): DecorationSet {
  const ranges: ReturnType<Decoration['range']>[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'Table') return;
      if (focused && state.selection.ranges.some(range => range.from <= node.to && range.to >= node.from)) return false;
      const source = state.doc.sliceString(node.from, node.to);
      const token = Lexer.lex(source, { gfm: true })[0];
      if (token?.type === 'table') {
        ranges.push(Decoration.replace({ widget: new TableWidget(node.from, source, token as Tokens.Table, state.readOnly), block: true }).range(node.from, node.to));
      }
      return false;
    },
  });
  return Decoration.set(ranges, true);
}

// Multiline replacements must be direct state decorations, not a viewport ViewPlugin.
const tableState = StateField.define<{ focused: boolean; decorations: DecorationSet }>({
  create: state => ({ focused: false, decorations: tables(state, false) }),
  update(value, transaction) {
    let focused = value.focused;
    for (const effect of transaction.effects) if (effect.is(tableFocus)) focused = effect.value;
    return { focused, decorations: tables(transaction.state, focused) };
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations),
});

export const liveTables = [tableState, EditorView.domEventHandlers({
  focus(event, view) {
    if (event.target === view.contentDOM) view.dispatch({ effects: tableFocus.of(true) });
  },
  blur(event, view) {
    if (event.target === view.contentDOM) view.dispatch({ effects: tableFocus.of(false) });
  },
})];
