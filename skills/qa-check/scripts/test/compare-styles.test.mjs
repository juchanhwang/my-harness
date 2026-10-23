import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROPS, SEVERITY_BY_PROP, applyWaivers, compareTarget,
  normalizeColor, normalizeFontFamily, normalizeFontWeight, normalizeLength,
} from '../compare-styles.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', 'compare-styles.mjs');
const SNIPPET = join(HERE, '..', 'computed-style.snippet.js');

const design = { target: 'btn', source: 'test', props: {
  'background-color': '#6750A4', color: '#FFFFFF', 'font-family': 'Roboto', 'font-size': 16, 'font-weight': 'Medium',
  'line-height': 24, 'letter-spacing': 0.15000000596046448, 'padding-left': 24, 'padding-right': 24, 'border-top-left-radius': 16 } };
const ok = { 'background-color': 'rgb(103, 80, 164)', color: 'rgb(255, 255, 255)', 'font-family': '"Roboto", sans-serif',
  'font-size': '16px', 'font-weight': '500', 'line-height': '24px', 'letter-spacing': '0.15px',
  'padding-left': '24px', 'padding-right': '24px', 'border-top-left-radius': '16px' };
const actual = (props, count = 1, viewport) => ({ target: 'btn', selector: '.btn', viewport, count, rootFontSize: 16,
  samples: Array.from({ length: count }, (_, index) => ({ index, props })) });

