#!/usr/bin/env node
// 디자인 값 ↔ 구현 computed style 정규화·비교·waiver (spec D6, D24). 허용 오차 0.
//   node compare-styles.mjs --design <DesignTarget[] 파일> --actual <ActualTarget[] 파일> [--waivers <Waiver[] 파일>]
//   → stdout FindingsDoc(role:'style'), target 필드로 짝짓는다. 입력 오류 → stderr, exit 2
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const COLOR_PROPS = ['background-color', 'color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'];
const TYPO_PROPS = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing'];
const SPACING_PROPS = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'row-gap', 'column-gap'];
const RADIUS_PROPS = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'];

export const PROPS = Object.freeze([...COLOR_PROPS, ...TYPO_PROPS, ...SPACING_PROPS, ...RADIUS_PROPS]);
export const SEVERITY_BY_PROP = Object.freeze(Object.fromEntries([
  ...COLOR_PROPS.map((p) => [p, 'Major']),
  ...TYPO_PROPS.map((p) => [p, 'Major']),
  ...SPACING_PROPS.map((p) => [p, 'Minor']),
  ...RADIUS_PROPS.map((p) => [p, 'Minor']),
]));

// 소수 둘째 자리 반올림은 부동소수 표현(0.15000000596046448 등)을 정규화할 뿐 허용 오차가 아니다. -0은 0으로.
const round2 = (x) => Math.round(x * 100) / 100 + 0;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// ---- 색상 ----
const hex2 = (n) => clamp(Math.round(n), 0, 255).toString(16).toUpperCase().padStart(2, '0');
const CH = '([+-]?(?:\\d+\\.?\\d*|\\.\\d+)%?)';
const RGB_COMMA = new RegExp(`^rgba?\\(\\s*${CH}\\s*,\\s*${CH}\\s*,\\s*${CH}\\s*(?:,\\s*${CH}\\s*)?\\)$`);
const RGB_SPACE = new RegExp(`^rgba?\\(\\s*${CH}\\s+${CH}\\s+${CH}\\s*(?:\\/\\s*${CH}\\s*)?\\)$`);
const channel = (s) => (s.endsWith('%') ? (parseFloat(s) * 255) / 100 : parseFloat(s));
const alphaOf = (s) => clamp(s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s), 0, 1);

export function normalizeColor(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (s === 'transparent') return { hex: '#000000', alpha: 0 };
  const h = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (h) {
    let d = h[1];
    if (d.length <= 4) d = [...d].map((c) => c + c).join('');
    const alpha = d.length === 8 ? parseInt(d.slice(6, 8), 16) / 255 : 1;
    return { hex: `#${d.slice(0, 6).toUpperCase()}`, alpha: round2(alpha) };
  }
  const m = RGB_COMMA.exec(s) ?? RGB_SPACE.exec(s);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map(channel);
    return { hex: `#${hex2(r)}${hex2(g)}${hex2(b)}`, alpha: round2(m[4] === undefined ? 1 : alphaOf(m[4])) };
  }
  return null;
}

// ---- 길이 ----
const LENGTH_RE = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(px|rem|em|%)?$/;

export function normalizeLength(v, ctx) {
  if (typeof v === 'number') return Number.isFinite(v) ? round2(v) : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (s === 'normal') return 'normal';
  const m = LENGTH_RE.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  switch (m[2]) {
    case undefined:
    case 'px': return round2(n);
    case 'rem': return Number.isFinite(ctx?.rootFontSize) ? round2(n * ctx.rootFontSize) : null;
    case 'em': return Number.isFinite(ctx?.fontSize) ? round2(n * ctx.fontSize) : null;
    case '%': return Number.isFinite(ctx?.fontSize) ? round2((n * ctx.fontSize) / 100) : null;
    default: return null;
  }
}

