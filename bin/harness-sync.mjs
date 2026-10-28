#!/usr/bin/env node
// ~/.claude(원본) → 이 저장소(공개 사본) 단방향 동기화 도구.
// 원본은 읽기만 하고 저장소에만 쓴다. 커밋·푸시는 하지 않는다.
//
//   harness-sync.mjs [status]       어긋난 파일과 새 후보를 보여준다 (어긋남이 있으면 exit 1)
//   harness-sync.mjs sync [옵션]     어긋난 추적 파일을 원본에서 복사한다
//   harness-sync.mjs add <경로...>   새 파일·디렉터리를 공개 대상에 추가한다
//   harness-sync.mjs scan           저장소 전체를 유출 검사한다
//   harness-sync.mjs test           저장소의 *.test.mjs를 실행한다
//
// 환경변수: CLAUDE_HOME(원본, 기본 ~/.claude), HARNESS_REPO(저장소, 기본 이 파일의 상위 폴더)
import { spawnSync } from 'node:child_process';
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync,
  realpathSync, statSync, unlinkSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, normalize, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// ───────────────────────── glob ─────────────────────────
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else { re += '.*'; }
      } else { re += '[^/]*'; }
    } else if (c === '?') { re += '[^/]'; }
    else { re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&'); }
  }
  return new RegExp(`^${re}$`);
}

// `foo`는 `foo`와 `foo/**`를 모두 뜻한다. 디렉터리 경로는 끝에 `/`를 붙여 검사한다.
export function matcher(globs) {
  const res = globs
    .flatMap((g) => (g.endsWith('/**') ? [g] : [g, `${g}/**`]))
    .map(globToRegExp);
  return (path) => res.some((re) => re.test(path));
}

// ───────────────────────── 설정 ─────────────────────────
// 후보 탐색·add에서 항상 제외한다. 저장소 .gitignore도 별도로 적용된다.
const DEFAULT_IGNORE = [
  '**/.git/**', '**/node_modules/**', '**/.DS_Store',
  '**/.env', '**/.env.*', '**/*.pem', '**/*.key', '**/credentials*',
];

// 공개 설정: bin/harness-sync.config.json (추적됨)
// 비공개 설정: .harness-sync.local.json (gitignore) — private 경로, leakTerms(회사·개인 식별어)
export function loadConfig(repo) {
  const read = (file) => {
    if (!existsSync(file)) return {};
    try { return JSON.parse(readFileSync(file, 'utf8')); }
    catch (e) { throw new Error(`설정 파일을 읽을 수 없다: ${file} (${e.message})`); }
  };
  const pub = read(join(repo, 'bin', 'harness-sync.config.json'));
  const loc = read(join(repo, '.harness-sync.local.json'));
  return {
    keep: pub.keep ?? {},
    repoOnly: pub.repoOnly ?? [],
    ignore: [...DEFAULT_IGNORE, ...(pub.ignore ?? [])],
    allow: pub.allow ?? [],
    private: loc.private ?? [],
    leakTerms: loc.leakTerms ?? [],
  };
}

// ───────────────────────── git / fs ─────────────────────────
function git(repo, args, input) {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', input, maxBuffer: 1 << 28 });
  if (r.error) throw r.error;
  return r;
}
function gitList(repo, args) {
  const r = git(repo, args);
  if (r.status !== 0) throw new Error(`git ${args[0]} 실패: ${r.stderr.trim()}`);
  return r.stdout.split('\0').filter(Boolean);
}
export const trackedFiles = (repo) => gitList(repo, ['ls-files', '-z']);

function changedFiles(repo) {
  try { return new Set(gitList(repo, ['diff', '--name-only', '-z', 'HEAD'])); }
  catch { return new Set(); }
}
function lastCommitMs(repo, path) {
  const sec = Number(git(repo, ['log', '-1', '--format=%ct', '--', path]).stdout.trim());
  return Number.isFinite(sec) && sec > 0 ? sec * 1000 : 0;
}
function gitIgnored(repo, paths) {
  if (!paths.length) return new Set();
  const r = git(repo, ['check-ignore', '--no-index', '-z', '--stdin'], `${paths.join('\0')}\0`);
  if (r.status > 1) throw new Error(`git check-ignore 실패: ${r.stderr.trim()}`);
  return new Set(r.stdout.split('\0').filter(Boolean));
}