test('PROPS has 21 entries', () => assert.equal(PROPS.length, 21));
test('SEVERITY_BY_PROP: color and typography Major, spacing and radius Minor', () => {
  assert.deepEqual(Object.keys(SEVERITY_BY_PROP), [...PROPS]);
  assert.deepEqual(PROPS.filter((p) => SEVERITY_BY_PROP[p] === 'Major'), PROPS.slice(0, 11));
  assert.deepEqual(PROPS.filter((p) => SEVERITY_BY_PROP[p] === 'Minor'), PROPS.slice(11));
});
test('normalizeColor: formats', () => {
  assert.deepEqual(normalizeColor('rgb(103, 80, 164)'), { hex: '#6750A4', alpha: 1 });
  assert.deepEqual(normalizeColor('#6750a4'), { hex: '#6750A4', alpha: 1 });
  assert.deepEqual(normalizeColor('#6750A4FF'), { hex: '#6750A4', alpha: 1 });
  assert.deepEqual(normalizeColor('#fff'), { hex: '#FFFFFF', alpha: 1 });
  assert.deepEqual(normalizeColor('rgba(0, 0, 0, 0.5)'), { hex: '#000000', alpha: 0.5 });
  assert.deepEqual(normalizeColor('rgb(0 0 0 / 50%)'), { hex: '#000000', alpha: 0.5 });
  assert.deepEqual(normalizeColor('transparent'), { hex: '#000000', alpha: 0 });
  assert.equal(normalizeColor('color(display-p3 1 0 0)'), null);
});
test('normalizeColor: alpha difference is not equal, garbage is null', () => {
  assert.notDeepEqual(normalizeColor('rgba(0, 0, 0, 0.5)'), normalizeColor('rgb(0, 0, 0)'));
  assert.deepEqual(normalizeColor('#00000080'), { hex: '#000000', alpha: 0.5 });
  assert.equal(normalizeColor('rgb(1, 2)'), null);
  assert.equal(normalizeColor('#12'), null);
  assert.equal(normalizeColor(''), null);
  assert.equal(normalizeColor(undefined), null);
});
test('normalizeLength: units and float noise', () => {
  const ctx = { rootFontSize: 16, fontSize: 16 };
  assert.equal(normalizeLength('16px', ctx), 16);
  assert.equal(normalizeLength('1rem', ctx), 16);
  assert.equal(normalizeLength(0.15000000596046448, ctx), 0.15);
  assert.equal(normalizeLength('0.15px', ctx), 0.15);
  assert.equal(normalizeLength('0.5%', ctx), 0.08);
  assert.equal(normalizeLength('normal', ctx), 'normal');
  assert.equal(normalizeLength('1em', { rootFontSize: 16 }), null);
});
test('normalizeLength: em, bare numbers, zero and unsupported units', () => {
  const ctx = { rootFontSize: 16, fontSize: 20 };
  assert.equal(normalizeLength('1.5em', ctx), 30);
  assert.equal(normalizeLength('24', ctx), 24);
  assert.equal(normalizeLength('-0.001px', ctx), 0);
  assert.ok(Object.is(normalizeLength('-0.001px', ctx), 0));
  assert.equal(normalizeLength('10pt', ctx), null);
  assert.equal(normalizeLength('calc(1px + 1px)', ctx), null);
  assert.equal(normalizeLength('', ctx), null);
  assert.equal(normalizeLength(undefined, ctx), null);
});
test('normalizeFontFamily', () => {
  assert.equal(normalizeFontFamily('"Roboto", sans-serif'), 'roboto');
  assert.equal(normalizeFontFamily("'Noto Sans KR', sans-serif"), 'noto sans kr');
  assert.equal(normalizeFontFamily('Roboto'), 'roboto');
  assert.equal(normalizeFontFamily(''), null);
});
test('normalizeFontWeight', () => {
  assert.equal(normalizeFontWeight('Medium'), 500); assert.equal(normalizeFontWeight('Semi Bold'), 600);
  assert.equal(normalizeFontWeight('600'), 600); assert.equal(normalizeFontWeight('ExtraBold'), 800);
  assert.equal(normalizeFontWeight('Fancy'), null);
  assert.equal(normalizeFontWeight(500), 500);
  assert.equal(normalizeFontWeight('constructor'), null);
});
test('exact match yields no findings', () => { const r = compareTarget(design, actual(ok)); assert.deepEqual([r.findings, r.blocked], [[], []]); });
test('deviations get group severity', () => {
  const bad = { ...ok, 'background-color': 'rgb(103, 80, 160)', 'font-weight': '600', 'line-height': '22px', 'padding-left': '20px', 'border-top-left-radius': '18px' };
  assert.deepEqual(compareTarget(design, actual(bad)).findings.map(f => [f.property, f.severity, f.status]).sort(), [
    ['background-color', 'Major', 'open'], ['border-top-left-radius', 'Minor', 'open'], ['font-weight', 'Major', 'open'],
    ['line-height', 'Major', 'open'], ['padding-left', 'Minor', 'open']]);
});
test('finding carries id, where, expected and actual', () => {
  const [f] = compareTarget({ ...design, props: { 'line-height': 24 } }, actual({ 'line-height': '22px' }, 1, '375')).findings;
  assert.deepEqual(
    { id: f.id, where: f.where, expected: f.expected, actual: f.actual, target: f.target, selector: f.selector, index: f.index, viewport: f.viewport, property: f.property },
    { id: 'S-btn-line-height-0-375', where: '.btn @375', expected: '24px', actual: '22px', target: 'btn', selector: '.btn', index: 0, viewport: '375', property: 'line-height' });
});
test('letter-spacing normal equals 0', () => assert.equal(compareTarget({ ...design, props: { 'letter-spacing': 0 } }, actual({ 'letter-spacing': 'normal' })).findings.length, 0));
test('line-height normal vs 24 is Major', () => assert.equal(compareTarget({ ...design, props: { 'line-height': 24 } }, actual({ 'line-height': 'normal' })).findings[0].severity, 'Major'));
test('equivalent notations are not findings', () => {
  const r = compareTarget(
    { ...design, props: { 'background-color': '#6750a4', 'font-size': '1rem', 'font-weight': 500, 'font-family': 'Roboto, sans-serif' } },
    actual({ 'background-color': 'rgb(103 80 164 / 100%)', 'font-size': '16px', 'font-weight': '500', 'font-family': 'Roboto' }));
  assert.deepEqual([r.findings, r.notChecked, r.blocked], [[], [], []]);
});
test('color alpha difference is a finding', () => assert.equal(
  compareTarget({ ...design, props: { color: '#FFFFFF' } }, actual({ color: 'rgba(255, 255, 255, 0.9)' })).findings[0].severity, 'Major'));
