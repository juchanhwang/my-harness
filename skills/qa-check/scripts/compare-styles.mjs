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

// ---- CSS Color 4: oklch() · oklab() · color(srgb|display-p3 …) → 8-bit sRGB ----
// Chrome 의 computed 색은 작성한 표기를 유지한다(oklch 로 쓰면 oklch(…) 로 직렬화). 그대로 두면 색 속성 전체가 해석 불가가 된다.
// OKLab 행렬: https://bottosson.github.io/posts/oklab/ (CSS Color 4 의 XYZ 경유 상수와 5e-8 안에서 일치).
// Display P3 → 선형 sRGB 행렬은 D65 원색 좌표에서 유도한 값이다. 외부 의존성 없이 Node 내장만 쓴다.
const NUMBER = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?';
const TOKEN_RE = new RegExp(`^(${NUMBER})(%|deg|grad|rad|turn)?$`);
const WIDE_RE = /^(oklch|oklab|color)\(\s*([^()]*?)\s*\)$/;
const P3_TO_LINEAR_SRGB = [
  [1.2249401762805598, -0.2249401762805598, 0],
  [-0.0420569547118276, 1.0420569547118276, 0],
  [-0.0196375545866131, -0.0786360454766487, 1.098273598463062],
];
const matVec = (m, v) => m.map((row) => row.reduce((sum, x, i) => sum + x * v[i], 0));
const gammaEncode = (v) => { const a = Math.abs(v); return (v < 0 ? -1 : 1) * (a > 0.0031308 ? 1.055 * a ** (1 / 2.4) - 0.055 : 12.92 * a); };
const gammaDecode = (v) => { const a = Math.abs(v); return (v < 0 ? -1 : 1) * (a <= 0.04045 ? a / 12.92 : ((a + 0.055) / 1.055) ** 2.4); };

// 성분 토큰 → 숫자. none 은 0, 퍼센트는 pctBase 가 100% 다. 각도 단위나 모르는 토큰은 null.
function componentValue(token, pctBase) {
  if (token === 'none') return 0;
  const m = TOKEN_RE.exec(token);
  if (!m || (m[2] !== undefined && m[2] !== '%')) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return m[2] === '%' ? (n * pctBase) / 100 : n;
}

function hueDegrees(token) {
  if (token === 'none') return 0;
  const m = TOKEN_RE.exec(token);
  if (!m || m[2] === '%') return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return { grad: n * 0.9, rad: (n * 180) / Math.PI, turn: n * 360 }[m[2]] ?? n;
}

function oklabToLinearSrgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

// s: trim·소문자. 감마 인코딩된 sRGB 성분(0..1, 범위 밖 가능)과 alpha. 해석 불가면 null.
function parseWideGamut(s) {
  const m = WIDE_RE.exec(s);
  if (!m || m[2].includes(',')) return null; // 이 함수들에는 쉼표 문법이 없다
  const sides = m[2].split('/');
  if (sides.length > 2) return null;
  const parts = sides[0].trim().split(/\s+/).filter(Boolean);
  let alpha = 1;
  if (sides.length === 2) {
    const alphaParts = sides[1].trim().split(/\s+/).filter(Boolean);
    const a = alphaParts.length === 1 ? componentValue(alphaParts[0], 1) : null;
    if (a === null) return null;
    alpha = clamp(a, 0, 1);
  }
  let encoded;
  if (m[1] === 'color') {
    const space = parts.shift();
    if (parts.length !== 3 || (space !== 'srgb' && space !== 'display-p3')) return null;
    const c = parts.map((t) => componentValue(t, 1));
    if (c.includes(null)) return null;
    encoded = space === 'srgb' ? c : matVec(P3_TO_LINEAR_SRGB, c.map(gammaDecode)).map(gammaEncode);
  } else {
    if (parts.length !== 3) return null;
    const L = componentValue(parts[0], 1);
    let a;
    let b;
    if (m[1] === 'oklch') {
      const C = componentValue(parts[1], 0.4);
      const h = hueDegrees(parts[2]);
      if (C === null || h === null) return null;
      a = Math.max(C, 0) * Math.cos((h * Math.PI) / 180);
      b = Math.max(C, 0) * Math.sin((h * Math.PI) / 180);
    } else {
      a = componentValue(parts[1], 0.4);
      b = componentValue(parts[2], 0.4);
    }
    if (L === null || a === null || b === null) return null;
    encoded = oklabToLinearSrgb(clamp(L, 0, 1), a, b).map(gammaEncode);
  }
  return encoded.every(Number.isFinite) ? { encoded, alpha } : null;
}

