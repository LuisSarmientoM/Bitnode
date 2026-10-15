import { Marked, Renderer } from 'marked';

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

export function previewMarkdown(value: string): string {
  // Angular sanitizes this output again at the innerHTML binding.
  return markdown.parse(value, { async: false });
}
