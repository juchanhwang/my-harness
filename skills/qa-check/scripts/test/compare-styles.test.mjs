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
const VERDICT = join(HERE, '..', 'verdict.mjs');

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
  assert.equal(normalizeColor('color(rec2020 1 0 0)'), null);
});
test('normalizeColor: alpha difference is not equal, garbage is null', () => {
  assert.notDeepEqual(normalizeColor('rgba(0, 0, 0, 0.5)'), normalizeColor('rgb(0, 0, 0)'));
  assert.deepEqual(normalizeColor('#00000080'), { hex: '#000000', alpha: 0.5 });
  assert.equal(normalizeColor('rgb(1, 2)'), null);
  assert.equal(normalizeColor('#12'), null);
  assert.equal(normalizeColor(''), null);
  assert.equal(normalizeColor(undefined), null);
});
// ---- CSS Color 4: oklch() · oklab() · color(srgb|display-p3) → 8-bit sRGB ----
// 정방향(sRGB → OKLCH)은 구현과 독립으로 Ottosson 원 글의 행렬을 따로 써서 왕복을 검증한다.
const srgbToLinear = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
function hexToOklch(hex, digits = 12) {
  const [r, g, b] = [1, 3, 5].map((i) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const h = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return `oklch(${L.toFixed(digits)} ${Math.hypot(a, bb).toFixed(digits)} ${h.toFixed(digits)})`;
}

test('normalizeColor: oklch known values', () => {
  assert.deepEqual(normalizeColor('oklch(0.628 0.2577 29.23)'), { hex: '#FF0000', alpha: 1 });
  assert.deepEqual(normalizeColor('oklch(1 0 0)'), { hex: '#FFFFFF', alpha: 1 });
  assert.deepEqual(normalizeColor('oklch(0 0 0)'), { hex: '#000000', alpha: 1 });
});
test('normalizeColor: oklch alpha, percentages, hue units, none, case', () => {
  const base = normalizeColor('oklch(0.5 0.1 270)');
  assert.equal(base.alpha, 1);
  assert.deepEqual(normalizeColor('oklch(0.5 0.1 270 / 0.5)'), { hex: base.hex, alpha: 0.5 });
  assert.deepEqual(normalizeColor('oklch(0.5 0.1 270/50%)'), { hex: base.hex, alpha: 0.5 });
  assert.deepEqual(normalizeColor('oklch(50% 25% 270)'), base);
  for (const hue of ['270deg', '300grad', '0.75turn', `${(3 * Math.PI) / 2}rad`]) assert.deepEqual(normalizeColor(`oklch(0.5 0.1 ${hue})`), base, hue);
  assert.deepEqual(normalizeColor('OKLCH( 0.5   0.1  270 )'), base);
  const gray = normalizeColor('oklch(0.7 0 none)');
  assert.deepEqual(gray, normalizeColor('oklch(0.7 0 0)'));
  assert.match(gray.hex, /^#([0-9A-F]{2})\1\1$/);
  assert.deepEqual(normalizeColor('oklch(none none none)'), { hex: '#000000', alpha: 1 });
  assert.equal(normalizeColor('oklch(1 0 0 / none)').alpha, 0);
});
test('normalizeColor: oklab, color(srgb) and in-gamut display-p3', () => {
  assert.deepEqual(normalizeColor('oklab(0.628 0.22486 0.12585)'), { hex: '#FF0000', alpha: 1 });
  assert.deepEqual(normalizeColor('oklab(100% 0 0)'), { hex: '#FFFFFF', alpha: 1 });
  assert.deepEqual(normalizeColor('color(srgb 1 0 0)'), { hex: '#FF0000', alpha: 1 });
  assert.deepEqual(normalizeColor('color(srgb 100% 0% 0%)'), { hex: '#FF0000', alpha: 1 });
  assert.deepEqual(normalizeColor('color(srgb 1 0 0 / 50%)'), { hex: '#FF0000', alpha: 0.5 });
  assert.deepEqual(normalizeColor('color(srgb 0.5 0.5 0.5)'), { hex: '#808080', alpha: 1 });
  assert.deepEqual(normalizeColor('color(display-p3 1 1 1)'), { hex: '#FFFFFF', alpha: 1 });
  assert.deepEqual(normalizeColor('color(display-p3 0 0 0)'), { hex: '#000000', alpha: 1 });
});
test('normalizeColor: outside sRGB has no hex; half an 8-bit step is still inside', () => {
  const p3 = normalizeColor('color(display-p3 1 0 0)');
  assert.deepEqual([p3.hex, p3.outOfGamut, p3.alpha], [null, true, 1]);
  assert.ok(p3.srgb[0] > 255 && p3.srgb[1] < 0, `unclamped sRGB kept: ${p3.srgb}`);
  assert.equal(normalizeColor('color(srgb 1.2 0 0)').hex, null);
  assert.equal(normalizeColor('color(srgb 1.003 0 0)').hex, null);
  assert.deepEqual(normalizeColor('color(srgb 1.001 -0.001 0)'), { hex: '#FF0000', alpha: 1 });
  assert.equal(normalizeColor('oklch(0.9 0.4 150)').hex, null);
});
test('normalizeColor: malformed or unsupported wide-gamut notations are null', () => {
  for (const bad of ['oklch(0.5 0.1)', 'oklch(0.5, 0.1, 270)', 'oklch(abc 0 0)', 'oklch(0.5 0.1 270 / )', 'oklch(0.5 0.1 270 / 0.5 0.5)',
    'oklch(0.5 0.1 270deg 5)', 'oklch(0.5 0.1 50%)', 'oklch(0.5 0.1 270 / 0.5 / 1)', 'oklch(from red l c h)', 'oklab(0.5 0.1)',
    'color(srgb 1 0)', 'color(srgb)', 'color()', 'color(rec2020 1 0 0)', 'color(xyz 0.1 0.2 0.3)', 'color(srgb 1 0 0deg)', 'oklch(1e999 0 0)'])
    assert.equal(normalizeColor(bad), null, bad);
});
test('normalizeColor: oklch round trip from sRGB is exact for every 8-bit value tried', () => {
  assert.equal(normalizeColor(hexToOklch('#6750A4')).hex, '#6750A4');
  const levels = [0, 1, 17, 51, 102, 127, 128, 200, 254, 255];
  for (const r of levels) for (const g of levels) for (const b of levels) {
    const hex = `#${[r, g, b].map((v) => v.toString(16).toUpperCase().padStart(2, '0')).join('')}`;
    assert.equal(normalizeColor(hexToOklch(hex)).hex, hex, `${hex} via ${hexToOklch(hex)}`);
  }
});
test('oklch actual equals the same color written as hex in the design', () => {
  const r = compareTarget({ ...design, props: { 'background-color': '#6750A4', color: '#FFFFFF' } },
    actual({ 'background-color': hexToOklch('#6750A4'), color: 'oklch(1 0 0)' }));
  assert.deepEqual([r.findings, r.notChecked, r.blocked], [[], [], []]);
});
test('display-p3 red vs #FF0000 is a Major finding that shows the original text and notes the gamut', () => {
  const [f, ...rest] = compareTarget({ ...design, props: { color: '#FF0000' } }, actual({ color: 'color(display-p3 1 0 0)' })).findings;
  assert.equal(rest.length, 0);
  assert.deepEqual([f.severity, f.expected, f.actual, f.property], ['Major', '#FF0000', 'color(display-p3 1 0 0)', 'color']);
  assert.match(f.note, /sRGB 범위 밖/);
});
test('the same out-of-sRGB color on both sides matches, a different one does not', () => {
  const run = (d, a) => compareTarget({ ...design, props: { color: d } }, actual({ color: a })).findings;
  assert.deepEqual(run('color(display-p3 1 0 0)', 'color(display-p3 1 0 0)'), []);
  assert.equal(run('color(display-p3 1 0 0)', 'color(display-p3 0.9 0 0)').length, 1);
  assert.equal(run('color(display-p3 1 0 0)', '#FF0000')[0].note, 'sRGB 범위 밖');
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
test('fully transparent colors are equal whatever their RGB', () => {
  const findings = (d, a) => compareTarget({ ...design, props: { color: d } }, actual({ color: a })).findings;
  assert.deepEqual(findings('#FFFFFF00', 'rgba(0, 0, 0, 0)'), []);
  assert.deepEqual(findings('transparent', '#00000000'), []);
  assert.deepEqual(findings('rgba(12, 34, 56, 0)', 'transparent'), []);
  assert.equal(findings('#FFFFFF00', 'rgba(255,255,255,0.5)').length, 1);
  assert.equal(findings('transparent', 'rgb(0, 0, 0)').length, 1);
});
test('selector with 0 matches is blocked', () => { const r = compareTarget(design, { ...actual(ok), count: 0, samples: [] }); assert.match(r.blocked[0], /\.btn/); assert.equal(r.findings.length, 0); });
test('multiple matches are indexed', () => assert.deepEqual(
  compareTarget({ ...design, props: { color: '#FFFFFF' } }, actual({ color: 'rgb(0, 0, 0)' }, 2)).findings.map(f => f.where), ['.btn[0]', '.btn[1]']));
test('viewport label appears in where', () => assert.equal(
  compareTarget({ ...design, props: { color: '#FFFFFF' } }, actual({ color: 'rgb(0, 0, 0)' }, 1, '375')).findings[0].where, '.btn @375'));
test('unparseable actual blocks and names the target, the property and the original value', () => {
  const r = compareTarget({ ...design, props: { color: '#FFFFFF' } }, actual({ color: 'color(rec2020 1 1 1)' }));
  assert.deepEqual([r.findings, r.notChecked], [[], []]);
  assert.equal(r.blocked.length, 1);
  for (const part of ['btn', '.btn', 'color', 'color(rec2020 1 1 1)', 'unparseable actual value']) assert.ok(r.blocked[0].includes(part), `${part} in: ${r.blocked[0]}`);
});
test('unparseable design value blocks once per target, props missing from design are skipped', () => {
  const r = compareTarget({ ...design, props: { color: 'papayawhip' } }, actual(ok, 2));
  assert.deepEqual([r.findings, r.notChecked], [[], []]);
  assert.equal(r.blocked.length, 1);
  for (const part of ['btn', 'color', 'papayawhip', 'unparseable design value']) assert.ok(r.blocked[0].includes(part), `${part} in: ${r.blocked[0]}`);
});
test('line-height percent is converted to px with the design font-size; AUTO is normal', () => {
  const lh = (d, a) => compareTarget({ ...design, props: { 'font-size': 16, 'line-height': d } }, actual({ 'font-size': '16px', 'line-height': a }));
  assert.deepEqual(lh('150%', '24px').findings, []);
  const [f, ...rest] = lh('150%', '20px').findings;
  assert.equal(rest.length, 0);
  assert.deepEqual([f.property, f.severity, f.expected, f.actual], ['line-height', 'Major', '24px', '20px']);
  assert.deepEqual(lh('125.5%', '20.08px').findings, []);
  assert.deepEqual(lh('AUTO', 'normal').findings, []);
  assert.deepEqual(lh('auto', 'normal').findings, []);
  const [g] = lh('AUTO', '24px').findings;
  assert.deepEqual([g.severity, g.expected, g.actual], ['Major', 'normal', '24px']);
});
test('line-height percent uses the design font-size even when the implementation font-size differs', () => {
  const r = compareTarget({ ...design, props: { 'font-size': 16, 'line-height': '150%' } }, actual({ 'font-size': '20px', 'line-height': '30px' }));
  assert.deepEqual(r.findings.map((f) => [f.property, f.expected, f.actual]), [['font-size', '16px', '20px'], ['line-height', '24px', '30px']]);
});
test('line-height percent without a design font-size is resolved with the implementation font-size', () => {
  const run = (a) => compareTarget({ ...design, props: { 'line-height': '150%' } }, actual(a));
  assert.deepEqual(run({ 'font-size': '16px', 'line-height': '24px' }).findings, []);
  assert.deepEqual(run({ 'font-size': '20px', 'line-height': '30px' }).findings, []);
  const [f] = run({ 'font-size': '20px', 'line-height': '24px' }).findings;
  assert.deepEqual([f.expected, f.actual], ['30px', '24px']);
});
test('line-height percent on the implementation side is resolved with its own font-size', () => {
  const r = compareTarget({ ...design, props: { 'line-height': 24 } }, actual({ 'font-size': '16px', 'line-height': '150%' }));
  assert.deepEqual([r.findings, r.notChecked, r.blocked], [[], [], []]);
});
test('percent is allowed for letter-spacing and line-height only', () => {
  const ls = compareTarget({ ...design, props: { 'font-size': 16, 'letter-spacing': '0.5%' } }, actual({ 'font-size': '16px', 'letter-spacing': '0.08px' }));
  assert.deepEqual([ls.findings, ls.notChecked], [[], []]);
  const pad = compareTarget({ ...design, props: { 'padding-left': 24 } }, actual({ 'padding-left': '50%' }));
  assert.deepEqual([pad.findings.length, pad.notChecked.length, pad.blocked.length], [0, 0, 1]);
  assert.ok(pad.blocked[0].includes('padding-left') && pad.blocked[0].includes('50%'), pad.blocked[0]);
});
test('actual property missing blocks, it is not a pass', () => {
  const { color: _drop, ...partial } = ok;
  const r = compareTarget({ ...design, props: { color: '#FFFFFF' } }, actual(partial));
  assert.deepEqual([r.findings, r.notChecked], [[], []]);
  assert.equal(r.blocked.length, 1);
  for (const part of ['btn', '.btn', 'color', 'actual value missing']) assert.ok(r.blocked[0].includes(part), `${part} in: ${r.blocked[0]}`);
  const empty = compareTarget({ ...design, props: { color: '#FFFFFF' } }, actual({ color: '' }));
  assert.equal(empty.blocked.length, 1);
});
test('every unchecked sample is blocked separately, and a requested prop that is fine still compares', () => {
  const r = compareTarget({ ...design, props: { color: '#FFFFFF', 'padding-left': 24 } }, actual({ 'padding-left': '20px' }, 2, '375'));
  assert.deepEqual(r.findings.map((f) => f.where), ['.btn[0] @375', '.btn[1] @375']);
  assert.deepEqual(r.blocked.map((b) => b.split(' color:')[0]), ['.btn[0] @375', '.btn[1] @375']);
});
test('line-height percent with no font-size on either side blocks', () => {
  const r = compareTarget({ ...design, props: { 'line-height': '150%' } }, actual({ 'line-height': '24px' }));
  assert.deepEqual([r.findings, r.notChecked], [[], []]);
  assert.equal(r.blocked.length, 1);
  for (const part of ['btn', 'line-height', '150%', 'font-size']) assert.ok(r.blocked[0].includes(part), `${part} in: ${r.blocked[0]}`);
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
test('CLI e2e: oklch colors plus a wrong % line-height give FAIL with the line-height finding only (reviewer repro)', () => {
  const dir = tmp();
  const d = write(dir, 'design.json', [{ target: 'btn', source: 'test', props: { 'background-color': '#6750A4', color: '#FFF', 'line-height': '150%', 'font-size': 16 } }]);
  const a = write(dir, 'actual.json', [actual({ 'background-color': hexToOklch('#6750A4'), color: 'oklch(1 0 0)', 'line-height': '20px', 'font-size': '16px' })]);
  const compared = cli('--design', d, '--actual', a);
  assert.equal(compared.status, 0, compared.stderr);
  const doc = JSON.parse(compared.stdout);
  assert.deepEqual(doc.findings.map((f) => f.property), ['line-height']);
  assert.deepEqual([doc.blocked, doc.notChecked], [[], []]);
  const verdict = spawnSync('node', [VERDICT, write(dir, 'findings.json', doc)], { encoding: 'utf8' });
  assert.equal(verdict.stdout.trim(), 'FAIL');
  const right = write(dir, 'actual-ok.json', [actual({ 'background-color': hexToOklch('#6750A4'), color: 'oklch(1 0 0)', 'line-height': '24px', 'font-size': '16px' })]);
  const ok = JSON.parse(cli('--design', d, '--actual', right).stdout);
  assert.equal(spawnSync('node', [VERDICT, write(dir, 'findings-ok.json', ok)], { encoding: 'utf8' }).stdout.trim(), 'PASS');
});
test('CLI: an unusable value makes the verdict BLOCKED even next to a real finding, and the design-side message is not repeated per viewport', () => {
  const dir = tmp();
  const d = write(dir, 'design.json', [{ ...design, props: { color: '#FFFFFF', 'background-color': 'papayawhip', 'padding-left': 24 } }]);
  const a = write(dir, 'actual.json', [actual({ color: 'rgb(0, 0, 0)', 'background-color': 'rgb(1, 2, 3)', 'padding-left': '24px' }, 1, '1280'),
    actual({ color: 'rgb(0, 0, 0)', 'background-color': 'rgb(1, 2, 3)', 'padding-left': '24px' }, 1, '375')]);
  const doc = JSON.parse(cli('--design', d, '--actual', a).stdout);
  assert.deepEqual(doc.findings.map((f) => f.property), ['color', 'color']);
  assert.equal(doc.blocked.length, 1, doc.blocked.join(' | '));
  assert.match(doc.blocked[0], /background-color.*papayawhip/);
  assert.deepEqual(doc.notChecked, []);
  assert.equal(spawnSync('node', [VERDICT, write(dir, 'findings.json', doc)], { encoding: 'utf8' }).stdout.trim(), 'BLOCKED');
});
