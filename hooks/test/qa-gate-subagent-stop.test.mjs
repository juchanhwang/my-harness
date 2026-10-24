import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
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

// ---- PreToolUse(SubagentHandback): 서브에이전트는 SubagentHandback 도구로 끝나서 SubagentStop 시점에는 검사할 보고 본문이 없다.
//      도구를 호출하는 순간의 tool_input.message(보고 본문) 첫 줄을 검사하고, 틀리면 에이전트(agent_id)당 한 번만 거부한다.
//      거부 기록($LOG_DIR/state/handback-denied-<agent_id>)이 남으므로 이 아래 테스트는 새 로그 디렉터리를 쓴다
//      (공유 tmp 에 남기면 같은 agent_id 'a1' 을 쓰는 SubagentStop 테스트들의 결과가 달라진다) ----
const pre = (message, extra = {}) => ({
  hook_event_name: 'PreToolUse', tool_name: 'SubagentHandback', tool_input: { message }, agent_type: 'fe-dev', agent_id: 'a45e1',
  session_id: 's1', cwd: '/work', transcript_path: '/work/t.jsonl', tool_use_id: 'toolu_1', permission_mode: 'default', effort: 'high', prompt_id: 'p1', ...extra });
const freshDir = () => mkdtempSync(join(tmpdir(), 'qa-gate-pre-'));
const runIn = (dir, payload) => run(payload, { QA_GATE_LOG_DIR: dir });
const record = (dir, id) => join(dir, 'state', `handback-denied-${id}`);
const lastLogOf = (dir) => JSON.parse(readFileSync(join(dir, 'qa-gate.log'), 'utf8').trim().split('\n').at(-1));
const denial = (r) => { // 거부 JSON 의 hookSpecificOutput (훅 출력이 없으면 여기서 실패한다)
  assert.equal(r.status, 0);
  assert.notEqual(r.stdout, '', '거부 JSON 이 있어야 한다');
  return JSON.parse(r.stdout).hookSpecificOutput;
};
const denies = (r) => assert.equal(denial(r).permissionDecision, 'deny');