const statOrNull = (p) => { try { return statSync(p); } catch { return null; } };
const isFile = (p) => statOrNull(p)?.isFile() ?? false;
const execBits = (st) => st.mode & 0o111;

function sameContent(a, b) {
  const sa = statOrNull(a);
  const sb = statOrNull(b);
  if (!sa || !sb || sa.size !== sb.size) return false;
  return readFileSync(a).equals(readFileSync(b));
}

function* walkFiles(abs, rel, isIgnored, depth = 0) {
  if (depth > 12) return;
  let names;
  try { names = readdirSync(abs).sort(); } catch { return; }
  for (const name of names) {
    const r = rel ? `${rel}/${name}` : name;
    const st = statOrNull(join(abs, name));
    if (!st) continue; // 깨진 링크
    if (st.isDirectory()) {
      if (!isIgnored(`${r}/`)) yield* walkFiles(join(abs, name), r, isIgnored, depth + 1);
    } else if (st.isFile() && !isIgnored(r)) {
      yield r;
    }
  }
}

// ───────────────────────── 비교 ─────────────────────────
// 상태: ok · stale(원본이 최신) · repo-newer(저장소가 더 최신) · dirty(저장소에 미커밋 변경)
//       keep(의도적으로 다름) · gone(원본에 없음) · repo-only(저장소 전용)
export function inspect({ repo, source, config }) {
  const tracked = trackedFiles(repo);
  const dirty = changedFiles(repo);
  const isRepoOnly = matcher(config.repoOnly);
  const entries = [];
  for (const path of tracked) {
    const src = join(source, path);
    const dst = join(repo, path);
    if (isRepoOnly(path)) { entries.push({ path, state: 'repo-only' }); continue; }
    if (!isFile(src)) { entries.push({ path, state: 'gone' }); continue; }
    const srcSt = statSync(src);
    const dstSt = statOrNull(dst);
    const same = dstSt !== null && sameContent(src, dst);
    const modeDiff = dstSt !== null && same && execBits(srcSt) !== execBits(dstSt);
    if (same && !modeDiff) { entries.push({ path, state: 'ok' }); continue; }
    if (config.keep[path]) { entries.push({ path, state: 'keep', note: config.keep[path] }); continue; }
    const base = { path, srcMs: srcSt.mtimeMs, reason: modeDiff ? '실행 권한' : '내용' };
    if (dstSt === null) { entries.push({ ...base, state: 'stale', reason: '저장소에 파일 없음' }); continue; }
    if (dirty.has(path)) { entries.push({ ...base, state: 'dirty' }); continue; }
    const commitMs = lastCommitMs(repo, path);
    entries.push({ ...base, commitMs, state: commitMs > srcSt.mtimeMs ? 'repo-newer' : 'stale' });
  }
  return { tracked, entries };
}

// 원본에는 있지만 추적되지 않는 파일·디렉터리. 추적 파일이 하나라도 있는 디렉터리 안에서만 찾는다.
export function findCandidates({ repo, source, config, tracked }) {
  const trackedSet = new Set(tracked);
  const hasTracked = new Set();
  for (const p of tracked) {
    for (let d = dirname(p); d !== '.'; d = dirname(d)) hasTracked.add(d);
  }
  const isIgnored = matcher(config.ignore);
  const isPrivate = matcher(config.private);
  const count = (abs, rel) => [...walkFiles(abs, rel, isIgnored)].length;
  const found = [];
  let privateSkipped = 0;

  const visit = (rel) => {
    let names;
    try { names = readdirSync(join(source, rel)).sort(); } catch { return; }
    for (const name of names) {
      const r = `${rel}/${name}`;
      const abs = join(source, r);
      const st = statOrNull(abs);
      if (!st) continue;
      if (st.isDirectory()) {
        if (isIgnored(`${r}/`)) continue;
        if (isPrivate(`${r}/`)) { privateSkipped += count(abs, r); continue; }
        if (hasTracked.has(r)) visit(r);
        else found.push({ path: r, dir: true, files: count(abs, r) });
      } else if (st.isFile()) {
        if (trackedSet.has(r) || isIgnored(r)) continue;
        if (isPrivate(r)) { privateSkipped++; continue; }
        found.push({ path: r, dir: false });
      }
    }
  };
  for (const top of [...hasTracked].filter((d) => !d.includes('/')).sort()) visit(top);

  const ignoredByGit = gitIgnored(repo, found.map((c) => (c.dir ? `${c.path}/` : c.path)));
  const items = found.filter((c) => !ignoredByGit.has(c.dir ? `${c.path}/` : c.path));
  return { items, privateSkipped, gitIgnoredSkipped: found.length - items.length };
}

