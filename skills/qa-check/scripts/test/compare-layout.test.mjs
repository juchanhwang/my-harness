import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUT_TOLERANCE_PX, applyWaivers, compareLayout } from '../compare-styles.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', 'compare-styles.mjs');
const VERDICT = join(HERE, '..', 'verdict.mjs');
const BOX_SNIPPET = join(HERE, '..', 'layout-boxes.snippet.js');
const FIXTURES = join(HERE, 'fixtures', 'layout');

// 세로 카드: title · a · b 가 root 안에 세로로 쌓이고(start 16, gap 16·8, end 16), close 는 오른쪽 끝(end 16)에 붙는다.
const node = (selector, box, compare = ['w', 'h']) => ({ figmaId: '1:2', selector, box, compare });
const NODES = {
  root: node('', [0, 0, 375, 176]),
  title: node('.title', [16, 16, 120, 24], ['h']),
  a: node('.a', [16, 56, 343, 48]),
  b: node('.b', [16, 112, 343, 48]),
  close: node('.close', [327, 16, 32, 32]),
};
const GROUPS = [
  { parent: 'root', kids: ['title', 'a', 'b'], axis: 'y', checks: ['start', 'gaps', 'end'] },
  { parent: 'root', kids: ['close'], axis: 'x', checks: ['end'] },
];
const clone = (v) => JSON.parse(JSON.stringify(v));
const card = (layout = {}, props = {}) => ({ target: 'card', source: 'test', props, layout: { viewport: '375x812', nodes: clone(NODES), groups: clone(GROUPS), ...layout } });
const sameBoxes = () => Object.fromEntries(Object.entries(NODES).map(([k, n]) => [k, [...n.box]]));
const at = (viewport, boxes, props = {}) => ({ target: 'card', selector: '.card', viewport, count: 1, rootFontSize: 16, samples: [{ index: 0, props }], ...(boxes === undefined ? {} : { boxes }) });
const withBox = (key, box) => ({ ...sameBoxes(), [key]: box });
const ids = (r) => r.findings.map((f) => f.id);

test('LAYOUT_TOLERANCE_PX is 1', () => assert.equal(LAYOUT_TOLERANCE_PX, 1));

test('identical boxes give nothing; a design without layout gives nothing even when boxes exist', () => {
  const r = compareLayout(card(), [at('375x812', sameBoxes())]);
  assert.deepEqual([r.findings, r.notChecked, r.blocked], [[], [], []]);
  const { layout: _drop, ...noLayout } = card();
  for (const d of [noLayout, { ...noLayout, layout: null }]) {
    const n = compareLayout(d, [at('375x812', withBox('a', [0, 0, 1, 1]))]);
    assert.deepEqual([n.findings, n.notChecked, n.blocked], [[], [], []]);
  }
});

test('viewport null puts the whole layout in notChecked with the manifest hint', () => {
  const r = compareLayout(card({ viewport: null }), [at('375x812', withBox('a', [0, 0, 1, 1]))]);
  assert.deepEqual(r.notChecked, [{ what: 'card layout', reason: '시안 폭에 맞는 viewport 없음 — 매니페스트에 viewport를 넣으면 비교' }]);
  assert.deepEqual([r.findings, r.blocked], [[], []]);
});

test('no actual at the layout viewport, or one without boxes, is blocked', () => {
  const none = compareLayout(card(), [at('1280x800', sameBoxes())]);
  assert.deepEqual([none.findings, none.notChecked, none.blocked.length], [[], [], 1]);
  for (const part of ["target 'card' layout", '375x812', 'no actual extraction']) assert.ok(none.blocked[0].includes(part), `${part} in: ${none.blocked[0]}`);
  const noBoxes = compareLayout(card(), [at('375x812')]);
  assert.equal(noBoxes.blocked.length, 1);
  for (const part of ['boxes missing', 'layout-boxes.snippet.js', '.card', '375x812']) assert.ok(noBoxes.blocked[0].includes(part), `${part} in: ${noBoxes.blocked[0]}`);
});