// sRGB 안(성분이 [-0.5/255, 1+0.5/255])이면 8-bit hex 로, 밖이면 어떤 sRGB hex 와도 같을 수 없으니 hex 없이 범위 밖 값을 돌려준다.
function wideGamutColor({ encoded, alpha }) {
  const eps = 0.5 / 255;
  if (encoded.some((v) => v < -eps || v > 1 + eps)) {
    return { hex: null, alpha: round2(alpha), outOfGamut: true, srgb: encoded.map((v) => round2(v * 255)) };
  }
  return { hex: `#${encoded.map((v) => hex2(v * 255)).join('')}`, alpha: round2(alpha) };
}

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
  const wide = parseWideGamut(s);
  return wide ? wideGamutColor(wide) : null;
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
    const text = typeof raw === 'string' ? raw : String(raw);
    const c = normalizeColor(text);
    if (!c) return null;
    // sRGB 밖의 색은 hex 가 없다. 같은 값끼리만 같고(범위 밖 sRGB 성분을 둘째 자리까지 비교) 원문을 그대로 보여 준다.
    if (c.hex === null) {
      return { key: c.alpha === 0 ? 'transparent' : `out-of-srgb:${c.srgb.join(',')}/${c.alpha}`, display: text.trim(), outOfGamut: true };
    }
    const rgb = [1, 3, 5].map((i) => parseInt(c.hex.slice(i, i + 2), 16));
    // alpha 0 은 RGB 와 무관하게 같은 색(완전 투명)이다: #FFFFFF00 ≡ transparent ≡ rgba(0, 0, 0, 0)
    return { key: c.alpha === 0 ? 'transparent' : `${c.hex}/${c.alpha}`, display: c.alpha === 1 ? c.hex : `rgba(${rgb.join(', ')}, ${c.alpha})` };
  }
  if (prop === 'font-family') {
    const name = firstFamily(typeof raw === 'string' ? raw : String(raw));
    return name && { key: name.toLowerCase(), display: name };
  }
  if (prop === 'font-weight') {
    const w = normalizeFontWeight(raw);
    return w === null ? null : { key: String(w), display: String(w) };
  }
  // Figma 의 line-height AUTO 는 CSS 의 normal 이다.
  if (prop === 'line-height' && typeof raw === 'string' && raw.trim().toLowerCase() === 'auto') raw = 'normal';
  // % 는 font-size 기준인 letter-spacing·line-height 에서만 px 로 환산한다. 다른 속성의 %는 해석 불가(요소 크기를 모른다).
  if (prop !== 'letter-spacing' && prop !== 'line-height' && typeof raw === 'string' && raw.trim().endsWith('%')) return null;
  let n = normalizeLength(raw, ctx);
  if (n === null) return null;
  if (n === 'normal' && prop === 'letter-spacing') n = 0; // letter-spacing 만 normal ≡ 0
  return { key: String(n), display: n === 'normal' ? 'normal' : `${n}px` };
}

const fontSizeOf = (props, rootFontSize) => {
  const n = normalizeLength(props?.['font-size'], { rootFontSize });
  return typeof n === 'number' ? n : undefined;
};

const show = (v) => (typeof v === 'string' ? `'${v}'` : JSON.stringify(v));

// 요청한(디자인에 값이 있는) 속성을 검증하지 못하면 blocked 다 — 값을 해석할 수 없거나 구현 값이 없는 경우(SKILL.md 공통 규칙 1).
// notChecked 에 두면 verdict 에 반영되지 않아 검증하지 못한 속성이 PASS 로 보인다. notChecked 는 호출 쪽이 요청하지 않은 추출에만 쓴다.
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
  const expected = new Map(); // prop → { norm } | { raw }(norm 이 없으면 샘플의 font-size 로 푼다)
  for (const prop of PROPS) {
    const raw = design.props?.[prop];
    if (raw === undefined) continue; // 디자인에 없는 속성은 비교하지 않는다
    const n = normalizeValue(prop, raw, designCtx);
    if (n !== null) expected.set(prop, { norm: n });
    // 디자인에 font-size 가 없으면 line-height 의 %는 구현의 font-size × % 로 푼다
    else if (prop === 'line-height' && designCtx.fontSize === undefined && normalizeValue(prop, raw, { rootFontSize, fontSize: 16 }) !== null) expected.set(prop, { raw });
    else blocked.push(`target '${target}' ${prop}: unparseable design value ${show(raw)}`);
  }

  for (const sample of actual.samples) {
    const where = `${selector}${actual.count > 1 ? `[${sample.index}]` : ''}${viewport ? ` @${viewport}` : ''}`;
    const actualCtx = { rootFontSize, fontSize: fontSizeOf(sample.props, rootFontSize) };
    for (const [prop, entry] of expected) {
      const raw = sample.props?.[prop];
      if (raw === undefined || raw === null || raw === '') {
        blocked.push(`${where} ${prop}: actual value missing (target: ${target})`);
        continue;
      }
      const act = normalizeValue(prop, raw, actualCtx);
      if (act === null) {
        blocked.push(`${where} ${prop}: unparseable actual value ${show(raw)} (target: ${target})`);
        continue;
      }
      const exp = entry.norm ?? normalizeValue(prop, entry.raw, actualCtx);
      if (exp === null) {
        blocked.push(`${where} ${prop}: design value ${show(entry.raw)} needs a font-size, but neither the design nor the implementation has one (target: ${target})`);
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
        ...(exp.outOfGamut || act.outOfGamut ? { note: 'sRGB 범위 밖' } : {}),
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
  // 디자인 쪽 문구는 뷰포트마다 같은 compareTarget 호출에서 반복되므로 중복을 지운다.
  const unique = (list, keyOf) => {
    const seen = new Set();
    return list.filter((item) => {
      const k = keyOf(item);
      return seen.has(k) ? false : (seen.add(k), true);
    });
  };
  doc.blocked = unique(doc.blocked, (b) => b);
  doc.notChecked = unique(doc.notChecked, (n) => `${n.what}\u0000${n.reason}`);
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