// ───────────────────────── 유출 검사 ─────────────────────────
// 보조 수단이다. 매칭된 텍스트는 절대 출력하지 않고 파일:줄:규칙 id만 보고한다.
const WEAK_PLACEHOLDER = /xxx|example|your|dummy|fake|placeholder/i;
const VALUE_PLACEHOLDER = /xxx|example|your|dummy|fake|placeholder|sample|changeme|test|\.\.\./i;
export const RULES = [
  { id: 'openai-style-key', re: /sk-[A-Za-z0-9_-]{20,}/, level: 'block' },
  { id: 'github-token', re: /gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}/, level: 'block' },
  { id: 'slack-token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/, level: 'block' },
  { id: 'aws-access-key', re: /AKIA[0-9A-Z]{16}/, level: 'block' },
  { id: 'google-api-key', re: /AIza[0-9A-Za-z_-]{35}/, level: 'block' },
  { id: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, level: 'block' },
  { id: 'jwt', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/, level: 'block' },
  { id: 'notion-token', re: /(?:secret|ntn)_[A-Za-z0-9]{30,}/, level: 'block' },
  {
    id: 'credential-assignment',
    re: /(?:API_?KEY|TOKEN|SECRET|PASSWORD|PASSWD)[A-Z0-9_]*\s*[=:]\s*["']?([A-Za-z0-9_/+=-]{16,})/,
    level: 'block',
    valueGroup: 1,
  },
  { id: 'home-path', re: /\/Users\/[A-Za-z0-9_.-]+/, level: 'warn' },
];

const looksBinary = (buf) => buf.subarray(0, 8000).includes(0);

export function scanText(text, config) {
  const terms = config.leakTerms.map((t) => t.toLowerCase());
  const findings = [];
  text.split('\n').forEach((line, i) => {
    for (const rule of RULES) {
      const m = rule.re.exec(line);
      if (!m) continue;
      if (rule.level === 'block') {
        const subject = rule.valueGroup ? m[rule.valueGroup] : m[0];
        if ((rule.valueGroup ? VALUE_PLACEHOLDER : WEAK_PLACEHOLDER).test(subject)) continue;
      }
      findings.push({ line: i + 1, rule: rule.id, level: rule.level });
    }
    const lower = line.toLowerCase();
    if (terms.some((t) => lower.includes(t))) findings.push({ line: i + 1, rule: 'private-term', level: 'block' });
  });
  return findings;
}

// files: [{ label, abs }]
export function scanFiles(files, config) {
  const allow = new Set(config.allow);
  const out = [];
  for (const { label, abs } of files) {
    let buf;
    try { buf = readFileSync(abs); } catch { continue; }
    if (looksBinary(buf)) continue;
    for (const f of scanText(buf.toString('utf8'), config)) {
      if (allow.has(`${label}#${f.rule}`)) continue;
      out.push({ path: label, ...f });
    }
  }
  return out;
}

// ───────────────────────── 테스트 실행 ─────────────────────────
export function runTests(repo) {
  const files = [
    ...trackedFiles(repo),
    ...gitList(repo, ['ls-files', '-z', '--others', '--exclude-standard']),
  ].filter((p) => /\.test\.mjs$/.test(p) && !/-workspace\//.test(p));
  if (!files.length) return { ran: false };
  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT; // 테스트 안에서 호출돼도 중첩 러너로 동작하지 않게
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
    cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28, env: childEnv,
  });
  const num = (re) => Number(re.exec(r.stdout)?.[1] ?? NaN);
  return {
    ran: true, ok: r.status === 0, files: files.length,
    pass: num(/^# pass (\d+)/m), fail: num(/^# fail (\d+)/m), output: r.stdout + r.stderr,
  };
}

// ───────────────────────── 출력 ─────────────────────────
const out = (s = '') => process.stdout.write(`${s}\n`);
const home = homedir();
const tilde = (p) => (p.startsWith(home) ? `~${p.slice(home.length)}` : p);
const z2 = (n) => String(n).padStart(2, '0');
const stamp = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())} ${z2(d.getHours())}:${z2(d.getMinutes())}`;
};

function printFindings(findings) {
  for (const f of findings) out(`    ${f.path}:${f.line}  ${f.rule} (${f.level})`);
}

function printTests(t) {
  if (!t.ran) { out('테스트: 대상 없음'); return true; }
  out(`테스트: ${t.ok ? '통과' : '실패'} — pass ${t.pass} · fail ${t.fail} (파일 ${t.files}개)`);
  if (!t.ok) out(t.output.split('\n').filter((l) => /^not ok|^# fail/.test(l)).slice(0, 20).join('\n'));
  return t.ok;
}

// ───────────────────────── 명령 ─────────────────────────
const GROUPS = [
  ['stale', '원본이 최신 — `sync`로 가져온다'],
  ['repo-newer', '저장소가 더 최신(저장소에서 직접 고쳤을 수 있음) — 원본에 반영하거나 `sync --force`'],
  ['dirty', '저장소에 미커밋 변경이 있어 건너뜀 — 커밋·되돌린 뒤 `sync` (또는 `--force`)'],
  ['gone', '원본에 없음(삭제·이름 변경) — `sync --prune`으로 저장소에서도 지운다'],
];

function describe(e) {
  if (e.state === 'stale') return `원본 ${stamp(e.srcMs)}${e.commitMs ? ` · 저장소 커밋 ${stamp(e.commitMs)}` : ''} (${e.reason})`;
  if (e.state === 'repo-newer') return `저장소 커밋 ${stamp(e.commitMs)} > 원본 ${stamp(e.srcMs)}`;
  if (e.state === 'dirty') return `원본 ${stamp(e.srcMs)}`;
  return '';
}

export function cmdStatus(ctx) {
  const { repo, source, config } = ctx;
  const { tracked, entries } = inspect(ctx);
  const count = (s) => entries.filter((e) => e.state === s).length;
  out(`원본 ${tilde(source)} → 저장소 ${tilde(repo)}`);
  out(`추적 ${tracked.length}개 · 동일 ${count('ok')} · 어긋남 ${count('stale') + count('repo-newer') + count('dirty')}`
    + ` · 원본 없음 ${count('gone')} · 의도적 유지 ${count('keep')} · 저장소 전용 ${count('repo-only')}`);

  for (const [state, title] of GROUPS) {
    const list = entries.filter((e) => e.state === state);
    if (!list.length) continue;
    out(`\n[${state}] ${title}`);
    for (const e of list) out(`  ${e.path}${describe(e) ? `   (${describe(e)})` : ''}`);
  }
  const keeps = entries.filter((e) => e.state === 'keep');
  if (keeps.length) {
    out('\n[keep] 의도적으로 다름 — 자동 복사하지 않는다');
    for (const e of keeps) out(`  ${e.path}   (${e.note})`);
  }

  const cand = findCandidates({ repo, source, config, tracked });
  if (cand.items.length) {
    out('\n[new?] 원본에만 있고 추적되지 않음 — 공개할 파일이면 `add <경로>`, 아니면 .harness-sync.local.json의 private에 추가');
    for (const c of cand.items) out(`  ${c.path}${c.dir ? `/   (${c.files}개 파일)` : ''}`);
  }
  const skipped = [];
  if (cand.privateSkipped) skipped.push(`비공개 지정 ${cand.privateSkipped}개`);
  if (cand.gitIgnoredSkipped) skipped.push(`.gitignore 대상 ${cand.gitIgnoredSkipped}건`);
  if (skipped.length) out(`\n(건너뜀: ${skipped.join(' · ')})`);

  const drift = count('stale') + count('repo-newer') + count('dirty') + count('gone');
  if (!drift && !cand.items.length) out('\n모두 동기화되어 있다.');
  return drift ? 1 : 0;
}

function copyOne(source, repo, path) {
  const src = join(source, path);
  const dst = join(repo, path);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  chmodSync(dst, statSync(src).mode & 0o777);
}

// 복사 전 유출 검사 → 차단 건이 하나라도 있으면 아무것도 복사하지 않는다.
function applyCopies({ repo, source, config, paths, removals = [], dryRun, withTests }) {
  const findings = scanFiles(paths.map((p) => ({ label: p, abs: join(source, p) })), config);
  const blockers = findings.filter((f) => f.level === 'block');
  const warns = findings.filter((f) => f.level === 'warn');
  if (blockers.length) {
    out(`유출 검사: 차단 ${blockers.length}건 — 아무것도 복사하지 않았다 (매칭 내용은 출력하지 않음)`);
    printFindings(blockers);
    out('  오탐이면 bin/harness-sync.config.json의 allow에 "경로#규칙"을 추가한다.');
    return 1;
  }
  out(`유출 검사: 차단 0건${warns.length ? ` · 경고 ${warns.length}건` : ''}`);
  if (warns.length) printFindings(warns);

  if (dryRun) {
    out(`\n[dry-run] 복사 ${paths.length}개${removals.length ? ` · 삭제 ${removals.length}개` : ''} — 쓰기 없음`);
    for (const p of paths) out(`  복사 ${p}`);
    for (const p of removals) out(`  삭제 ${p}`);
    return 0;
  }
  for (const p of paths) { copyOne(source, repo, p); out(`  복사 ${p}`); }
  for (const p of removals) { unlinkSync(join(repo, p)); out(`  삭제 ${p}`); }
  if (withTests && !printTests(runTests(repo))) return 1;
  out('\n커밋·푸시는 하지 않았다. `git -C <저장소> diff --stat`으로 확인한다.');
  return 0;
}

export function cmdSync(ctx, { force, prune, dryRun, withTests }) {
  const { entries } = inspect(ctx);
  const pick = (states) => entries.filter((e) => states.includes(e.state));
  const targets = pick(force ? ['stale', 'repo-newer', 'dirty'] : ['stale']);
  const held = force ? [] : pick(['repo-newer', 'dirty']);
  const gone = pick(['gone']);
  const work = targets.length > 0 || (prune && gone.length > 0);
  if (!work) out('가져올 변경이 없다.');
  else out(`동기화 대상 ${targets.length}개${prune ? ` · 삭제 ${gone.length}개` : ''}`);
  const code = work
    ? applyCopies({
      ...ctx, paths: targets.map((e) => e.path), removals: prune ? gone.map((e) => e.path) : [], dryRun, withTests,
    })
    : 0;
  if (held.length) {
    out(`\n건너뜀 ${held.length}개 (저장소가 더 최신이거나 미커밋 변경):`);
    for (const e of held) out(`  ${e.state}  ${e.path}`);
  }
  if (gone.length && !prune) out(`\n원본에 없는 추적 파일 ${gone.length}개는 그대로 뒀다 (\`--prune\`으로 삭제).`);
  return code || (held.length ? 1 : 0);
}