test('actuals at other viewports are skipped for layout', () => {
  const r = compareLayout(card(), [at('1280x800', withBox('a', [0, 0, 999, 999])), at('375x812', sameBoxes())]);
  assert.deepEqual([r.findings, r.notChecked, r.blocked], [[], [], []]);
});

test('size: only the metrics in compare are checked', () => {
  const wide = compareLayout(card(), [at('375x812', withBox('title', [16, 16, 200, 24]))]);
  assert.deepEqual(wide.findings, [], 'title compares h only');
  const r = compareLayout(card({ groups: [] }), [at('375x812', withBox('a', [16, 56, 300, 40]))]);
  assert.deepEqual(ids(r), ['L-card-a.w-375x812', 'L-card-a.h-375x812']);
  const none = compareLayout(card({ groups: [], nodes: { ...clone(NODES), a: node('.a', [16, 56, 343, 48], []) } }), [at('375x812', withBox('a', [16, 56, 300, 40]))]);
  assert.deepEqual(none.findings, []);
});

test('tolerance: a difference of exactly 1px passes, one 1/64px step more is a finding', () => {
  const run = (h) => ids(compareLayout(card(), [at('375x812', withBox('b', [16, 112, 343, h]))]));
  assert.deepEqual(run(49), []);
  assert.deepEqual(run(47), []);
  assert.deepEqual(run(49.015625), ['L-card-b.h-375x812', 'L-card-root.end-y(b)-375x812']);
  assert.deepEqual(run(46.984375), ['L-card-b.h-375x812', 'L-card-root.end-y(b)-375x812']);
  // Chromium 의 1/64px 반올림(74.28571 → 74.28125)은 그대로 통과한다
  const tab = card({ nodes: { root: node('', [0, 0, 375, 74.28571319580078]) }, groups: [] });
  assert.deepEqual(compareLayout(tab, [at('375x812', { root: [0, 0, 375, 74.28125] })]).findings, []);
});

test('finding shape: Minor, open, Korean title, full selector in where, px to two decimals, tolerance note, layout:<metric> property', () => {
  const [f, ...rest] = compareLayout(card({ groups: [] }), [at('375x812', withBox('b', [16, 112, 343, 44]))]).findings;
  assert.equal(rest.length, 0);
  assert.deepEqual(f, {
    id: 'L-card-b.h-375x812', severity: 'Minor', status: 'open', title: '레이아웃 크기 불일치', where: '.card .b @375x812',
    expected: '48px', actual: '44px', note: '허용 오차 ±1px', target: 'card', selector: '.card .b', viewport: '375x812', property: 'layout:h',
  });
  const [g] = compareLayout(card({ nodes: { root: node('', [0, 0, 375, 74.28571319580078]) }, groups: [] }), [at('375x812', { root: [0, 0, 375, 72.28125] })]).findings;
  assert.deepEqual([g.where, g.selector, g.expected, g.actual], ['.card @375x812', '.card', '74.29px', '72.28px']);
});

test('groups: start, gaps and end along the axis, measured from the parent; titles and properties name the metric', () => {
  const boxes = sameBoxes();
  boxes.title = [16, 20, 120, 24]; // start 16 → 20, gap-y(title↔a) 16 → 12
  boxes.b = [16, 116, 343, 48]; // gap-y(a↔b) 8 → 12, end-y(b) 16 → 12
  boxes.close = [323, 16, 32, 32]; // x 축 end-x(close) 16 → 20
  const r = compareLayout(card(), [at('375x812', boxes)]);
  assert.deepEqual(r.findings.map((f) => [f.id, f.title, f.property, f.where, f.expected, f.actual]), [
    ['L-card-root.start-y(title)-375x812', '레이아웃 여백 불일치', 'layout:start-y(title)', '.card @375x812', '16px', '20px'],
    ['L-card-root.gap-y(title↔a)-375x812', '레이아웃 간격 불일치', 'layout:gap-y(title↔a)', '.card @375x812', '16px', '12px'],
    ['L-card-root.gap-y(a↔b)-375x812', '레이아웃 간격 불일치', 'layout:gap-y(a↔b)', '.card @375x812', '8px', '12px'],
    ['L-card-root.end-y(b)-375x812', '레이아웃 여백 불일치', 'layout:end-y(b)', '.card @375x812', '16px', '12px'],
    ['L-card-root.end-x(close)-375x812', '레이아웃 여백 불일치', 'layout:end-x(close)', '.card @375x812', '16px', '20px'],
  ]);
  assert.deepEqual(r.blocked, []);
});