test('selector with 0 matches is blocked', () => { const r = compareTarget(design, { ...actual(ok), count: 0, samples: [] }); assert.match(r.blocked[0], /\.btn/); assert.equal(r.findings.length, 0); });
test('multiple matches are indexed', () => assert.deepEqual(
  compareTarget({ ...design, props: { color: '#FFFFFF' } }, actual({ color: 'rgb(0, 0, 0)' }, 2)).findings.map(f => f.where), ['.btn[0]', '.btn[1]']));
test('viewport label appears in where', () => assert.equal(
  compareTarget({ ...design, props: { color: '#FFFFFF' } }, actual({ color: 'rgb(0, 0, 0)' }, 1, '375')).findings[0].where, '.btn @375'));
test('unparseable actual goes to notChecked', () => {
  const r = compareTarget({ ...design, props: { color: '#FFFFFF' } }, actual({ color: 'color(display-p3 1 1 1)' }));
  assert.equal(r.findings.length, 0); assert.equal(r.notChecked[0].reason, 'unparseable actual value');
});
test('unparseable design value goes to notChecked once, props missing from design are skipped', () => {
  const r = compareTarget({ ...design, props: { color: 'papayawhip' } }, actual(ok, 2));
  assert.equal(r.findings.length, 0);
  assert.deepEqual(r.notChecked.map((n) => n.reason), ['unparseable design value']);
});
test('percent is allowed for letter-spacing only', () => {
  const ls = compareTarget({ ...design, props: { 'font-size': 16, 'letter-spacing': '0.5%' } }, actual({ 'font-size': '16px', 'letter-spacing': '0.08px' }));
  assert.deepEqual([ls.findings, ls.notChecked], [[], []]);
  const pad = compareTarget({ ...design, props: { 'padding-left': 24 } }, actual({ 'padding-left': '50%' }));
  assert.deepEqual([pad.findings.length, pad.notChecked[0].reason], [0, 'unparseable actual value']);
});
test('actual property missing is not checked, not a pass', () => {
  const { color: _drop, ...partial } = ok;
  const r = compareTarget({ ...design, props: { color: '#FFFFFF' } }, actual(partial));
  assert.deepEqual([r.findings.length, r.notChecked[0].reason], [0, 'actual value missing']);
});
test('applyWaivers: exact match waives, stale match notes', () => {
  const [f] = compareTarget({ ...design, props: { 'background-color': '#6750A4' } }, actual({ 'background-color': 'rgb(103, 80, 160)' })).findings;
  const w = { selector: '.btn', property: 'background-color', figma: '#6750A4', actual: 'rgb(103, 80, 160)', reason: '브랜드 컬러 변경', by: 'designer', date: '2026-10-24' };
  assert.equal(applyWaivers([f], [w])[0].status, 'waived');
  const stale = applyWaivers([f], [{ ...w, actual: 'rgb(103, 80, 161)' }])[0];
  assert.deepEqual([stale.status, stale.note], ['open', 'waiver 갱신 필요']);
});
test('applyWaivers: waived finding keeps severity and records the waiver, input is not mutated', () => {
  const [f] = compareTarget({ ...design, props: { 'background-color': '#6750A4' } }, actual({ 'background-color': 'rgb(103, 80, 160)' })).findings;
  const w = { selector: '.btn', property: 'background-color', figma: '#6750a4', actual: '#6750A0', reason: '브랜드 컬러 변경', by: 'designer', date: '2026-10-24' };
  const [out] = applyWaivers([f], [w]);
  assert.deepEqual([out.severity, out.waiver], ['Major', { reason: '브랜드 컬러 변경', by: 'designer', date: '2026-10-24' }]);
  assert.equal(f.status, 'open');
  assert.equal(applyWaivers([f], [{ ...w, selector: '.other' }])[0].status, 'open');
  assert.equal(applyWaivers([f], [{ ...w, selector: '.other' }])[0].note, undefined);
});
test('snippet becomes a function and covers PROPS', () => {
  const src = readFileSync(SNIPPET, 'utf8');
  assert.equal(typeof new Function(`return (${src.replace('__SELECTOR_JSON__', JSON.stringify('.btn'))});`)(), 'function');
  for (const p of PROPS) assert.ok(src.includes(`'${p}'`), p);
});
test('snippet runs against a stub DOM and returns the contract shape', () => {
  const src = readFileSync(SNIPPET, 'utf8');
  const fn = new Function('document', 'getComputedStyle', `return (${src.replace('__SELECTOR_JSON__', JSON.stringify('.btn'))});`);
  const els = [{}, {}];
  const document = { documentElement: {}, querySelectorAll: (s) => (s === '.btn' ? els : []) };
  const getComputedStyle = (el) => ({ fontSize: '16px', getPropertyValue: (p) => (el === document.documentElement ? '' : `v:${p}`) });
  const out = fn(document, getComputedStyle)();
  assert.deepEqual([out.selector, out.count, out.rootFontSize, out.samples.length], ['.btn', 2, 16, 2]);
  assert.deepEqual(out.samples[1].index, 1);
  assert.deepEqual(Object.keys(out.samples[0].props), [...PROPS]);
});

