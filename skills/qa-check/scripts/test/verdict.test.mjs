import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregate, computeVerdict } from '../verdict.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'verdict.mjs');
const run = (...args) => spawnSync('node', [CLI, ...args], { encoding: 'utf8' });

const doc = (findings = [], blocked = []) => ({ role: 'review', blocked, findings, notChecked: [] });
const f = (severity, status = 'open') => ({ id: 'x', severity, status, title: 't', where: 'w' });

test('blocked wins over findings', () => assert.equal(computeVerdict(doc([f('Critical')], ['PRD 없음'])), 'BLOCKED'));
test('open Critical or Major fails', () => {
  assert.equal(computeVerdict(doc([f('Critical')])), 'FAIL');
  assert.equal(computeVerdict(doc([f('Major')])), 'FAIL');
});
test('only Minor passes with minor', () => assert.equal(computeVerdict(doc([f('Minor'), f('nit')])), 'PASS WITH MINOR'));
test('waived Major and nit pass', () => assert.equal(computeVerdict(doc([f('Major', 'waived'), f('nit')])), 'PASS'));
test('empty passes', () => assert.equal(computeVerdict(doc()), 'PASS'));
test('unknown severity or status is rejected, never passed', () => {
  assert.throws(() => computeVerdict(doc([f('Blocker')])), /severity/);
  assert.throws(() => computeVerdict(doc([f('Major', 'closed')])), /status/);
});
test('aggregate precedence', () => {
  assert.equal(aggregate(['PASS', 'FAIL', 'BLOCKED']), 'BLOCKED');
  assert.equal(aggregate(['PASS', 'FAIL']), 'FAIL');
  assert.equal(aggregate(['PASS', 'PASS WITH MINOR']), 'PASS WITH MINOR');
  assert.equal(aggregate(['PASS', 'PASS']), 'PASS');
  assert.throws(() => aggregate([]));
  assert.throws(() => aggregate(['PASS', 'MAYBE']), /MAYBE/);
});
test('CLI prints verdict', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdict-'));
  const file = join(dir, 'findings.json');
  writeFileSync(file, JSON.stringify(doc([f('Major')])));
  const r = run(file);
  assert.equal(r.stdout, 'FAIL\n');
  assert.equal(r.status, 0);
});
test('CLI aggregates', () => {
  const r = run('--aggregate', 'PASS', 'PASS WITH MINOR');
  assert.equal(r.stdout, 'PASS WITH MINOR\n');
  assert.equal(r.status, 0);
});
test('CLI rejects invalid input', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdict-'));
  const file = join(dir, 'broken.json');
  writeFileSync(file, '{ not json');
  const broken = run(file);
  assert.equal(broken.status, 2);
  assert.notEqual(broken.stderr, '');
  assert.equal(broken.stdout, '');
  assert.equal(run(join(dir, 'missing.json')).status, 2);
  assert.equal(run('--aggregate').status, 2);
  assert.equal(run().status, 2);
});
