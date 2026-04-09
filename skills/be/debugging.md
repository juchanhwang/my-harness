# Debugging

## Production Debugging 방법론

### 체계적 접근 (OODA Loop)

1. **Observe**: 증상 확인 (에러 로그, 메트릭, 알림)
2. **Orient**: 가설 수립 (무엇이 변경되었나? 배포? 트래픽?)
3. **Decide**: 조사 방향 결정 (로그? 프로파일링? 재현?)
4. **Act**: 조사 실행, 결과에 따라 반복

### 첫 5분 체크리스트

```bash
# 1. 서비스 상태 확인
curl -s http://localhost:3000/health | jq

# 2. 최근 배포 확인
git log --oneline -5

# 3. 에러 로그 확인
tail -f /var/log/app/error.log | jq

# 4. 리소스 확인
top -bn1 | head -20
df -h
free -m

# 5. 연결 확인
netstat -tlnp | grep 3000
pg_isready -h localhost
redis-cli ping
```

## Log-Based Debugging

### 구조화 로그 활용

로그는 구조화된 JSON 형식으로 저장한다. 디버깅 과정에서 검색/필터링/집계가 가능해야 한다.

> **Pino logger 설정 및 child logger 패턴**은 [observability.md](observability.md#2-structured-logging-pino)에 정식 정의가 있다.
> 디버깅 시점의 로깅 인프라 전반(serializers, redact, requestId 주입)은 `observability.md`를 참조한다.

### 로그 검색 패턴

```bash
# requestId로 전체 요청 흐름 추적
cat app.log | jq 'select(.requestId == "abc-123")'

# 특정 에러 타입 필터
cat app.log | jq 'select(.err.type == "PaymentError")'

# 시간 범위 + 에러만
cat app.log | jq 'select(.level >= 50 and .time >= 1709000000000)'

# 느린 요청 찾기
cat app.log | jq 'select(.responseTime > 1000)'
```

## Remote Debugging (Node.js --inspect)

```bash
# 프로덕션에서 일시적으로 디버거 활성화
kill -USR1 <PID>  # SIGUSR1로 --inspect 활성화

# SSH 터널로 원격 디버깅
ssh -L 9229:localhost:9229 production-server

# Chrome DevTools에서 chrome://inspect 접속
```

> **주의**: 프로덕션에서 디버거는 최소한으로, 성능 영향 있음. 재현 가능하면 staging에서 디버깅.

## Memory Leak 추적

### Chrome DevTools

```bash
node --inspect server.js
# Chrome DevTools → Memory 탭 → Heap Snapshot

# 비교 방법:
# 1. 초기 상태 스냅샷 (Snapshot 1)
# 2. 의심 동작 반복
# 3. GC 강제 실행 (Collect garbage 버튼)
# 4. 두 번째 스냅샷 (Snapshot 2)
# 5. Comparison 뷰로 증가한 객체 확인
```

### Heapdump (프로덕션)

```typescript
import v8 from 'v8';

// API로 힙 덤프 트리거
app.get('/debug/heapdump', { config: { adminOnly: true } }, async () => {
  const filename = `/tmp/heap-${Date.now()}.heapsnapshot`;
  v8.writeHeapSnapshot(filename);
  return { filename };
});

// 자동 힙 덤프 (OOM 방지)
const HEAP_LIMIT_MB = 1024;
setInterval(() => {
  const { heapUsed } = process.memoryUsage();
  if (heapUsed > HEAP_LIMIT_MB * 1024 * 1024) {
    v8.writeHeapSnapshot(`/tmp/heap-oom-${Date.now()}.heapsnapshot`);
    logger.error({ heapUsed }, 'Heap limit exceeded, snapshot saved');
  }
}, 30000);
```

## CPU Profiling (Flame Graphs)

```bash
# clinic.js (가장 쉬움)
npx clinic flame -- node server.js
# 부하 → Ctrl+C → HTML 리포트

# perf (Linux, 상세)
perf record -F 99 -p $(pgrep -f server.js) -g -- sleep 30
perf script | stackcollapse-perf.pl | flamegraph.pl > flame.svg
```

```typescript
// 프로그래밍 방식
import { Session } from 'inspector/promises';

app.post('/debug/cpu-profile', { config: { adminOnly: true } }, async (request) => {
  const duration = request.body.durationMs || 10000;
  const session = new Session();
  session.connect();

  await session.post('Profiler.enable');
  await session.post('Profiler.start');

  await new Promise(r => setTimeout(r, duration));

  const { profile } = await session.post('Profiler.stop');
  const filename = `/tmp/cpu-${Date.now()}.cpuprofile`;
  await fs.writeFile(filename, JSON.stringify(profile));

  session.disconnect();
  return { filename, duration };
});
```

## Database Slow Query 진단

```sql
-- 현재 실행 중인 느린 쿼리
SELECT
  pid,
  now() - pg_stat_activity.query_start AS duration,
  query,
  state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds'
AND state != 'idle'
ORDER BY duration DESC;

-- Lock 대기 중인 쿼리
SELECT
  blocked.pid AS blocked_pid,
  blocked.query AS blocked_query,
  blocking.pid AS blocking_pid,
  blocking.query AS blocking_query
FROM pg_stat_activity blocked
JOIN pg_locks bl ON bl.pid = blocked.pid
JOIN pg_locks kl ON kl.locktype = bl.locktype
  AND kl.database IS NOT DISTINCT FROM bl.database
  AND kl.relation IS NOT DISTINCT FROM bl.relation
  AND kl.page IS NOT DISTINCT FROM bl.page
  AND kl.tuple IS NOT DISTINCT FROM bl.tuple
  AND kl.transactionid IS NOT DISTINCT FROM bl.transactionid
  AND kl.pid != bl.pid
  AND kl.granted
JOIN pg_stat_activity blocking ON kl.pid = blocking.pid
WHERE NOT bl.granted;

-- 느린 쿼리 kill
SELECT pg_terminate_backend(<pid>);
```

## Network 문제 진단

```bash
# DNS 확인
dig api.example.com
nslookup api.example.com

# HTTP 상세 (timing 포함)
curl -w "@curl-format.txt" -o /dev/null -s https://api.example.com/health

# curl-format.txt:
#   time_namelookup:  %{time_namelookup}s\n
#   time_connect:     %{time_connect}s\n
#   time_appconnect:  %{time_appconnect}s\n  (TLS)
#   time_starttransfer:%{time_starttransfer}s\n  (TTFB)
#   time_total:       %{time_total}s\n

# TCP 연결 확인
nc -zv api.example.com 443

# 패킷 캡처 (tcpdump)
tcpdump -i eth0 port 5432 -w pg-traffic.pcap
```

## 실무 디버깅 원칙

1. **로그 먼저**: 90%의 문제는 구조화된 로그로 해결
2. **변경사항 확인**: "무엇이 바뀌었나?" — 배포, 설정, 트래픽
3. **재현 가능하면 staging에서**: 프로덕션 디버깅은 최후 수단
4. **시간 제한**: 15분 이상 막히면 접근 방법 변경
5. **기록**: 디버깅 과정과 결과를 문서화 (포스트모템에 활용)
6. **도구 익혀두기**: 위기 상황에서 새 도구 배우기는 늦음

---

## Related

- [observability.md](observability.md) — Pino 구조화 로깅·OpenTelemetry trace
- [performance.md](performance.md) — Heap snapshot·CPU 프로파일링
- [error-handling.md](error-handling.md) — Fastify error hooks·centralized handling
- [nodejs-internals.md](nodejs-internals.md) — V8 GC·메모리 구조