test('pretooluse: a handback whose first line is a QA line is allowed without output', () => {
  const dir = freshDir();
  passes(runIn(dir, pre('QA: PASS .orchestrator/qa/review-abc1234.md\n세부 내용')));
  const l = lastLogOf(dir);
  assert.deepEqual([l.event, l.agent_type, l.agent_id, l.decision, l.source], ['PreToolUse', 'fe-dev', 'a45e1', 'pass', 'handback']);
});
test('pretooluse: QA: N/A in the handback is allowed', () => {
  const dir = freshDir();
  passes(runIn(dir, pre('QA: N/A — 파일 변경 없음\n설명')));
  assert.deepEqual([lastLogOf(dir).decision, lastLogOf(dir).source], ['pass', 'handback']);
});
test('pretooluse: every verdict form is allowed, also after blank lines and with CRLF and trailing spaces', () => {
  for (const message of ['QA: PASS WITH MINOR .orchestrator/qa/review-abc1234.md', 'QA: FAIL .orchestrator/qa/style-abc1234.md',
    'QA: BLOCKED .orchestrator/qa/acceptance-abc1234.md', 'QA: N/A - no code change', '\n\nQA: PASS x.md  \r\n본문']) {
    const dir = freshDir();
    passes(runIn(dir, pre(message)));
    assert.equal(lastLogOf(dir).decision, 'pass', message);
  }
});
test('pretooluse: a handback without a QA line is denied with a reason that says how to fix it, and the denial is recorded', () => {
  const dir = freshDir();
  const out = denial(runIn(dir, pre('구현을 마쳤습니다')));
  assert.equal(out.hookEventName, 'PreToolUse');
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /QA: <verdict> <report-path>/);
  assert.match(out.permissionDecisionReason, /SubagentHandback/);
  assert.ok(existsSync(record(dir, 'a45e1')), '거부 기록 파일');
  const l = lastLogOf(dir);
  assert.deepEqual([l.event, l.agent_id, l.decision, l.source], ['PreToolUse', 'a45e1', 'deny', 'handback']);
});
test('pretooluse: only the first non-empty line counts and it must be a well-formed QA line', () => {
  for (const message of ['구현 완료\nQA: PASS x.md', 'QA: OK', 'QA: PASS', 'QA: PASS a b.md', 'qa: pass x.md', 'QA: N/A', 'QA: N/A —'])
    denies(runIn(freshDir(), pre(message)));
});
test('pretooluse: the same agent is denied once and allowed on the retry even without a QA line', () => {
  const dir = freshDir();
  denies(runIn(dir, pre('QA 없음')));
  passes(runIn(dir, pre('여전히 QA 없음')));
  assert.deepEqual([lastLogOf(dir).decision, lastLogOf(dir).source], ['pass', 'none']);
  passes(runIn(dir, pre('세 번째도 QA 없음')));
});
test('pretooluse: the denial budget is per agent_id', () => {
  const dir = freshDir();
  denies(runIn(dir, pre('QA 없음', { agent_id: 'a1' })));
  denies(runIn(dir, pre('QA 없음', { agent_id: 'b2' })));
  passes(runIn(dir, pre('QA 없음', { agent_id: 'a1' })));
  assert.deepEqual(readdirSync(join(dir, 'state')).sort(), ['handback-denied-a1', 'handback-denied-b2']);
});
test('pretooluse: a handback that passes does not use up the denial of its agent', () => {
  const dir = freshDir();
  passes(runIn(dir, pre('QA: PASS x.md')));
  denies(runIn(dir, pre('QA 없음')));
});
test('pretooluse: when the record cannot be created the handback is allowed instead of denied (loop guard fails open)', () => {
  const unwritable = {
    'log dir is a file': () => { const f = join(freshDir(), 'logfile'); writeFileSync(f, ''); return f; },
    'state is a file': () => { const d = freshDir(); writeFileSync(join(d, 'state'), ''); return d; },
    // root 는 읽기 전용 디렉터리에도 쓸 수 있어서 이 경우는 건너뛴다
    ...(process.getuid?.() === 0 ? {} : { 'state dir is read-only': () => { const d = freshDir(); mkdirSync(join(d, 'state')); chmodSync(join(d, 'state'), 0o500); return d; } }),
  };
  for (const [name, setup] of Object.entries(unwritable)) {
    const dir = setup();
    try {
      const r = runIn(dir, pre('QA 없음'));
      assert.equal(r.status, 0, name);
      assert.equal(r.stdout, '', name);
    } finally { if (name === 'state dir is read-only') chmodSync(join(dir, 'state'), 0o700); }
  }
  denies(runIn(freshDir(), pre('QA 없음'))); // 대조: 쓸 수 있는 디렉터리에서는 같은 payload 가 거부된다
});
test('pretooluse: tools other than SubagentHandback are ignored (no output, no log, no record)', () => {
  for (const tool_name of ['Read', 'Bash', 'SendMessage']) {
    const dir = freshDir();
    passes(runIn(dir, pre('QA 없음', { tool_name })));
    assert.deepEqual(readdirSync(dir), [], tool_name);
  }
  denies(runIn(freshDir(), pre('QA 없음'))); // 대조: 같은 payload 가 SubagentHandback 이면 거부된다
});
test('pretooluse: truncated JSON and non-object input fail open', () => {
  const full = JSON.stringify(pre('QA 없음'));
  for (const input of [full.slice(0, 80), '', 'null', '[]', '"SubagentHandback"']) {
    const dir = freshDir();
    passes(runIn(dir, input));
    assert.ok(!existsSync(join(dir, 'state')), input);
  }
  denies(runIn(freshDir(), full)); // 대조: 온전한 payload 는 거부된다
});
test('pretooluse: a missing or non-string tool_input.message cannot be checked and fails open', () => {
  for (const tool_input of [undefined, {}, { message: 42 }, { message: { text: 'QA 없음' } }, { message: '' }, { text: 'QA 없음' }, 'QA 없음']) {
    const dir = freshDir();
    passes(runIn(dir, pre('x', { tool_input })));
    assert.ok(!existsSync(join(dir, 'state')), JSON.stringify(tool_input));
  }
  denies(runIn(freshDir(), pre('QA 없음'))); // 대조: 보고 본문이 문자열이면 검사한다
});