test('groups: only the listed checks run, and a non-root parent uses its own box', () => {
  const boxes = { ...sameBoxes(), title: [16, 20, 120, 24], b: [16, 116, 343, 48] };
  const onlyEnd = compareLayout(card({ groups: [{ ...GROUPS[0], checks: ['end'] }] }), [at('375x812', boxes)]);
  assert.deepEqual(ids(onlyEnd), ['L-card-root.end-y(b)-375x812']);
  const nested = card({
    nodes: { root: node('', [0, 0, 375, 100]), list: node('.list', [0, 20, 375, 80]), x: node('.x', [16, 28, 40, 40]), y: node('.y', [64, 28, 40, 40]) },
    groups: [{ parent: 'list', kids: ['x', 'y'], axis: 'x', checks: ['start', 'gaps'] }, { parent: 'list', kids: ['x'], axis: 'y', checks: ['start'] }],
  });
  const ok = { root: [0, 0, 375, 100], list: [0, 20, 375, 80], x: [16, 28, 40, 40], y: [64, 28, 40, 40] };
  assert.deepEqual(compareLayout(nested, [at('375x812', ok)]).findings, []);
  const moved = compareLayout(nested, [at('375x812', { ...ok, list: [4, 24, 371, 76] })]);
  assert.deepEqual(moved.findings.map((f) => [f.id, f.where, f.expected, f.actual]), [
    ['L-card-list.w-375x812', '.card .list @375x812', '375px', '371px'],
    ['L-card-list.h-375x812', '.card .list @375x812', '80px', '76px'],
    ['L-card-list.start-x(x)-375x812', '.card .list @375x812', '16px', '12px'],
    ['L-card-list.start-y(x)-375x812', '.card .list @375x812', '8px', '4px'],
  ]);
});

test('a root parent is [0, 0, root.w, root.h] even if its box carries an offset', () => {
  const d = card({ nodes: { root: node('', [10, 10, 100, 50]), k: node('.k', [12, 0, 10, 10]) }, groups: [{ parent: 'root', kids: ['k'], axis: 'x', checks: ['start', 'end'] }] });
  assert.deepEqual(compareLayout(d, [at('375x812', { root: [0, 0, 100, 50], k: [12, 0, 10, 10] })]).findings, []);
  assert.deepEqual(ids(compareLayout(d, [at('375x812', { root: [0, 0, 100, 50], k: [2, 0, 10, 10] })])), ['L-card-root.start-x(k)-375x812', 'L-card-root.end-x(k)-375x812']);
});

test('a box that was not found is blocked with the key and selector, and comparisons that need it are skipped', () => {
  const r = compareLayout(card(), [at('375x812', withBox('a', null))]);
  assert.deepEqual([r.findings, r.notChecked], [[], []]);
  assert.equal(r.blocked.length, 1);
  for (const part of ["node 'a'", ".card .a", 'matched no element', '375x812']) assert.ok(r.blocked[0].includes(part), `${part} in: ${r.blocked[0]}`);
  const { a: _drop, ...missingKey } = sameBoxes();
  const m = compareLayout(card(), [at('375x812', missingKey)]);
  assert.deepEqual(m.findings, []);
  assert.match(m.blocked[0], /node 'a': no box extracted/);
});

