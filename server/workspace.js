const fs   = require('fs');
const path = require('path');

// LEARNO_WORKSPACE must come from the real environment, not .env: .env is
// itself looked up inside the workspace.
const WORKSPACE = process.env.LEARNO_WORKSPACE
  ? path.resolve(process.env.LEARNO_WORKSPACE)
  : path.join(__dirname, '..');

// A <title> is markup: without decoding, "Cache &amp; CDN" reaches the
// dashboard with the entity intact.
function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (whole, body) => {
    switch (body.toLowerCase()) {
      case 'amp':  return '&';
      case 'lt':   return '<';
      case 'gt':   return '>';
      case 'quot': return '"';
      case 'apos': return "'";
      default: {
        const code = body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
    }
  });
}

function listDir(rel) {
  const dir = path.join(WORKSPACE, rel);
  let files;
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.html')); }
  catch { return []; }
  return files.sort().map(file => {
    let title = file;
    try {
      const html = fs.readFileSync(path.join(dir, file), 'utf8');
      const m = html.match(/<title>([^<]*)<\/title>/i);
      if (m && m[1].trim()) title = decodeEntities(m[1].trim());
    } catch {}
    return { file, title, path: '/' + rel + '/' + file };
  });
}

function listWorkspace() {
  return {
    lessons:  listDir('lessons'),
    reviews:  listDir('review'),
    projects: listDir('projects')
  };
}

const DASHBOARD_PATH = 'reference/my-learning.html';

function hasDashboard() {
  return fs.existsSync(path.join(WORKSPACE, DASHBOARD_PATH));
}

// The build keeps its own copy of this table; change both together.
const LANGS = { pt: { name: 'Brazilian Portuguese', locale: 'pt-BR' },
                en: { name: 'English',              locale: 'en-GB' } };

function language() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(WORKSPACE, 'learno.json'), 'utf8'));
    return LANGS[cfg.lang] ? cfg.lang : 'pt';
  } catch {
    return 'pt';
  }
}

const languageName   = () => LANGS[language()].name;
const languageLocale = () => LANGS[language()].locale;

module.exports = { WORKSPACE, listDir, listWorkspace, DASHBOARD_PATH, hasDashboard, language, languageName, languageLocale };