const tmp = () => mkdtempSync(join(tmpdir(), 'compare-styles-'));
const write = (dir, name, data) => { const p = join(dir, name); writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data)); return p; };
const cli = (...args) => spawnSync('node', [CLI, ...args], { encoding: 'utf8' });

test('CLI prints FindingsDoc', () => {
  const dir = tmp();
  const d = write(dir, 'design.json', [{ ...design, props: { color: '#FFFFFF' } }]);
  const a = write(dir, 'actual.json', [actual({ color: 'rgb(0, 0, 0)' })]);
  const r = cli('--design', d, '--actual', a);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.role, 'style');
  assert.equal(out.findings.length, 1);
  assert.deepEqual([out.blocked, out.notChecked], [[], []]);
});
test('CLI applies --waivers', () => {
  const dir = tmp();
  const d = write(dir, 'design.json', [{ ...design, props: { color: '#FFFFFF' } }]);
  const a = write(dir, 'actual.json', [actual({ color: 'rgb(0, 0, 0)' })]);
  const w = write(dir, 'waivers.json', [{ selector: '.btn', property: 'color', figma: '#FFFFFF', actual: 'rgb(0, 0, 0)', reason: 'r', by: 'designer', date: '2026-10-24' }]);
  const out = JSON.parse(cli('--design', d, '--actual', a, '--waivers', w).stdout);
  assert.deepEqual(out.findings.map((f) => f.status), ['waived']);
});
test('CLI pairs by target: missing actual blocks, extra actual is not checked, viewports compare separately', () => {
  const dir = tmp();
  const d = write(dir, 'design.json', [{ ...design, props: { color: '#FFFFFF' } }, { target: 'card', source: 't', props: { color: '#000000' } }]);
  const a = write(dir, 'actual.json', [
    actual({ color: 'rgb(255, 255, 255)' }, 1, '1280'), actual({ color: 'rgb(0, 0, 0)' }, 1, '375'),
    { ...actual({ color: 'rgb(0, 0, 0)' }), target: 'orphan', selector: '.orphan' }]);
  const out = JSON.parse(cli('--design', d, '--actual', a).stdout);
  assert.deepEqual(out.findings.map((f) => f.where), ['.btn @375']);
  assert.match(out.blocked[0], /card/);
  assert.deepEqual(out.notChecked.map((n) => [n.what, n.reason]), [['orphan', 'no design target']]);
});
test('CLI rejects invalid input with exit 2', () => {
  const dir = tmp();
  const good = write(dir, 'ok.json', []);
  const broken = write(dir, 'broken.json', '{ nope');
  assert.equal(cli().status, 2);
  assert.equal(cli('--design', good).status, 2);
  assert.equal(cli('--design', broken, '--actual', good).status, 2);
  assert.equal(cli('--design', good, '--actual', join(dir, 'missing.json')).status, 2);
  assert.equal(cli('--design', good, '--actual', good, '--waivers', broken).status, 2);
  assert.equal(cli('--design', good, '--actual', good, '--bogus', 'x').status, 2);
  const notArray = write(dir, 'object.json', {});
  assert.equal(cli('--design', notArray, '--actual', good).status, 2);
});
