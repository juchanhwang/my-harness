import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globToRegExp, matcher, scanText } from '../harness-sync.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'harness-sync.mjs');
const PAST = new Date('2020-01-01T00:00:00Z');
const GIT_ENV = { GIT_AUTHOR_DATE: PAST.toISOString(), GIT_COMMITTER_DATE: PAST.toISOString() };

// 시크릿 형식 문자열은 조각을 이어 붙여 만든다 — 이 파일 자체가 유출 검사에 걸리지 않게.
const FAKE_TOKEN = ['sk', 'A1b2C3d4E5f6G7h8I9j0K1l2M3'].join('-');
const FAKE_ASSIGN = `${['API', 'KEY'].join('_')}=abcdEFGH12345678wxyz`;
const HOME_PATH = ['/Users', 'someone/x'].join('/');

const CONFIG = (extra = {}) => JSON.stringify({
  keep: { 'settings.json': '라이브와 다름' },
  repoOnly: ['README.md', '.gitignore', 'bin/**'],
  ...extra,
});

const sh = (cwd, cmd, args, env = {}) => spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });

// repoFiles는 저장소에 커밋되고(커밋 시각 2020), sourceFiles는 원본(CLAUDE_HOME)에 지금 시각으로 쓰인다.
// 값이 { content, mode }이면 권한을 지정한다.
function world({ repoFiles = {}, sourceFiles = {}, local } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'hsync-'));
  const repo = join(root, 'repo');
  const source = join(root, 'claude');
  mkdirSync(repo);
  mkdirSync(source);
  const put = (base, rel, spec) => {
    const { content, mode } = typeof spec === 'string' ? { content: spec } : spec;
    const abs = join(base, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    if (mode) chmodSync(abs, mode);
  };
  for (const [rel, spec] of Object.entries(repoFiles)) put(repo, rel, spec);
  for (const [rel, spec] of Object.entries(sourceFiles)) put(source, rel, spec);
  writeFileSync(join(repo, '.gitignore'), '.harness-sync.local.json\n*.log\n');
  if (local) writeFileSync(join(repo, '.harness-sync.local.json'), JSON.stringify(local));
  sh(repo, 'git', ['init', '-q']);
  sh(repo, 'git', ['config', 'user.email', 't@example.com']);
  sh(repo, 'git', ['config', 'user.name', 't']);
  sh(repo, 'git', ['add', '-A']);
  sh(repo, 'git', ['commit', '-qm', 'init'], GIT_ENV);
  return { repo, source };
}

