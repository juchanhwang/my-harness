#!/usr/bin/env node
// FindingsDoc → 판정. 판정 계산은 이 파일만 한다 (spec D11, D18, D24).
//   node verdict.mjs <findings.json>                  → stdout "<Verdict>\n"
//   node verdict.mjs --aggregate <Verdict>...         → stdout "<Verdict>\n"
//   입력 오류 → stderr, exit 2
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SEVERITIES = ['Critical', 'Major', 'Minor', 'nit'];
const STATUSES = ['open', 'waived'];
// 높을수록 우선: BLOCKED > FAIL > PASS WITH MINOR > PASS
const RANK = new Map([['PASS', 0], ['PASS WITH MINOR', 1], ['FAIL', 2], ['BLOCKED', 3]]);

export function computeVerdict(doc) {
  const blocked = doc?.blocked ?? [];
  const findings = doc?.findings ?? [];
  if (!Array.isArray(blocked) || !Array.isArray(findings)) throw new Error('blocked and findings must be arrays');
  for (const f of findings) {
    if (!SEVERITIES.includes(f?.severity)) throw new Error(`unknown severity: ${f?.severity}`);
    if (!STATUSES.includes(f?.status)) throw new Error(`unknown status: ${f?.status}`);
  }
  if (blocked.length > 0) return 'BLOCKED';
  const open = findings.filter((f) => f.status === 'open');
  if (open.some((f) => f.severity === 'Critical' || f.severity === 'Major')) return 'FAIL';
  if (open.some((f) => f.severity === 'Minor')) return 'PASS WITH MINOR';
  return 'PASS';
}

export function aggregate(verdicts) {
  if (!Array.isArray(verdicts) || verdicts.length === 0) throw new Error('aggregate needs at least one verdict');
  for (const v of verdicts) if (!RANK.has(v)) throw new Error(`unknown verdict: ${v}`);
  return verdicts.reduce((a, b) => (RANK.get(b) > RANK.get(a) ? b : a));
}

function main(argv) {
  if (argv[0] === '--aggregate') return aggregate(argv.slice(1));
  if (argv.length !== 1) throw new Error('usage: verdict.mjs <findings.json> | --aggregate <Verdict>...');
  return computeVerdict(JSON.parse(readFileSync(argv[0], 'utf8')));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${main(process.argv.slice(2))}\n`);
  } catch (e) {
    process.stderr.write(`verdict: ${e.message}\n`);
    process.exit(2);
  }
}
