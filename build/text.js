const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Private-use codepoints, which cannot occur in prose: the restore pass must
// match a marker, not any run of digits ("90 segundos" would lose its 90).
const OPEN = '';
const SHUT = '';

function inline(text) {
  // Escaped first, so authored content can never inject markup.
  let s = esc(text);
  // Code is lifted out before the rest, so ** or * inside a span stays literal.
  const code = [];
  s = s.replace(/`([^`]+)`/g, (_, c) =>
    OPEN + (code.push(`<code class="lx-code">${c}</code>`) - 1) + SHUT);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a class="lx-link" href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return s.replace(new RegExp(`${OPEN}(\\d+)${SHUT}`, 'g'), (_, i) => code[+i]);
}

function rich(text) {
  return String(text ?? '')
    .split(/\n\s*\n/)
    .map(b => b.trim())
    .filter(Boolean)
    .map(block => {
      const lines = block.split('\n').map(l => l.trim());
      if (lines.every(l => /^[-*]\s+/.test(l))) {
        const items = lines.map(l => `<li>${inline(l.replace(/^[-*]\s+/, ''))}</li>`).join('');
        return `<ul class="lx-list">${items}</ul>`;
      }
      return `<p>${inline(block)}</p>`;
    })
    .join('\n    ');
}

module.exports = { esc, inline, rich };