test('a 0×0 box where the design has a size is blocked (hidden element), a 0×0 design node is compared normally', () => {
  const boxes = withBox('a', [0, 0, 0, 0]);
  boxes.b = [16, 116, 343, 48]; // a 와 무관한 end-y(b)는 여전히 비교한다
  const r = compareLayout(card(), [at('375x812', boxes)]);
  assert.deepEqual(ids(r), ['L-card-root.end-y(b)-375x812']);
  assert.equal(r.blocked.length, 1);
  for (const part of ["node 'a'", '.card .a', '0×0 — 숨겨진 요소이거나 selector가 틀림']) assert.ok(r.blocked[0].includes(part), `${part} in: ${r.blocked[0]}`);
  const spacer = card({ nodes: { root: node('', [0, 0, 375, 10]), s: node('.s', [0, 0, 0, 0]) }, groups: [] });
  const s = compareLayout(spacer, [at('375x812', { root: [0, 0, 375, 10], s: [0, 0, 0, 0] })]);
  assert.deepEqual([s.findings, s.blocked], [[], []]);
});

test('unparseable actual boxes are blocked, not findings', () => {
  for (const bad of [[1, 2, 3], 'x', [0, 0, 'a', 1], [0, 0, NaN, 1]]) {
    const r = compareLayout(card(), [at('375x812', withBox('a', bad))]);
    assert.deepEqual(r.findings, [], JSON.stringify(bad));
    assert.match(r.blocked[0], /node 'a': unparseable actual box/);
  }
});

test('invalid design layout data blocks only the broken node or group; the rest still compares', () => {
  const noRoot = compareLayout(card({ nodes: { a: NODES.a } }), [at('375x812', sameBoxes())]);
  assert.match(noRoot.blocked[0], /nodes\.root missing/);
  const badViewport = compareLayout(card({ viewport: 375 }), [at('375x812', sameBoxes())]);
  assert.match(badViewport.blocked[0], /viewport must be a viewport string or null/);
  const nodes = { ...clone(NODES), a: node('.a', [16, 56, 343], ['w', 'h']), close: node('.close', [327, 16, 32, 32], ['width']) };
  const groups = [...clone(GROUPS), { parent: 'root', kids: ['ghost'], axis: 'x', checks: ['start'] }, { parent: 'root', kids: ['b'], axis: 'z', checks: ['middle'] }];
  const boxes = { ...sameBoxes(), title: [16, 20, 120, 24] };
  const r = compareLayout(card({ nodes, groups }), [at('375x812', boxes)]);
  assert.deepEqual(r.blocked.map((b) => b.replace(/:.*/, '')), ["target 'card' layout node 'a'", "target 'card' layout node 'close'", "target 'card' layout group 2", "target 'card' layout group 3"]);
  assert.match(r.blocked[2], /ghost/);
  assert.match(r.blocked[3], /axis 'z'.*checks \["middle"\]/);
  assert.deepEqual(ids(r), ['L-card-root.start-y(title)-375x812'], 'title start still compares; anything touching a or close is skipped');
  const rootSel = compareLayout(card({ nodes: { ...clone(NODES), root: node('.card', [0, 0, 375, 176]) } }), [at('375x812', sameBoxes())]);
  assert.match(rootSel.blocked[0], /root selector must be ''/);
});

test('waivers match layout findings by selector, property and value like any other finding', () => {
  const boxes = withBox('b', [16, 116, 343, 48]);
  const findings = compareLayout(card(), [at('375x812', boxes)]).findings;
  assert.deepEqual(findings.map((f) => f.property), ['layout:gap-y(a↔b)', 'layout:end-y(b)']);
  const w = { selector: '.card', property: 'layout:gap-y(a↔b)', figma: 8, actual: '12px', reason: '시안 간격 갱신 예정', by: 'designer', date: '2026-11-06' };
  const [gap, end] = applyWaivers(findings, [w]);
  assert.deepEqual([gap.status, gap.waiver, gap.severity], ['waived', { reason: '시안 간격 갱신 예정', by: 'designer', date: '2026-11-06' }, 'Minor']);
  assert.deepEqual([end.status, end.note], ['open', '허용 오차 ±1px']);
  const [stale] = applyWaivers(findings, [{ ...w, actual: '13px' }]);
  assert.deepEqual([stale.status, stale.note], ['open', '허용 오차 ±1px; waiver 갱신 필요']);
  const [size] = compareLayout(card({ groups: [] }), [at('375x812', withBox('b', [16, 112, 343, 44]))]).findings;
  assert.equal(applyWaivers([size], [{ ...w, selector: '.card .b', property: 'layout:h', figma: '48px', actual: 44 }])[0].status, 'waived');
  assert.equal(applyWaivers([size], [{ ...w, selector: '.card .b', property: 'layout:w', figma: '48px', actual: 44 }])[0].status, 'open');
});

