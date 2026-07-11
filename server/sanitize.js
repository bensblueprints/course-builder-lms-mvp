// Server-side HTML sanitizer for student-visible rich text lessons.
// Allowlist approach: any tag not on the list is stripped entirely; allowed
// tags keep ONLY allowlisted attributes; href/src values must be http(s),
// /media/, #anchor or mailto:. No dependencies, no DOM.
const ALLOWED = {
  a: ['href'],
  img: ['src', 'alt'],
  p: [], br: [], b: [], strong: [], i: [], em: [], u: [], s: [],
  h1: [], h2: [], h3: [], h4: [],
  ul: [], ol: [], li: [],
  blockquote: [], code: [], pre: [], hr: [],
  table: [], thead: [], tbody: [], tr: [], th: [], td: [],
  span: [], div: []
};

function safeUrl(v) {
  const s = String(v || '').trim().toLowerCase();
  return (
    s.startsWith('http://') || s.startsWith('https://') ||
    s.startsWith('/media/') || s.startsWith('#') || s.startsWith('mailto:')
  );
}

function sanitizeHtml(input) {
  let html = String(input || '');
  // Drop the inner text of script/style blocks entirely (not just the tags).
  html = html.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '');
  return html.replace(/<[^>]*>?/g, (tag) => {
    const m = tag.match(/^<\s*(\/?)\s*([a-zA-Z0-9]+)([\s\S]*?)(\/?)\s*>$/);
    if (!m) return ''; // malformed / unterminated tag — drop it
    const close = m[1];
    const name = m[2].toLowerCase();
    const attrs = m[3] || '';
    const selfClose = m[4];
    if (!(name in ALLOWED)) return '';
    if (close) return `</${name}>`;
    let out = `<${name}`;
    for (const attr of ALLOWED[name]) {
      const am = attrs.match(new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
      if (!am) continue;
      const raw = am[2] !== undefined ? am[2] : am[3] !== undefined ? am[3] : am[4] || '';
      if ((attr === 'href' || attr === 'src') && !safeUrl(raw)) continue;
      out += ` ${attr}="${raw.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`;
    }
    if (name === 'a') out += ' target="_blank" rel="noopener noreferrer"';
    return out + (selfClose ? ' /' : '') + '>';
  });
}

module.exports = { sanitizeHtml };