// ---- 글꼴 ----
function firstFamily(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  const quoted = /^(["'])(.*?)\1/.exec(s);
  const name = (quoted ? quoted[2] : s.split(',')[0]).trim().replace(/\s+/g, ' ');
  return name === '' ? null : name;
}

export const normalizeFontFamily = (v) => firstFamily(v)?.toLowerCase() ?? null;

const WEIGHT_NAMES = new Map([
  ['thin', 100], ['extralight', 200], ['ultralight', 200], ['light', 300], ['regular', 400], ['normal', 400], ['book', 400],
  ['medium', 500], ['semibold', 600], ['demibold', 600], ['bold', 700], ['extrabold', 800], ['ultrabold', 800],
  ['black', 900], ['heavy', 900],
]);

export function normalizeFontWeight(v) {
  const inRange = (n) => (Number.isFinite(n) && n >= 1 && n <= 1000 ? n : null);
  if (typeof v === 'number') return inRange(v);
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (/^\d+(\.\d+)?$/.test(s)) return inRange(Number(s));
  return WEIGHT_NAMES.get(s.replace(/[\s_-]+/g, '')) ?? null;
}

// ---- 속성별 정규화: { key: 비교용 문자열, display: 리포트용 문자열 } | null ----
function normalizeValue(prop, raw, ctx) {
  if (raw === undefined || raw === null) return null;
  if (COLOR_PROPS.includes(prop)) {
    const c = normalizeColor(typeof raw === 'string' ? raw : String(raw));
    if (!c) return null;
    const rgb = [1, 3, 5].map((i) => parseInt(c.hex.slice(i, i + 2), 16));
    return { key: `${c.hex}/${c.alpha}`, display: c.alpha === 1 ? c.hex : `rgba(${rgb.join(', ')}, ${c.alpha})` };
  }
  if (prop === 'font-family') {
    const name = firstFamily(typeof raw === 'string' ? raw : String(raw));
    return name && { key: name.toLowerCase(), display: name };
  }
  if (prop === 'font-weight') {
    const w = normalizeFontWeight(raw);
    return w === null ? null : { key: String(w), display: String(w) };
  }
  // % 는 letter-spacing 에서만 환산한다. 다른 속성의 %는 해석 불가(요소 크기를 모른다).
  if (prop !== 'letter-spacing' && typeof raw === 'string' && raw.trim().endsWith('%')) return null;
  let n = normalizeLength(raw, ctx);
  if (n === null) return null;
  if (n === 'normal' && prop === 'letter-spacing') n = 0; // letter-spacing 만 normal ≡ 0
  return { key: String(n), display: n === 'normal' ? 'normal' : `${n}px` };
}

const fontSizeOf = (props, rootFontSize) => {
  const n = normalizeLength(props?.['font-size'], { rootFontSize });
  return typeof n === 'number' ? n : undefined;
};

export function compareTarget(design, actual) {
  const findings = [];
  const notChecked = [];
  const blocked = [];
  const { target } = design;
  const { selector, viewport } = actual;

  if (!(actual.count > 0)) {
    blocked.push(`selector '${selector}' matched 0 elements (target: ${target})`);
    return { findings, notChecked, blocked };
  }
  if (!actual.samples?.length) {
    blocked.push(`selector '${selector}' matched ${actual.count} elements but no samples were extracted (target: ${target})`);
    return { findings, notChecked, blocked };
  }

  const { rootFontSize } = actual;
  const designCtx = { rootFontSize, fontSize: fontSizeOf(design.props, rootFontSize) };
  const expected = new Map();
  for (const prop of PROPS) {
    const raw = design.props?.[prop];
    if (raw === undefined) continue; // 디자인에 없는 속성은 비교하지 않는다
    const n = normalizeValue(prop, raw, designCtx);
    if (n === null) notChecked.push({ what: `${target} ${prop}`, reason: 'unparseable design value' });
    else expected.set(prop, n);
  }

  for (const sample of actual.samples) {
    const where = `${selector}${actual.count > 1 ? `[${sample.index}]` : ''}${viewport ? ` @${viewport}` : ''}`;
    const actualCtx = { rootFontSize, fontSize: fontSizeOf(sample.props, rootFontSize) };
    for (const [prop, exp] of expected) {
      const raw = sample.props?.[prop];
      if (raw === undefined || raw === null || raw === '') {
        notChecked.push({ what: `${where} ${prop}`, reason: 'actual value missing' });
        continue;
      }
      const act = normalizeValue(prop, raw, actualCtx);
      if (act === null) {
        notChecked.push({ what: `${where} ${prop}`, reason: 'unparseable actual value' });
        continue;
      }
      if (act.key === exp.key) continue;
      findings.push({
        id: `S-${target}-${prop}-${sample.index}${viewport ? `-${viewport}` : ''}`,
        severity: SEVERITY_BY_PROP[prop],
        status: 'open',
        title: `${prop} 불일치`,
        where,
        expected: exp.display,
        actual: act.display,
        target,
        selector,
        index: sample.index,
        ...(viewport ? { viewport } : {}),
        property: prop,
      });
    }
  }
  return { findings, notChecked, blocked };
}

export function applyWaivers(findings, waivers) {
  const ctx = { rootFontSize: 16 };
  return findings.map((f) => {
    if (!f.selector || !f.property) return f;
    const same = (waivers ?? []).filter((w) => w.selector === f.selector && w.property === f.property);
    if (same.length === 0) return f;
    const exp = normalizeValue(f.property, f.expected, ctx);
    const act = normalizeValue(f.property, f.actual, ctx);
    const hit = same.find((w) => {
      const wf = normalizeValue(f.property, w.figma, ctx);
      const wa = normalizeValue(f.property, w.actual, ctx);
      return exp && act && wf && wa && wf.key === exp.key && wa.key === act.key;
    });
    if (hit) return { ...f, status: 'waived', waiver: { reason: hit.reason, by: hit.by, date: hit.date } };
    return { ...f, note: f.note ? `${f.note}; waiver 갱신 필요` : 'waiver 갱신 필요' };
  });
}

// ---- CLI ----
function readJsonArray(path, label) {
  let data;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`${label}: ${e.message}`);
  }
  if (!Array.isArray(data)) throw new Error(`${label}: JSON array expected`);
  return data;
}