export function cmdAdd(ctx, args, { dryRun, withTests }) {
  const { repo, source, config } = ctx;
  if (!args.length) { out('사용법: harness-sync.mjs add <경로...>'); return 2; }
  const tracked = new Set(trackedFiles(repo));
  const isIgnored = matcher(config.ignore);
  const isPrivate = matcher(config.private);
  const picked = new Set();
  const errors = [];
  let skipped = 0;

  const why = (rel) => (isPrivate(rel) ? '비공개로 지정됨' : isIgnored(rel) ? '기본 제외 대상' : null);

  for (const arg of args) {
    const rel = (isAbsolute(arg) ? relative(source, arg) : normalize(arg)).replace(/\/+$/, '');
    if (!rel || rel === '.' || rel.split('/').includes('..') || isAbsolute(rel)) { errors.push(`${arg}: 원본 안의 경로가 아니다`); continue; }
    const st = statOrNull(join(source, rel));
    if (!st) { errors.push(`${rel}: 원본에 없다`); continue; }
    if (st.isFile()) {
      const reason = why(rel);
      if (reason) errors.push(`${rel}: ${reason}`);
      else if (!tracked.has(rel)) picked.add(rel);
      continue;
    }
    for (const f of walkFiles(join(source, rel), rel, isIgnored)) {
      if (tracked.has(f)) continue;
      if (isPrivate(f)) { skipped++; continue; }
      picked.add(f);
    }
  }
  for (const p of gitIgnored(repo, [...picked])) { picked.delete(p); skipped++; }

  if (errors.length) { out('추가할 수 없다:'); for (const e of errors) out(`  ${e}`); return 1; }
  if (!picked.size) { out('추가할 새 파일이 없다 (이미 추적 중이거나 제외 대상).'); return 0; }
  out(`추가 대상 ${picked.size}개${skipped ? ` (비공개·.gitignore로 건너뜀 ${skipped}개)` : ''}`);
  return applyCopies({ ...ctx, paths: [...picked].sort(), dryRun, withTests });
}

