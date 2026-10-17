import { Lexer, Marked, Renderer, type Token } from 'marked';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

const renderer = new Renderer();
renderer.html = () => '';
renderer.image = ({ text }) => '<span class="image-placeholder">Imagen omitida: ' + escape(text) + '</span>';
renderer.link = function ({ href, tokens }) {
  const label = this.parser.parseInline(tokens);
  if (!/^https?:\/\//i.test(href)) return label;
  try {
    const url = new URL(href);
    if (!['http:', 'https:'].includes(url.protocol)) return label;
    return '<a href="' + escape(url.href) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
  } catch { return label; }
};
const markdown = new Marked({ renderer, gfm: true, breaks: false });

/** Plain words of a note for list excerpts: no Markdown syntax, HTML or URLs. */
export function markdownText(value: string, max = 160): string {
  let text = '';
  // Blocks and table cells are separated by a space; inline pieces join as written.
  const visit = (tokens: Token[]) => {
    for (const token of tokens) {
      if (token.type === 'html' || token.type === 'space' || token.type === 'hr') continue;
      if (token.type === 'table') {
        for (const cell of [...token.header, ...token.rows.flat()]) { visit(cell.tokens); text += ' '; }
      } else if (token.type === 'list') {
        for (const item of token.items) { visit(item.tokens); text += ' '; }
      } else if (token.type === 'code' || token.type === 'codespan') {
        text += token.text;
      } else if ('tokens' in token && Array.isArray(token.tokens)) {
        visit(token.tokens);
      } else if ('text' in token && typeof token.text === 'string') {
        text += token.text;
      }
      if (['paragraph', 'heading', 'code', 'blockquote'].includes(token.type)) text += ' ';
    }
  };
  // Excerpts only need the start of the note; bound the parsing work.
  visit(Lexer.lex(value.slice(0, max * 20), { gfm: true }));
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

export function previewMarkdown(value: string): string {
  // Angular sanitizes this output again at the innerHTML binding.
  return markdown.parse(value, { async: false });
}