// ---- agent_type 가드: fe-dev·be-dev 만 검사한다. in-process 팀원은 메타 agentType 에 팀원 이름이 들어간다(실측 'smoke-fe') ----
test('agent_type guard: SubagentStop of agents other than fe-dev/be-dev is not checked (log source skip-type)', () => {
  for (const agent_type of ['smoke-fe', 'qa', 'general-purpose', 'fe-dev-2', '']) {
    const dir = freshDir();
    passes(runIn(dir, { ...base, agent_type, last_assistant_message: '구현 완료' }));
    const l = lastLogOf(dir);
    assert.deepEqual([l.agent_type, l.decision, l.source], [agent_type, 'pass', 'skip-type']);
  }
  const noType = { ...base, last_assistant_message: '구현 완료' };
  delete noType.agent_type; // agent_type 필드 자체가 없어도 검사 대상이 아니다
  const dir = freshDir();
  passes(runIn(dir, noType));
  assert.equal(lastLogOf(dir).source, 'skip-type');
  for (const agent_type of ['fe-dev', 'be-dev']) blocks(runIn(freshDir(), { ...base, agent_type, last_assistant_message: '구현 완료' }));
});
test('agent_type guard: a handback of an in-process teammate or another agent is allowed and leaves no record', () => {
  for (const agent_type of ['smoke-fe', 'qa']) {
    const dir = freshDir();
    passes(runIn(dir, pre('QA 없음', { agent_type })));
    assert.deepEqual([lastLogOf(dir).decision, lastLogOf(dir).source], ['pass', 'skip-type'], agent_type);
    assert.ok(!existsSync(join(dir, 'state')), agent_type);
  }
  denies(runIn(freshDir(), pre('QA 없음', { agent_type: 'be-dev' }))); // be-dev 는 검사한다
});

// ---- 에이전트당 차단 최대 1회: PreToolUse 에서 한 번 거부된 에이전트는 SubagentStop 에서 다시 막지 않는다 ----
test('SubagentStop passes for an agent that was already denied at the handback (at most one block per agent)', () => {
  const dir = freshDir();
  const stop = { ...base, agent_id: 'a45e1', last_assistant_message: '완료' };
  blocks(runIn(freshDir(), stop)); // 대조: 거부 기록이 없으면 지금처럼 막는다
  denies(runIn(dir, pre('QA 없음')));
  passes(runIn(dir, stop));
  assert.equal(lastLogOf(dir).decision, 'pass');
  passes(runIn(dir, { ...base, agent_id: 'a45e1', agent_transcript_path: jsonl([...chatter, handback('QA 없음')]) })); // 트랜스크립트 경로도 마찬가지
  blocks(runIn(dir, { ...stop, agent_id: 'other' })); // 기록은 agent_id 별이다
});

// ---- 거부 기록 파일 ----
test('denial record: agent_id keeps only [A-Za-z0-9_-] so the record cannot leave the state dir', () => {
  const dir = freshDir();
  denies(runIn(dir, pre('QA 없음', { agent_id: '../../evil/a_b-1' })));
  assert.deepEqual(readdirSync(join(dir, 'state')), ['handback-denied-evila_b-1']);
  assert.ok(!existsSync(join(dir, 'evil')) && !existsSync(join(dir, '..', 'evil')));
  passes(runIn(dir, pre('QA 없음', { agent_id: '../../evil/a_b-1' }))); // 같은 id 는 같은 기록으로 모인다
});
test('denial record: without a usable agent_id nothing can be recorded, so nothing is denied', () => {
  for (const agent_id of ['', '/../', '!!!', undefined]) {
    const dir = freshDir();
    passes(runIn(dir, pre('QA 없음', { agent_id })));
    assert.ok(!existsSync(join(dir, 'state')), String(agent_id));
  }
  denies(runIn(freshDir(), pre('QA 없음'))); // 대조: 쓸 수 있는 agent_id 면 거부된다
});
test('state: denial records older than 7 days are removed and recent ones are kept', () => {
  const dir = freshDir();
  mkdirSync(join(dir, 'state'));
  const [stale, recent] = [record(dir, 'old1'), record(dir, 'new1')];
  for (const f of [stale, recent]) writeFileSync(f, '');
  const nineDaysAgo = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
  utimesSync(stale, nineDaysAgo, nineDaysAgo);
  passes(runIn(dir, pre('QA: PASS x.md')));
  assert.ok(!existsSync(stale), '9일 지난 기록은 지운다');
  assert.ok(existsSync(recent), '최근 기록은 둔다');
});