// ---- CLI ----
const tmp = () => mkdtempSync(join(tmpdir(), 'compare-layout-'));
const write = (dir, name, data) => { const p = join(dir, name); writeFileSync(p, JSON.stringify(data)); return p; };
const cli = (...args) => spawnSync('node', [CLI, ...args], { encoding: 'utf8' });
const verdictOf = (dir, doc) => spawnSync('node', [VERDICT, write(dir, 'findings.json', doc)], { encoding: 'utf8' }).stdout.trim();

test('CLI: boxes on the actual side change nothing when the design has no layout (old reports recompute byte for byte)', () => {
  const dir = tmp();
  const { layout: _drop, ...old } = card({}, { color: '#FFFFFF' });
  const d = write(dir, 'design.json', [old]);
  const plain = cli('--design', d, '--actual', write(dir, 'a1.json', [at('375x812', undefined, { color: 'rgb(0, 0, 0)' })]));
  const boxed = cli('--design', d, '--actual', write(dir, 'a2.json', [at('375x812', withBox('a', null), { color: 'rgb(0, 0, 0)' })]));
  assert.equal(plain.status, 0, plain.stderr);
  assert.equal(boxed.stdout, plain.stdout);
});

test('CLI: layout findings join the property findings in one FindingsDoc; property comparison still runs at every viewport', () => {
  const dir = tmp();
  const d = write(dir, 'design.json', [card({}, { color: '#FFFFFF' })]);
  const a = write(dir, 'actual.json', [at('1280x800', undefined, { color: 'rgb(0, 0, 0)' }), at('375x812', withBox('b', [16, 112, 343, 44]), { color: 'rgb(255, 255, 255)' })]);
  const r = cli('--design', d, '--actual', a);
  assert.equal(r.status, 0, r.stderr);
  const doc = JSON.parse(r.stdout);
  assert.deepEqual(doc.findings.map((f) => f.id), ['S-card-color-0-1280x800', 'L-card-b.h-375x812', 'L-card-root.end-y(b)-375x812']);
  assert.deepEqual([doc.blocked, doc.notChecked], [[], []]);
  assert.equal(verdictOf(dir, doc), 'FAIL');
});

test('CLI verdicts: layout-only deviations are PASS WITH MINOR, a missing box is BLOCKED, a null viewport alone stays PASS', () => {
  const dir = tmp();
  const run = (design, actual) => JSON.parse(cli('--design', write(dir, 'd.json', [design]), '--actual', write(dir, 'a.json', actual)).stdout);
  const minor = run(card(), [at('375x812', withBox('b', [16, 112, 343, 44]))]);
  assert.equal(verdictOf(dir, minor), 'PASS WITH MINOR');
  const blocked = run(card(), [at('375x812', withBox('a', null))]);
  assert.equal(verdictOf(dir, blocked), 'BLOCKED');
  const unchecked = run(card({ viewport: null }), [at('375x812')]);
  assert.deepEqual(unchecked.notChecked.map((n) => n.what), ['card layout']);
  assert.equal(verdictOf(dir, unchecked), 'PASS');
});

test('CLI applies --waivers to layout findings', () => {
  const dir = tmp();
  const d = write(dir, 'design.json', [card({ groups: [] })]);
  const a = write(dir, 'actual.json', [at('375x812', withBox('b', [16, 112, 343, 44]))]);
  const w = write(dir, 'waivers.json', [{ selector: '.card .b', property: 'layout:h', figma: '48px', actual: '44px', reason: 'r', by: 'designer', date: '2026-11-06' }]);
  const doc = JSON.parse(cli('--design', d, '--actual', a, '--waivers', w).stdout);
  assert.deepEqual(doc.findings.map((f) => [f.id, f.status]), [['L-card-b.h-375x812', 'waived']]);
  assert.equal(verdictOf(dir, doc), 'PASS');
});