const run = (w, args) => {
  const env = { ...process.env, HARNESS_REPO: w.repo, CLAUDE_HOME: w.source };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const git = (w, ...args) => sh(w.repo, 'git', args).stdout.trim();
const read = (base, rel) => readFileSync(join(base, rel), 'utf8');
const section = (text, name) => new RegExp(`\\[${name}\\][^\\n]*\\n((?:  .*\\n?)*)`).exec(text)?.[1] ?? '';

const standard = () => world({
  repoFiles: {
    'bin/harness-sync.config.json': CONFIG(),
    'README.md': 'repo only',
    'skills/x/same.md': 'same',
    'skills/x/old.md': 'old',
    'skills/x/gone.md': 'gone',
    'settings.json': 'public version',
    'hooks/run.sh': { content: '#!/bin/sh\n', mode: 0o644 },
  },
  sourceFiles: {
    'skills/x/same.md': 'same',
    'skills/x/old.md': 'new',
    'settings.json': 'live version',
    'hooks/run.sh': { content: '#!/bin/sh\n', mode: 0o755 },
    'skills/x/fresh.md': 'fresh',
    'skills/x/secret.md': 'private one',
    'skills/other/a.md': 'a',
  },
  local: { private: ['skills/x/secret.md'] },
});

test('glob: **, *, 디렉터리 접두 확장', () => {
  assert.ok(globToRegExp('**/node_modules/**').test('a/b/node_modules/x.js'));
  assert.ok(globToRegExp('**/node_modules/**').test('node_modules/x.js'));
  assert.ok(!globToRegExp('*.md').test('a/b.md'));
  const m = matcher(['skills/career']);
  assert.ok(m('skills/career') && m('skills/career/') && m('skills/career/x.md'));
  assert.ok(!m('skills/careers/x.md'));
});

test('유출 검사: 시크릿 형식·할당·식별어를 잡고 플레이스홀더는 넘긴다', () => {
  const cfg = { leakTerms: ['zz-company'], allow: [] };
  const rules = (text) => scanText(text, cfg).map((f) => `${f.line}:${f.rule}`);
  assert.deepEqual(rules(`token ${FAKE_TOKEN}`), ['1:openai-style-key']);
  assert.deepEqual(rules(FAKE_ASSIGN), ['1:credential-assignment']);
  assert.deepEqual(rules(`${['API', 'KEY'].join('_')}=your-api-key-goes-here-1234`), []);
  assert.deepEqual(rules('sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxx'), []);
  assert.deepEqual(rules(`see ${HOME_PATH}`), ['1:home-path']);
  assert.deepEqual(rules('회사: ZZ-Company'), ['1:private-term']);
  assert.deepEqual(rules('일반 문장'), []);
});

test('status: 상태 분류, 비공개 숨김, 종료 코드', () => {
  const r = run(standard(), ['status']);
  assert.equal(r.code, 1);
  assert.match(section(r.out, 'stale'), /skills\/x\/old\.md/);
  assert.match(section(r.out, 'stale'), /hooks\/run\.sh.*실행 권한/);
  assert.match(section(r.out, 'gone'), /skills\/x\/gone\.md/);
  assert.match(section(r.out, 'keep'), /settings\.json/);
  assert.match(section(r.out, 'new\\?'), /skills\/x\/fresh\.md/);
  assert.match(section(r.out, 'new\\?'), /skills\/other\/.*1개 파일/);
  assert.doesNotMatch(r.out, /secret\.md/);
  assert.doesNotMatch(r.out, /same\.md|README/);
  assert.match(r.out, /비공개 지정 1개/);
});

test('status: 모두 같으면 exit 0', () => {
  const w = world({
    repoFiles: { 'bin/harness-sync.config.json': CONFIG(), 'skills/x/a.md': 'a' },
    sourceFiles: { 'skills/x/a.md': 'a' },
  });
  const r = run(w, ['status']);
  assert.equal(r.code, 0);
  assert.match(r.out, /모두 동기화/);
});

test('sync: 어긋난 파일만 복사하고 keep·repo-only·gone은 두며 커밋하지 않는다', () => {
  const w = standard();
  const commits = git(w, 'rev-list', '--count', 'HEAD');
  const r = run(w, ['sync', '--no-test']);
  assert.equal(r.code, 0, r.out + r.err);
  assert.equal(read(w.repo, 'skills/x/old.md'), 'new');
  assert.equal(read(w.repo, 'settings.json'), 'public version');
  assert.equal(read(w.repo, 'skills/x/gone.md'), 'gone');
  assert.equal(statSync(join(w.repo, 'hooks/run.sh')).mode & 0o111, 0o111);
  assert.equal(git(w, 'rev-list', '--count', 'HEAD'), commits);
  const changed = git(w, 'status', '--porcelain').split('\n').map((l) => l.trim()).sort();
  assert.deepEqual(changed, ['M hooks/run.sh', 'M skills/x/old.md']);
  assert.match(run(w, ['sync', '--no-test']).out, /가져올 변경이 없다/);
});

test('sync --dry-run은 쓰지 않고, --prune만 원본에 없는 파일을 지운다', () => {
  const w = standard();
  const dry = run(w, ['sync', '--prune', '--dry-run']);
  assert.equal(dry.code, 0);
  assert.match(dry.out, /\[dry-run\]/);
  assert.match(dry.out, /삭제 skills\/x\/gone\.md/);
  assert.equal(read(w.repo, 'skills/x/old.md'), 'old');
  assert.ok(existsSync(join(w.repo, 'skills/x/gone.md')));
  run(w, ['sync', '--no-test']);
  assert.ok(existsSync(join(w.repo, 'skills/x/gone.md')));
  run(w, ['sync', '--prune', '--no-test']);
  assert.ok(!existsSync(join(w.repo, 'skills/x/gone.md')));
});

test('sync: 유출 검사에 걸리면 아무것도 복사하지 않고 값을 출력하지 않는다', () => {
  const w = world({
    repoFiles: { 'bin/harness-sync.config.json': CONFIG(), 'skills/x/a.md': 'a1', 'skills/x/b.md': 'b1' },
    sourceFiles: { 'skills/x/a.md': 'a2', 'skills/x/b.md': `leak ${FAKE_TOKEN}` },
  });
  const r = run(w, ['sync', '--no-test']);
  assert.equal(r.code, 1);
  assert.equal(read(w.repo, 'skills/x/a.md'), 'a1');
  assert.equal(read(w.repo, 'skills/x/b.md'), 'b1');
  assert.match(r.out, /skills\/x\/b\.md:1\s+openai-style-key/);
  assert.ok(!r.out.includes(FAKE_TOKEN) && !r.err.includes(FAKE_TOKEN));
});

test('sync: allow에 적은 "경로#규칙"은 오탐으로 넘어간다', () => {
  const w = world({
    repoFiles: {
      'bin/harness-sync.config.json': CONFIG({ allow: ['skills/x/b.md#openai-style-key'] }),
      'skills/x/b.md': 'b1',
    },
    sourceFiles: { 'skills/x/b.md': `leak ${FAKE_TOKEN}` },
  });
  assert.equal(run(w, ['sync', '--no-test']).code, 0);
  assert.equal(read(w.repo, 'skills/x/b.md'), `leak ${FAKE_TOKEN}`);
});

test('sync: 저장소가 더 최신이거나 미커밋 변경이 있으면 건너뛰고 --force로만 덮어쓴다', () => {
  const w = world({
    repoFiles: { 'bin/harness-sync.config.json': CONFIG(), 'skills/x/newer.md': 'repo', 'skills/x/dirty.md': 'repo' },
    sourceFiles: { 'skills/x/newer.md': 'source', 'skills/x/dirty.md': 'source' },
  });
  const t = new Date('2019-01-01T00:00:00Z');
  utimesSync(join(w.source, 'skills/x/newer.md'), t, t); // 원본이 저장소 커밋(2020)보다 오래됨
  writeFileSync(join(w.repo, 'skills/x/dirty.md'), 'edited in repo'); // 미커밋 변경

  const status = run(w, ['status']);
  assert.match(section(status.out, 'repo-newer'), /newer\.md/);
  assert.match(section(status.out, 'dirty'), /dirty\.md/);

  const skip = run(w, ['sync', '--no-test']);
  assert.equal(skip.code, 1);
  assert.equal(read(w.repo, 'skills/x/newer.md'), 'repo');
  assert.equal(read(w.repo, 'skills/x/dirty.md'), 'edited in repo');

  const force = run(w, ['sync', '--force', '--no-test']);
  assert.equal(force.code, 0, force.out + force.err);
  assert.equal(read(w.repo, 'skills/x/newer.md'), 'source');
  assert.equal(read(w.repo, 'skills/x/dirty.md'), 'source');
});

test('add: 새 파일을 추가하고 비공개·기본 제외·경계 밖 경로는 거절한다', () => {
  const w = world({
    repoFiles: { 'bin/harness-sync.config.json': CONFIG(), 'skills/x/a.md': 'a' },
    sourceFiles: {
      'skills/x/a.md': 'a',
      'skills/x/new.md': 'n1',
      'skills/x/secret.md': 's',
      'skills/x/.env.local': 'FOO=bar',
      'skills/x/dir/n2.md': 'n2',
      'skills/x/dir/secret.md': 's2',
      'skills/x/dir/debug.log': 'log',
    },
    local: { private: ['skills/x/secret.md', 'skills/x/dir/secret.md'] },
  });
  const added = run(w, ['add', 'skills/x/new.md']);
  assert.equal(added.code, 0, added.out + added.err);
  assert.equal(read(w.repo, 'skills/x/new.md'), 'n1');
  assert.match(git(w, 'status', '--porcelain'), /\?\? skills\/x\/new\.md/);

  const refused = [
    ['skills/x/secret.md', '비공개로 지정됨'],
    ['skills/x/.env.local', '기본 제외 대상'],
    ['../etc/passwd', '원본 안의 경로가 아니다'],
    ['skills/x/nope.md', '원본에 없다'],
  ];
  for (const [arg, reason] of refused) {
    const r = run(w, ['add', arg]);
    assert.equal(r.code, 1, arg);
    assert.ok(r.out.includes(reason), `${arg}: ${r.out}`);
  }
  assert.ok(!existsSync(join(w.repo, 'skills/x/secret.md')));
  assert.ok(!existsSync(join(w.repo, 'skills/x/.env.local')));

  // 디렉터리 추가: 비공개·.gitignore(*.log) 대상은 조용히 건너뛴다
  const dir = run(w, ['add', 'skills/x/dir']);
  assert.equal(dir.code, 0, dir.out + dir.err);
  assert.ok(existsSync(join(w.repo, 'skills/x/dir/n2.md')));
  assert.ok(!existsSync(join(w.repo, 'skills/x/dir/secret.md')));
  assert.ok(!existsSync(join(w.repo, 'skills/x/dir/debug.log')));

  assert.equal(run(w, ['add']).code, 2);
});

test('scan: 저장소 안의 시크릿 형식·식별어를 차단 건으로 보고하고 값은 출력하지 않는다', () => {
  const w = world({ repoFiles: { 'bin/harness-sync.config.json': CONFIG(), 'skills/x/a.md': 'clean' } });
  assert.equal(run(w, ['scan']).code, 0);

  writeFileSync(join(w.repo, 'skills/x/leak.md'), `line1\n${FAKE_TOKEN}\n`);
  const r = run(w, ['scan']);
  assert.equal(r.code, 1);
  assert.match(r.out, /skills\/x\/leak\.md:2\s+openai-style-key/);
  assert.ok(!r.out.includes(FAKE_TOKEN));

  writeFileSync(join(w.repo, 'skills/x/leak.md'), 'clean again\n');
  writeFileSync(join(w.repo, '.harness-sync.local.json'), JSON.stringify({ leakTerms: ['zz-company'] }));
  writeFileSync(join(w.repo, 'skills/x/a.md'), 'about ZZ-Company\n');
  const term = run(w, ['scan']);
  assert.equal(term.code, 1);
  assert.match(term.out, /skills\/x\/a\.md:1\s+private-term/);
  assert.ok(!term.out.toLowerCase().includes('zz-company'));
});

test('test: 저장소의 *.test.mjs를 실행하고 실패하면 exit 1', () => {
  const pass = "import { test } from 'node:test';\ntest('ok', () => {});\n";
  const fail = "import { test } from 'node:test';\ntest('bad', () => { throw new Error('boom'); });\n";
  const ok = world({ repoFiles: { 'bin/harness-sync.config.json': CONFIG(), 'x/ok.test.mjs': pass } });
  const r1 = run(ok, ['test']);
  assert.equal(r1.code, 0, r1.out + r1.err);
  assert.match(r1.out, /테스트: 통과 — pass 1 · fail 0/);

  const bad = world({ repoFiles: { 'bin/harness-sync.config.json': CONFIG(), 'x/bad.test.mjs': fail } });
  const r2 = run(bad, ['test']);
  assert.equal(r2.code, 1);
  assert.match(r2.out, /테스트: 실패/);
});

test('오류 처리: 알 수 없는 명령·깨진 설정·없는 원본은 exit 2', () => {
  const w = standard();
  assert.equal(run(w, ['nope']).code, 2);

  const none = { repo: w.repo, source: join(w.source, 'missing') };
  assert.equal(run(none, ['status']).code, 2);

  writeFileSync(join(w.repo, '.harness-sync.local.json'), '{ broken');
  const r = run(w, ['status']);
  assert.equal(r.code, 2);
  assert.match(r.err, /설정 파일을 읽을 수 없다/);
});