export function cmdScan(ctx, { verbose }) {
  const { repo, config } = ctx;
  const files = [
    ...trackedFiles(repo),
    ...gitList(repo, ['ls-files', '-z', '--others', '--exclude-standard']),
  ].map((p) => ({ label: p, abs: join(repo, p) }));
  const findings = scanFiles(files, config);
  const blockers = findings.filter((f) => f.level === 'block');
  const warns = findings.filter((f) => f.level === 'warn');
  out(`검사 ${files.length}개 파일 — 차단 ${blockers.length}건 · 경고 ${warns.length}건 (매칭 내용은 출력하지 않음)`);
  if (blockers.length) printFindings(blockers);
  if (warns.length) {
    if (verbose) printFindings(warns);
    else out(`  경고 ${warns.length}건(홈 경로 등)은 --verbose로 본다.`);
  }
  return blockers.length ? 1 : 0;
}

export function cmdTest(ctx) {
  return printTests(runTests(ctx.repo)) ? 0 : 1;
}

// ───────────────────────── 진입점 ─────────────────────────
export function main(argv, env = process.env) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  const [cmd = 'status', ...rest] = positional;
  const repo = env.HARNESS_REPO ?? join(HERE, '..');
  const source = env.CLAUDE_HOME ?? join(home, '.claude');

  if (flags.has('--help') || cmd === 'help') {
    const header = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 11);
    out(header.map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return 0;
  }
  try {
    if (!existsSync(join(repo, '.git'))) throw new Error(`git 저장소가 아니다: ${repo}`);
    if (!existsSync(source)) throw new Error(`원본 폴더가 없다: ${source}`);
    const ctx = { repo, source, config: loadConfig(repo) };
    const opts = {
      force: flags.has('--force'), prune: flags.has('--prune'),
      dryRun: flags.has('--dry-run'), withTests: !flags.has('--no-test'), verbose: flags.has('--verbose'),
    };
    switch (cmd) {
      case 'status': return cmdStatus(ctx);
      case 'sync': return cmdSync(ctx, opts);
      case 'add': return cmdAdd(ctx, rest, opts);
      case 'scan': return cmdScan(ctx, opts);
      case 'test': return cmdTest(ctx);
      default: out(`알 수 없는 명령: ${cmd} (status · sync · add · scan · test)`); return 2;
    }
  } catch (e) {
    process.stderr.write(`오류: ${e.message}\n`);
    return 2;
  }
}

const entry = process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : '';
if (import.meta.url === entry) process.exitCode = main(process.argv.slice(2));
