# Node.js Internals

## 목차

1. [Event Loop 심층](#event-loop-심층)
2. [libuv & Thread Pool](#libuv--thread-pool)
3. [Worker Threads vs Cluster](#worker-threads-vs-cluster)
4. [Memory Management & V8 GC](#memory-management--v8-gc)
5. [Buffer & Stream 패턴](#buffer--stream-패턴)
6. [실무 가이드라인](#실무-가이드라인)

## Event Loop 심층

Node.js event loop는 libuv 위에서 동작하며, 6개 phase를 순환한다.

```
   ┌───────────────────────────┐
┌─>│         timers            │  setTimeout, setInterval
│  └─────────────┬─────────────┘
│  ┌─────────────▼─────────────┐
│  │     pending callbacks     │  이전 iteration에서 defer된 I/O 콜백
│  └─────────────┬─────────────┘
│  ┌─────────────▼─────────────┐
│  │       idle, prepare       │  내부용
│  └─────────────┬─────────────┘
│  ┌─────────────▼─────────────┐
│  │          poll              │  새 I/O 이벤트 조회, I/O 콜백 실행
│  └─────────────┬─────────────┘
│  ┌─────────────▼─────────────┐
│  │          check             │  setImmediate
│  └─────────────┬─────────────┘
│  ┌─────────────▼─────────────┐
│  │      close callbacks      │  socket.on('close', ...)
│  └─────────────┬─────────────┘
└─────────────────┘

각 phase 사이: microtask queue 실행
  1. process.nextTick() — 최우선
  2. Promise.then() — 그 다음
```

### Phase 별 동작

```typescript
// timers phase
setTimeout(() => console.log('timer 1'), 0);
setTimeout(() => console.log('timer 2'), 0);

// check phase
setImmediate(() => console.log('immediate 1'));
setImmediate(() => console.log('immediate 2'));

// microtask (phase 사이에 실행)
process.nextTick(() => console.log('nextTick'));
Promise.resolve().then(() => console.log('promise'));

// 실행 순서:
// nextTick
// promise
// timer 1
// timer 2
// immediate 1
// immediate 2
```

### setTimeout vs setImmediate

```typescript
// 메인 모듈에서: 순서 비결정적 (timer의 threshold에 의존)
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));

// I/O 콜백 내에서: setImmediate가 항상 먼저
const fs = require('node:fs');
fs.readFile('/dev/null', () => {
  setTimeout(() => console.log('timeout'), 0);
  setImmediate(() => console.log('immediate'));
  // 항상: immediate → timeout
});
```

## libuv & Thread Pool

libuv는 비동기 I/O를 위한 C 라이브러리. 플랫폼별 I/O multiplexing을 추상화.

* **epoll** (Linux), **kqueue** (macOS), **IOCP** (Windows)
* 네트워크 I/O: OS 커널이 비동기 처리 (thread pool 사용 안 함)
* 파일 I/O, DNS lookup, crypto: thread pool 사용 (기본 4개 스레드)

```typescript
// Thread pool 크기 조절
process.env.UV_THREADPOOL_SIZE = '8'; // 최대 1024

// Thread pool을 사용하는 작업들:
// - fs.* (파일 시스템)
// - dns.lookup() (dns.resolve()는 c-ares로 비동기)
// - crypto.pbkdf2(), crypto.randomBytes()
// - zlib.*

// Thread pool 병목 확인
import { monitorEventLoopDelay } from 'node:perf_hooks';

const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();

setInterval(() => {
  console.log({
    min: h.min / 1e6,      // ms
    max: h.max / 1e6,
    mean: h.mean / 1e6,
    p99: h.percentile(99) / 1e6,
  });
  h.reset();
}, 5000);
```

## Worker Threads vs Cluster

### Worker Threads

CPU-intensive 작업을 별도 스레드에서 실행. 메모리 공유 가능 (SharedArrayBuffer).

```typescript
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

if (isMainThread) {
  // 메인 스레드
  function runWorker(data: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(__filename, { workerData: data });
      worker.on('message', resolve);
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
      });
    });
  }

  // CPU-intensive 작업을 worker로 오프로드
  app.post('/api/reports/generate', async (request, reply) => {
    const result = await runWorker({
      type: 'generate-report',
      data: request.body,
    });
    return reply.send(result);
  });

} else {
  // Worker 스레드
  const { type, data } = workerData;

  switch (type) {
    case 'generate-report':
      const report = heavyComputation(data);
      parentPort!.postMessage(report);
      break;
  }
}
```

### Worker Thread Pool

```typescript
import { Worker } from 'node:worker_threads';
import { AsyncResource } from 'node:async_hooks';

class WorkerPool {
  private workers: Worker[] = [];
  private freeWorkers: Worker[] = [];
  private taskQueue: Array<{
    task: unknown;
    resolve: (value: unknown) => void;
    reject: (err: Error) => void;
  }> = [];

  constructor(private workerFile: string, private size: number = 4) {
    for (let i = 0; i < size; i++) {
      this.addWorker();
    }
  }

  private addWorker() {
    const worker = new Worker(this.workerFile);
    worker.on('message', (result) => {
      const callback = (worker as any).__callback;
      callback.resolve(result);
      this.freeWorkers.push(worker);
      this.processQueue();
    });
    worker.on('error', (err) => {
      const callback = (worker as any).__callback;
      if (callback) callback.reject(err);
    });
    this.workers.push(worker);
    this.freeWorkers.push(worker);
  }

  async execute(task: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (this.freeWorkers.length > 0) {
        const worker = this.freeWorkers.pop()!;
        (worker as any).__callback = { resolve, reject };
        worker.postMessage(task);
      } else {
        this.taskQueue.push({ task, resolve, reject });
      }
    });
  }

  private processQueue() {
    if (this.taskQueue.length > 0 && this.freeWorkers.length > 0) {
      const { task, resolve, reject } = this.taskQueue.shift()!;
      const worker = this.freeWorkers.pop()!;
      (worker as any).__callback = { resolve, reject };
      worker.postMessage(task);
    }
  }

  async close() {
    for (const worker of this.workers) {
      await worker.terminate();
    }
  }
}
```

### Cluster

멀티 프로세스로 CPU 코어를 활용. 각 프로세스가 독립 메모리.

```typescript
import cluster from 'node:cluster';
import os from 'node:os';

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  console.log(`Primary ${process.pid}: forking ${numCPUs} workers`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died (${signal || code})`);
    cluster.fork(); // 자동 재시작
  });

} else {
  // 각 worker가 동일한 서버 실행
  const app = buildFastifyApp();
  app.listen({ port: 3000 });
  console.log(`Worker ${process.pid} started`);
}
```

> **실무**: 대부분의 경우 Cluster 대신 Docker/Kubernetes로 여러 인스턴스를 실행하는 것이 관리가 쉽다. Worker Threads는 CPU-intensive 작업(이미지 처리, PDF 생성 등)에만 사용.

## Memory Management & V8 GC

> **이 파일은 V8 메모리 구조·GC 알고리즘·메모리 튜닝 옵션의 SSOT**다. 실제 leak 진단 절차는 [performance.md](performance.md#memory-leak-진단)를 참조한다.

### V8 메모리 구조

```
┌─────────────────────────────────────┐
│           V8 Heap                   │
│  ┌───────────┐  ┌────────────────┐  │
│  │ New Space  │  │   Old Space    │  │
│  │ (Young)    │  │   (Tenured)    │  │
│  │ ~1-8MB     │  │  ~512MB-1.5GB  │  │
│  │            │  │                │  │
│  │ Semi-space │  │ Mark-Sweep     │  │
│  │ Scavenge   │  │ Mark-Compact   │  │
│  └───────────┘  └────────────────┘  │
│  ┌───────────┐  ┌────────────────┐  │
│  │ Code Space│  │  Large Object  │  │
│  │           │  │  Space         │  │
│  └───────────┘  └────────────────┘  │
└─────────────────────────────────────┘
```

### GC 알고리즘

**Scavenge (Minor GC)** — New Space

* 빈번, 빠름 (1-2ms)
* Semi-space copying: 살아있는 객체를 다른 반쪽으로 복사
* 2번 Scavenge 생존 → Old Space로 승격 (promotion)

**Mark-Sweep (Major GC)** — Old Space

* 덜 빈번, 느림 (수십~수백 ms)
* Mark: 루트에서 도달 가능한 객체 표시
* Sweep: 표시되지 않은 객체의 메모리 해제

**Mark-Compact** — Old Space

* Mark-Sweep 후 메모리 단편화 해소
* 살아있는 객체를 한쪽으로 모아 연속 공간 확보

### 메모리 설정

```bash
# 최대 힙 크기 설정
node --max-old-space-size=4096 server.js  # 4GB

# GC 로그
node --trace-gc server.js
```

```typescript
// 프로그래밍 방식으로 메모리 확인
setInterval(() => {
  const mem = process.memoryUsage();
  console.log({
    rss: `${(mem.rss / 1024 / 1024).toFixed(1)}MB`,        // 전체 RSS
    heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(1)}MB`,
    heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB`,
    external: `${(mem.external / 1024 / 1024).toFixed(1)}MB`, // C++ 객체
    arrayBuffers: `${(mem.arrayBuffers / 1024 / 1024).toFixed(1)}MB`,
  });
}, 10000);
```

## Buffer & Stream 패턴

### Stream으로 대용량 파일 처리

```typescript
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { Transform } from 'node:stream';

// 파일을 읽고 → 변환하고 → 압축해서 → 쓰기
await pipeline(
  createReadStream('input.csv'),
  new Transform({
    transform(chunk, encoding, callback) {
      // 행별 처리
      const processed = chunk.toString()
        .split('\n')
        .map(line => line.toUpperCase())
        .join('\n');
      callback(null, processed);
    },
  }),
  createGzip(),
  createWriteStream('output.csv.gz')
);

// HTTP 응답에 스트리밍
app.get('/api/export', async (request, reply) => {
  const cursor = db.select().from(orders).$cursor();

  reply.header('Content-Type', 'text/csv');
  reply.header('Content-Disposition', 'attachment; filename="orders.csv"');

  const stream = new Transform({
    objectMode: true,
    transform(row, _enc, callback) {
      callback(null, `${row.id},${row.amount},${row.createdAt}\n`);
    },
  });

  // Readable → Transform → Response
  for await (const row of cursor) {
    stream.write(row);
  }
  stream.end();

  return reply.send(stream);
});
```

### Buffer 패턴

```typescript
// Buffer 생성 (보안: Buffer.alloc은 0으로 초기화)
const buf = Buffer.alloc(256);      // 안전
const unsafe = Buffer.allocUnsafe(256); // 빠르지만 이전 메모리 데이터 노출 가능

// Buffer 풀링 (빈번한 할당 최적화)
// Node.js는 8KB 이하 Buffer를 내부 pool에서 할당
const small = Buffer.from('hello'); // pool 사용
const large = Buffer.alloc(8193);   // 별도 할당

// 인코딩 변환
const base64 = Buffer.from('Hello World').toString('base64');
const hex = Buffer.from('Hello World').toString('hex');
```

## 실무 가이드라인

1. **Event loop 블로킹 금지**: CPU-intensive 작업은 Worker Thread로
2. **`setImmediate` > `setTimeout(fn, 0)`**: I/O 콜백 후 즉시 실행이 필요하면 setImmediate
3. **`process.nextTick` 남용 금지**: I/O starvation 가능. Promise 사용 권장
4. **Stream 사용**: 대용량 데이터는 반드시 Stream으로. 메모리에 전체 로드 금지
5. **UV_THREADPOOL_SIZE**: 파일 I/O가 많은 서비스는 thread pool 크기 증가 고려
6. **메모리 모니터링**: 프로덕션에서 heapUsed 추이 모니터링, 우상향이면 leak 의심

---

## Related

- [performance.md](performance.md) — 메모리 누수 진단·프로파일링
- [concurrency.md](concurrency.md) — Worker Threads·Cluster 내부 동작
- [debugging.md](debugging.md) — Heap snapshot·V8 inspector
- [resilience.md](resilience.md) — 프로세스 종료·graceful shutdown
