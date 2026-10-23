import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
test('does not save payloads unless QA_GATE_DEBUG=1 or a .debug file exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-gate-nodebug-'));
  run({ ...base, last_assistant_message: 'QA: PASS x.md' }, { QA_GATE_LOG_DIR: dir });
  assert.ok(readdirSync(dir).includes('qa-gate.log'), '훅이 실제로 실행됐어야 한다');
  assert.deepEqual(readdirSync(dir).filter((f) => f.startsWith('payload-')), []);
});

// ---- SubagentHandback: 대화형 세션의 서브에이전트는 마지막 assistant 메시지가 텍스트 없이 tool_use 하나라 last_assistant_message 가 없다 ----
const jsonl = (lines) => {
  const file = join(mkdtempSync(join(tmpdir(), 'qa-gate-transcript-')), 'agent-a1.jsonl');
  writeFileSync(file, `${lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n')}\n`);
  return file;
};
const handback = (message) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'SubagentHandback', input: { message } }] } });
const chatter = [
  { type: 'user', message: { role: 'user', content: '구현해' } },
  { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '작업 중' }, { type: 'tool_use', id: 't0', name: 'Bash', input: { command: 'ls' } }] } },
  { type: 'api-request' },
];
const withLog = (payload, extra = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-gate-hb-'));
  const r = run(payload, { QA_GATE_LOG_DIR: dir, ...extra });
  const logged = JSON.parse(readFileSync(join(dir, 'qa-gate.log'), 'utf8').trim().split('\n').at(-1));
  return { r, logged, dir };
};
const viaTranscript = (lines, payload = {}) => withLog({ ...base, agent_transcript_path: jsonl(lines), ...payload });
const blocks = (r) => { assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout).decision, 'block'); };

test('handback: no last_assistant_message, handback first line is a QA line -> pass', () => {
  const { r, logged } = viaTranscript([...chatter, handback('QA: PASS .orchestrator/qa/review-abc1234.md\n세부 내용')]);
  passes(r);
  assert.deepEqual([logged.decision, logged.source], ['pass', 'handback']);
});
test('handback: no last_assistant_message, handback first line is not a QA line -> block', () => {
  const { r, logged } = viaTranscript([...chatter, handback('구현을 마쳤습니다\nQA: PASS x.md')]);
  blocks(r);
  assert.deepEqual([logged.decision, logged.source], ['block', 'handback']);
});
test('handback: QA: N/A in the handback passes', () => {
  const { r, logged } = viaTranscript([...chatter, handback('QA: N/A — 코드 변경 없음\n설명')]);
  passes(r);
  assert.deepEqual([logged.decision, logged.source], ['pass', 'handback']);
});
test('handback: payload without agent_transcript_path fails open', () => {
  const { r, logged } = withLog(base);
  passes(r);
  assert.deepEqual([logged.decision, logged.source], ['pass', 'none']);
});
test('handback: missing, unreadable or non-file transcript path fails open', () => {
  for (const path of ['/nonexistent/agent-a1.jsonl', tmpdir(), '', null]) {
    const { r, logged } = withLog({ ...base, agent_transcript_path: path });
    passes(r);
    assert.equal(logged.source, 'none', String(path));
  }
});
test('handback: transcript without a handback fails open', () => {
  const { r, logged } = viaTranscript(chatter);
  passes(r);
  assert.deepEqual([logged.decision, logged.source], ['pass', 'none']);
});
test('handback: broken lines in the transcript are skipped and the verdict is still right', () => {
  const noise = ['{not json', '', '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"SubagentHan', '[1,2', '"just a string"', '42'];
  blocks(viaTranscript([...noise, ...chatter, handback('QA 없음'), ...noise]).r);
  passes(viaTranscript([...noise, ...chatter, handback('QA: FAIL .orchestrator/qa/review-abc1234.md'), ...noise]).r);
});
test('handback: only assistant tool_use blocks named SubagentHandback count', () => {
  const lookalikes = [
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_use', name: 'SubagentHandback', input: { message: '보고 아님' } }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'SendMessage', input: { message: '보고 아님' } }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'SubagentHandback' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'SubagentHandback', input: { message: { nested: '객체는 보고 본문이 아니다' } } }] } },
  ];
  const { r, logged } = viaTranscript([...chatter, ...lookalikes]);
  passes(r);
  assert.equal(logged.source, 'none');
});
test('handback: the last handback wins', () => {
  blocks(viaTranscript([handback('QA: PASS x.md'), ...chatter, handback('끝')]).r);
  passes(viaTranscript([handback('끝'), ...chatter, handback('QA: PASS x.md')]).r);
});
test('handback: only the tail of a long transcript is read', () => {
  const filler = Array.from({ length: 450 }, (_, i) => ({ type: 'user', message: { role: 'user', content: `줄 ${i}` } }));
  const { r, logged } = viaTranscript([handback('QA 없는 오래된 보고'), ...filler]);
  passes(r);
  assert.equal(logged.source, 'none');
  blocks(viaTranscript([...filler, handback('QA 없는 보고')]).r);
});
test('handback: last_assistant_message wins when it is a non-empty string', () => {
  const { r, logged } = viaTranscript([...chatter, handback('QA: PASS x.md')], { last_assistant_message: '완료' });
  blocks(r);
  assert.deepEqual([logged.decision, logged.source], ['block', 'lam']);
  const ok = viaTranscript([...chatter, handback('보고 본문')], { last_assistant_message: 'QA: PASS x.md' });
  passes(ok.r);
  assert.equal(ok.logged.source, 'lam');
});
test('handback: an empty last_assistant_message falls back to the handback', () => {
  const { r, logged } = viaTranscript([...chatter, handback('QA: BLOCKED .orchestrator/qa/gate-abc1234.md')], { last_assistant_message: '' });
  passes(r);
  assert.deepEqual([logged.decision, logged.source], ['pass', 'handback']);
  blocks(viaTranscript([...chatter, handback('QA 없음')], { last_assistant_message: '' }).r);
});
test('log lines carry the source of the message that was checked', () => {
  assert.equal(withLog({ ...base, last_assistant_message: 'QA: PASS x.md' }).logged.source, 'lam');
  assert.equal(withLog({ ...base, last_assistant_message: '완료' }).logged.source, 'lam');
  assert.equal(withLog({ ...base, stop_hook_active: true, last_assistant_message: '완료' }).logged.source, 'none');
  assert.equal(withLog('{not json').logged.source, 'none');
});
test('a .debug file in the log dir saves the payload without QA_GATE_DEBUG', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-gate-dotdebug-'));
  writeFileSync(join(dir, '.debug'), '');
  passes(run('{not json', { QA_GATE_LOG_DIR: dir }));
  const transcript_path = jsonl([...chatter, handback('QA: PASS x.md')]);
  passes(run({ ...base, agent_transcript_path: transcript_path }, { QA_GATE_LOG_DIR: dir }));
  const saved = readdirSync(dir).filter((f) => f.startsWith('payload-'));
  assert.equal(saved.length, 2);
  const bodies = saved.map((f) => readFileSync(join(dir, f), 'utf8'));
  assert.ok(bodies.includes('{not json'));
  assert.ok(bodies.some((b) => b.includes(transcript_path)), 'agent_transcript_path 가 담긴 payload 가 저장돼야 팀원 스모크에서 확인할 수 있다');
});
