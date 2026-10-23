import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', 'qa-gate-subagent-stop.sh');
const tmp = mkdtempSync(join(tmpdir(), 'qa-gate-'));

const run = (payload, env = {}) => spawnSync('bash', [HOOK], {
  input: typeof payload === 'string' ? payload : JSON.stringify(payload),
  env: { ...process.env, QA_GATE_LOG_DIR: tmp, ...env }, encoding: 'utf8' });
const base = { hook_event_name: 'SubagentStop', stop_hook_active: false, agent_type: 'fe-dev', agent_id: 'a1' };
const passes = (r) => { assert.equal(r.status, 0); assert.equal(r.stdout, ''); };

test('passes non-SubagentStop events', () => passes(run({ ...base, hook_event_name: 'Stop', last_assistant_message: '완료' })));
test('passes when stop_hook_active', () => passes(run({ ...base, stop_hook_active: true, last_assistant_message: '완료' })));
for (const line of ['QA: PASS .orchestrator/qa/review-abc1234.md', 'QA: PASS WITH MINOR .orchestrator/qa/review-abc1234.md',
  'QA: FAIL .orchestrator/qa/style-abc1234.md', 'QA: BLOCKED .orchestrator/qa/acceptance-abc1234.md', 'QA: N/A — 코드 변경 없음', 'QA: N/A - no code change'])
  test(`passes: ${line}`, () => passes(run({ ...base, last_assistant_message: `\n${line}\n세부 내용` })));
test('blocks missing QA line', () => {
  const r = run({ ...base, last_assistant_message: '구현 완료' });
  assert.equal(r.status, 0); const out = JSON.parse(r.stdout);
  assert.equal(out.decision, 'block'); assert.match(out.reason, /QA: <verdict> <report-path>/);
});
test('blocks QA line that is not first', () => assert.equal(JSON.parse(run({ ...base, last_assistant_message: '완료\nQA: PASS x.md' }).stdout).decision, 'block'));
test('blocks malformed verdict', () => assert.equal(JSON.parse(run({ ...base, last_assistant_message: 'QA: OK' }).stdout).decision, 'block'));
test('blocks verdict without a report path and path with spaces', () => {
  assert.equal(JSON.parse(run({ ...base, last_assistant_message: 'QA: PASS' }).stdout).decision, 'block');
  assert.equal(JSON.parse(run({ ...base, last_assistant_message: 'QA: PASS a b.md' }).stdout).decision, 'block');
});
test('tolerates CRLF and trailing spaces on the QA line', () => passes(run({ ...base, last_assistant_message: 'QA: PASS x.md  \r\n본문' })));
test('fails open on invalid JSON', () => passes(run('{not json')));
test('fails open on empty stdin', () => passes(run('')));
test('fails open on missing last_assistant_message', () => passes(run(base)));
test('fails open on non-string last_assistant_message', () => passes(run({ ...base, last_assistant_message: { text: 'x' } })));
test('logs block decisions', () => { run({ ...base, last_assistant_message: 'x' });
  assert.equal(JSON.parse(readFileSync(join(tmp, 'qa-gate.log'), 'utf8').trim().split('\n').at(-1)).decision, 'block'); });
test('log line carries ts, event, agent_type, agent_id', () => {
  run({ ...base, agent_type: 'be-dev', agent_id: 'b9', last_assistant_message: 'x' });
  const line = JSON.parse(readFileSync(join(tmp, 'qa-gate.log'), 'utf8').trim().split('\n').at(-1));
  assert.deepEqual([line.event, line.agent_type, line.agent_id, typeof line.ts], ['SubagentStop', 'be-dev', 'b9', 'string']);
});
test('QA_GATE_DEBUG=1 saves the whole payload even for invalid JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-gate-debug-'));
  passes(run('{not json', { QA_GATE_LOG_DIR: dir, QA_GATE_DEBUG: '1' }));
  run({ ...base, last_assistant_message: 'QA: PASS x.md' }, { QA_GATE_LOG_DIR: dir, QA_GATE_DEBUG: '1' });
  const saved = readdirSync(dir).filter((f) => f.startsWith('payload-'));
  assert.equal(saved.length, 2);
  const bodies = saved.map((f) => readFileSync(join(dir, f), 'utf8'));
  assert.ok(bodies.includes('{not json'), '깨진 입력도 그대로 저장한다');
  assert.ok(bodies.some((b) => b.startsWith('{') && b.includes('"agent_type":"fe-dev"')));
});
test('does not save payloads unless QA_GATE_DEBUG=1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-gate-nodebug-'));
  run({ ...base, last_assistant_message: 'QA: PASS x.md' }, { QA_GATE_LOG_DIR: dir });
  assert.ok(readdirSync(dir).includes('qa-gate.log'), '훅이 실제로 실행됐어야 한다');
  assert.deepEqual(readdirSync(dir).filter((f) => f.startsWith('payload-')), []);
});