function run(argv) {
  const flags = { design: null, actual: null, waivers: null };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].startsWith('--') ? argv[i].slice(2) : null;
    if (key === null || !Object.hasOwn(flags, key)) throw new Error(`unknown option: ${argv[i]}`);
    if (argv[i + 1] === undefined) throw new Error(`${argv[i]} needs a value`);
    flags[key] = argv[i + 1];
  }
  if (!flags.design || !flags.actual) throw new Error('usage: compare-styles.mjs --design <file> --actual <file> [--waivers <file>]');

  const designs = readJsonArray(flags.design, '--design');
  const actuals = readJsonArray(flags.actual, '--actual');
  const doc = { role: 'style', blocked: [], findings: [], notChecked: [] };

  for (const d of designs) {
    const matches = actuals.filter((a) => a.target === d.target);
    if (matches.length === 0) {
      doc.blocked.push(`target '${d.target}': no actual extraction (target name mismatch or selector not run)`);
      continue;
    }
    for (const a of matches) {
      const r = compareTarget(d, a);
      doc.blocked.push(...r.blocked);
      doc.findings.push(...r.findings);
      doc.notChecked.push(...r.notChecked);
    }
  }
  for (const a of actuals) {
    if (!designs.some((d) => d.target === a.target)) doc.notChecked.push({ what: a.target, reason: 'no design target' });
  }
  const seen = new Set();
  doc.notChecked = doc.notChecked.filter((n) => {
    const k = `${n.what}\u0000${n.reason}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
  if (flags.waivers) doc.findings = applyWaivers(doc.findings, readJsonArray(flags.waivers, '--waivers'));
  return doc;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify(run(process.argv.slice(2)), null, 2)}\n`);
  } catch (e) {
    process.stderr.write(`compare-styles: ${e.message}\n`);
    process.exit(2);
  }
}