// ---- layout-boxes.snippet.js ----
// 자리표시자 치환은 style.md 5단계와 같다(함수 치환이라 JSON 안의 `$`가 replace 패턴으로 해석되지 않는다).
const boxSource = () => readFileSync(BOX_SNIPPET, 'utf8');
const fillBoxes = (rootSelector, nodes) => boxSource()
  .replace('__SELECTOR_JSON__', () => JSON.stringify(rootSelector))
  .replace('__NODES_JSON__', () => JSON.stringify(nodes));
// stub DOM: rects 는 selector → {x, y, width, height}, 루트는 rootRect. root.querySelector 만 자식을 찾는다.
function runBoxSnippet(src, { rootSelector = '.card', rootRect = { x: 10, y: 100, width: 375, height: 176 }, rects = {} } = {}) {
  const el = (r) => ({ getBoundingClientRect: () => r, querySelector: (s) => (Object.hasOwn(rects, s) ? el(rects[s]) : null) });
  const document = { querySelector: (s) => (s === rootSelector ? el(rootRect) : null) };
  return new Function('document', `return (${src});`)(document)();
}

test('box snippet: each placeholder appears once, in code (not in a comment)', () => {
  const src = boxSource();
  for (const [placeholder, line] of [['__SELECTOR_JSON__', 'const rootSelector = __SELECTOR_JSON__;'], ['__NODES_JSON__', 'const nodes = __NODES_JSON__;']]) {
    assert.equal(src.split(placeholder).length - 1, 1, placeholder);
    assert.ok(src.includes(line), line);
  }
});

test('box snippet: boxes are relative to the root, "" is the root itself, a missing element is null', () => {
  const out = runBoxSnippet(fillBoxes('.card', { root: '', a: '.a', ghost: '.ghost' }), { rects: { '.a': { x: 26, y: 156, width: 343, height: 48 } } });
  assert.deepEqual(out, { rootFound: true, boxes: { root: [0, 0, 375, 176], a: [16, 56, 343, 48], ghost: null } });
});

test('box snippet: a missing root returns rootFound false only', () => {
  assert.deepEqual(runBoxSnippet(fillBoxes('.nope', { root: '' })), { rootFound: false });
});

test('box snippet: wrong placeholder types throw, an unfilled placeholder is a ReferenceError', () => {
  for (const [root, nodes] of [[null, {}], ['.card', ['a']], ['.card', null], ['.card', { a: 1 }]]) {
    assert.throws(() => runBoxSnippet(fillBoxes(root, nodes)), TypeError, JSON.stringify([root, nodes]));
  }
  assert.throws(() => runBoxSnippet(boxSource().replace('__SELECTOR_JSON__', () => '".card"')), ReferenceError);
});

test('box snippet output feeds compareLayout through the actual entry', () => {
  const d = card({ groups: [] });
  const nodes = Object.fromEntries(Object.entries(d.layout.nodes).map(([k, n]) => [k, n.selector]));
  const rects = { '.title': { x: 26, y: 116, width: 90, height: 24 }, '.a': { x: 26, y: 156, width: 343, height: 48 }, '.b': { x: 26, y: 212, width: 343, height: 44 }, '.close': { x: 337, y: 116, width: 32, height: 32 } };
  const out = runBoxSnippet(fillBoxes('.card', nodes), { rects });
  const r = compareLayout(d, [at('375x812', out.boxes)]);
  assert.deepEqual(ids(r), ['L-card-b.h-375x812']);
});

