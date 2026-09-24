const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync, spawn } = require('child_process');

const UPSTREAM = 'https://github.com/muricristino/learno.git';

// The engine's own study lives in these; a new workspace starts without it.
const STUDY_DIRS = ['lessons', 'review', 'projects', 'learning-records'];
const STUDY_FILES = ['NEXT.md', 'NOTES.md', 'RESOURCES.md'];

const say = msg => console.log(msg);
const fail = msg => { console.error(`\n✗ ${msg}`); process.exit(1); };

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.error?.code === 'ENOENT') return { missing: true };
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function ask(question, fallback) {
  if (!process.stdin.isTTY) return Promise.resolve(fallback);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, a => { rl.close(); resolve(a.trim() || fallback); }));
}

function checkClaude() {
  const version = run('claude', ['--version']);
  if (version.missing) return { ok: false, why: 'Claude Code is not installed — see https://claude.com/claude-code' };

  const status = run('claude', ['auth', 'status']);
  let auth = {};
  try { auth = JSON.parse(status.out); } catch {}
  if (!auth.loggedIn) return { ok: false, why: 'Claude Code is not logged in — run `claude` once and log in' };

  return { ok: true, billed: auth.authMethod !== 'claude.ai' };
}

function emptyStudy(dir) {
  for (const d of STUDY_DIRS) {
    const full = path.join(dir, d);
    fs.rmSync(full, { recursive: true, force: true });
    fs.mkdirSync(full);
    fs.writeFileSync(path.join(full, '.gitkeep'), '');
  }
  for (const f of STUDY_FILES) fs.rmSync(path.join(dir, f), { force: true });

  // Ignored upstream so the engine's author does not publish their progress; a
  // study workspace is exactly where it should be versioned.
  const gi = path.join(dir, '.gitignore');
  const kept = fs.readFileSync(gi, 'utf8').split('\n')
    .filter(l => l !== 'learno.db' && !/^# (This repo is public|A study workspace created)/.test(l));
  fs.writeFileSync(gi, kept.join('\n'));
}

async function create(args) {
  const flag = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const from = flag('--from') || UPSTREAM;
  let lang = flag('--lang');
  const noLaunch = args.includes('--no-launch');
  const target = args.find(a => !a.startsWith('--'));

  if (!target) fail('usage: learno new <folder> [--lang pt|en] [--no-launch]');
  const dir = path.resolve(target);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) fail(`${dir} already exists and is not empty.`);

  say('Checking what this needs…');
  if (run('git', ['--version']).missing) fail('git is not installed.');
  const claude = checkClaude();
  say(claude.ok ? '  ✓ Node, git and Claude Code' : `  ! ${claude.why}. The workspace is still created; start Claude once that is fixed.`);
  if (claude.ok && claude.billed) {
    say('  ! Claude Code is using an API key, so grading each answer is billed to it. A Claude subscription login is not.');
  }

  while (lang !== 'pt' && lang !== 'en') {
    lang = (await ask('\nLesson language — pt or en? [pt] ', 'pt')).toLowerCase();
  }

  say(`\nCreating ${dir}…`);
  const clone = run('git', ['clone', '--quiet', from, dir], { stdio: ['ignore', 'pipe', 'pipe'] });
  if (!clone.ok) fail(`git clone failed: ${clone.err}`);
  run('git', ['remote', 'rename', 'origin', 'upstream'], { cwd: dir });

  emptyStudy(dir);
  fs.writeFileSync(path.join(dir, 'learno.json'), JSON.stringify({ lang }, null, 2) + '\n');

  say('Installing dependencies…');
  for (const sub of ['.', 'server']) {
    const npm = run('npm', ['install', '--silent', '--no-audit', '--no-fund'], { cwd: path.join(dir, sub) });
    if (!npm.ok) fail(`npm install failed in ${sub}: ${npm.err}`);
  }

  run('git', ['add', '-A'], { cwd: dir });
  run('git', ['commit', '--quiet', '-m', 'chore: start a new study'], { cwd: dir });

  say(`\n✓ Ready: ${dir}\n`);
  say('  Claude will ask what you want to learn and why, build the plan, and write the first lesson.');
  say(`  Later sessions: cd ${target} && claude "/learno"\n`);

  if (noLaunch || !claude.ok || !process.stdin.isTTY) return;
  const go = (await ask('Start now? [Y/n] ', 'y')).toLowerCase();
  if (go.startsWith('n')) return;

  spawn('claude', ['/learno'], { cwd: dir, stdio: 'inherit' })
    .on('exit', code => process.exit(code ?? 0));
}

module.exports = { create };