// ---- 실측 fixture 회귀 (로컬 PHP 앱, 2026-11-06) ----
// design.json: bench/layout-compare.mjs 의 Figma 박스(get_metadata 환산)·selector·그룹. actual-*.json: 같은 페이지에서
// computed-style.snippet.js(빈 요청)와 layout-boxes.snippet.js 로 뽑은 값. 결함 벌은 CSS 5개를 주입했다.
// 헤더의 layout.viewport 는 '1440x900' 이다. 시안 프레임이 1920이라 style.md 일반 규칙(루트 폭 = 1280·375일 때만)이면 null 이지만,
// 실측을 1440에서 했으므로 매니페스트에 viewport '1440x900' 을 준 경우로 재현한다. 그래서 헤더 root 는 폭을 빼고 ['h'] 만 비교한다.
// figmaId 는 실측 스크립트에 남아 있지 않아 null 이다(스크립트는 figmaId 를 쓰지 않는다).
const fixture = (name) => join(FIXTURES, name);
const fixtureDoc = (actualName) => {
  const r = cli('--design', fixture('design.json'), '--actual', fixture(actualName));
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};

test('fixture: data follows the layout contract (root at origin with selector "", one actual per target at the layout viewport)', () => {
  const design = JSON.parse(readFileSync(fixture('design.json'), 'utf8'));
  assert.deepEqual(design.map((d) => [d.target, d.layout.viewport]), [['sheet', '375x812'], ['tabbar', '375x812'], ['header', '1440x900'], ['fab', '375x812']]);
  for (const d of design) assert.deepEqual([d.layout.nodes.root.selector, d.layout.nodes.root.box.slice(0, 2)], ['', [0, 0]], d.target);
  assert.deepEqual(design.find((d) => d.target === 'header').layout.nodes.root.compare, ['h']);
  for (const name of ['actual-normal.json', 'actual-defects.json']) {
    const actual = JSON.parse(readFileSync(fixture(name), 'utf8'));
    assert.deepEqual(actual.map((a) => [a.target, a.viewport, a.count, a.boxes.root.slice(0, 2)]), design.map((d) => [d.target, d.layout.viewport, 1, [0, 0]]), name);
  }
});

test('fixture: the implementation as built has no layout finding at ±1px (PASS)', () => {
  const doc = fixtureDoc('actual-normal.json');
  assert.deepEqual([doc.findings, doc.blocked, doc.notChecked], [[], [], []]);
  assert.equal(verdictOf(tmp(), doc), 'PASS');
});

test('fixture: all 5 injected defects are caught, plus the 4 sizes they shift (9 Minor findings, PASS WITH MINOR)', () => {
  const doc = fixtureDoc('actual-defects.json');
  assert.deepEqual([doc.blocked, doc.notChecked], [[], []]);
  const byId = Object.fromEntries(doc.findings.map((f) => [f.id, f]));
  const injected = [
    ['L-sheet-actions.gap-y(b1↔b2)-375x812', '8px', '12px'], // 시트 버튼 간격 8 → 12
    ['L-sheet-b2.h-375x812', '48px', '44px'], // 전화 버튼 높이 48 → 44
    ['L-tabbar-root.start-x(item1)-375x812', '12px', '14px'], // 탭바 왼쪽 여백 12 → 14
    ['L-header-left.gap-x(logo↔nav)-1440x900', '40px', '36px'], // 헤더 logo↔nav 간격 40 → 36
    ['L-fab-root.gap-y(top↔kakao)-375x812', '8px', '10px'], // FAB 간격 8 → 10
  ];
  for (const [id, expected, actual] of injected) {
    assert.ok(byId[id], `${id} missing; got ${Object.keys(byId).join(', ')}`);
    assert.deepEqual([byId[id].expected, byId[id].actual], [expected, actual], id);
  }
  const derived = ['L-sheet-actions.gap-y(b2↔b3)-375x812', 'L-sheet-root.h-375x812', 'L-sheet-actions.h-375x812', 'L-fab-root.h-375x812'];
  assert.deepEqual(Object.keys(byId).sort(), [...injected.map(([id]) => id), ...derived].sort());
  assert.ok(doc.findings.every((f) => f.severity === 'Minor' && f.status === 'open' && f.note === '허용 오차 ±1px'));
  assert.equal(verdictOf(tmp(), doc), 'PASS WITH MINOR');
});
