# Networking

## 목차

1. [HTTP/2 & HTTP/3](#http2--http3)
2. [gRPC vs REST](#grpc-vs-rest)
3. [WebSocket & SSE](#websocket--sse)
4. [TCP/IP 기본 & DNS](#tcpip-기본--dns)
5. [TLS/SSL Handshake](#tlsssl-handshake)
6. [Keep-Alive & Connection Pooling](#keep-alive--connection-pooling)
7. [실무 가이드라인](#실무-가이드라인)

## HTTP/2 & HTTP/3

### HTTP/2

* **Multiplexing**: 단일 TCP 연결에서 여러 요청/응답을 동시 전송 (Head-of-line blocking 해결)
* **Header compression** (HPACK): 반복 헤더를 효율적으로 압축
* **Server push**: 서버가 클라이언트 요청 없이 리소스 전송 (실무에서는 거의 안 씀)
* **Binary framing**: 텍스트 대신 바이너리 프레임으로 파싱 효율 향상
* **Stream priority**: 리소스 우선순위 지정

```typescript
// Node.js HTTP/2 서버
import http2 from 'node:http2';
import fs from 'node:fs';

const server = http2.createSecureServer({
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.crt'),
});

server.on('stream', (stream, headers) => {
  stream.respond({ ':status': 200, 'content-type': 'application/json' });
  stream.end(JSON.stringify({ message: 'Hello HTTP/2' }));
});

server.listen(443);
```

### HTTP/3 (QUIC)

* UDP 기반 (TCP 대신) → 연결 수립 빠름 (0-RTT)
* **TCP Head-of-line blocking 완전 해결**: 스트림 간 독립적
* **연결 마이그레이션**: IP 변경 시에도 연결 유지 (모바일에 유리)
* TLS 1.3 내장 (별도 TLS handshake 불필요)

> 실무: Cloudflare, CDN이 알아서 HTTP/3 지원. 백엔드 서버는 HTTP/2까지만 직접 구현하는 경우가 대부분.

## gRPC vs REST

| 항목      | REST               | gRPC                    |
| ------- | ------------------ | ----------------------- |
| 프로토콜    | HTTP/1.1 or HTTP/2 | HTTP/2                  |
| 포맷      | JSON (텍스트)         | Protocol Buffers (바이너리) |
| 성능      | 보통                 | 빠름 (직렬화/역직렬화 효율)        |
| 스트리밍    | SSE, WebSocket     | 양방향 스트리밍 네이티브           |
| 브라우저 지원 | 네이티브             | grpc-web 필요          |
| 코드 생성   | OpenAPI (선택)       | .proto에서 자동 생성 (필수)     |
| 사용 사례   | 공개 API, 프론트엔드      | 마이크로서비스 간 통신            |

```protobuf
// user.proto
syntax = "proto3";

service UserService {
  rpc GetUser (GetUserRequest) returns (User);
  rpc ListUsers (ListUsersRequest) returns (stream User); // server streaming
}

message GetUserRequest {
  string id = 1;
}

message User {
  string id = 1;
  string name = 2;
  string email = 3;
}
```

```typescript
// gRPC 서버 (Node.js with @grpc/grpc-js)
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const packageDef = protoLoader.loadSync('user.proto');
const proto = grpc.loadPackageDefinition(packageDef);

const server = new grpc.Server();
server.addService(proto.UserService.service, {
  getUser: async (call, callback) => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, call.request.id),
    });
    callback(null, user);
  },
  listUsers: async (call) => {
    const userList = await db.query.users.findMany();
    for (const user of userList) {
      call.write(user);
    }
    call.end();
  },
});

server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
  console.log('gRPC server on :50051');
});
```

## WebSocket & SSE

### WebSocket

양방향 실시간 통신. 채팅, 실시간 게임, 협업 도구에 적합.

```typescript
import { WebSocketServer, WebSocket } from 'ws';

const wss = new WebSocketServer({ port: 8080 });
const clients = new Map<string, WebSocket>();

wss.on('connection', (ws, req) => {
  const userId = authenticateFromUrl(req.url!);
  clients.set(userId, ws);

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    handleMessage(userId, msg);
  });

  ws.on('close', () => {
    clients.delete(userId);
  });

  // Heartbeat (stale 연결 감지)
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});

// Dead connection 정리
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// 특정 사용자에게 메시지 전송
function sendToUser(userId: string, data: unknown) {
  const ws = clients.get(userId);
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}
```

### SSE (Server-Sent Events)

서버 → 클라이언트 단방향 스트림. 알림, 피드 업데이트에 적합.

```typescript
// Fastify SSE
app.get('/api/events', async (request, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Nginx buffering 비활성화
  });

  const userId = request.userId;

  // 이벤트 발행 함수
  const sendEvent = (event: string, data: unknown) => {
    reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Redis Pub/Sub으로 이벤트 수신
  const sub = redis.duplicate();
  await sub.subscribe(`user:${userId}:events`);

  sub.on('message', (_channel, message) => {
    const event = JSON.parse(message);
    sendEvent(event.type, event.data);
  });

  // Heartbeat
  const heartbeat = setInterval(() => {
    reply.raw.write(': heartbeat\n\n');
  }, 15000);

  // 연결 종료 시 정리
  request.raw.on('close', () => {
    clearInterval(heartbeat);
    sub.unsubscribe();
    sub.disconnect();
  });
});
```

### WebSocket vs SSE

| 항목        | WebSocket   | SSE             |
| --------- | ----------- | --------------- |
| 방향        | 양방향         | 서버→클라이언트        |
| 프로토콜      | ws:// (별도) | HTTP            |
| 자동 재연결    | 수동 구현       | 브라우저 내장         |
| 바이너리      | 지원           | 텍스트만        |
| 프록시/LB 호환 | 설정 필요    | HTTP이므로 자연스러움 |
| 사용 사례     | 채팅, 게임      | 알림, 피드, 대시보드    |

## TCP/IP 기본 & DNS

### TCP 3-way Handshake

```
Client          Server
  |--- SYN ------->|
  |<-- SYN-ACK ----|
  |--- ACK ------->|
  |  연결 수립 완료   |
```

### DNS Resolution

```
브라우저 캐시 → OS 캐시 → Router 캐시
  → ISP DNS → Root DNS → TLD DNS (.com)
  → Authoritative DNS → IP 반환
```

```typescript
// Node.js DNS 캐싱 (dns.lookup vs dns.resolve)
import dns from 'node:dns';

// dns.lookup(): OS resolver 사용, thread pool 소비
// dns.resolve(): c-ares 사용, 비동기, thread pool 미사용

// HTTP agent에서 DNS 캐싱
import { Agent } from 'undici';

const agent = new Agent({
  connect: {
    lookup: cachingLookup, // 커스텀 DNS resolver
  },
  keepAliveTimeout: 30000,
  keepAliveMaxTimeout: 60000,
});
```

## TLS/SSL Handshake

### TLS 1.3 (최신)

```
Client                              Server
  |--- ClientHello (cipher suites) -->|
  |<-- ServerHello + Certificate -----|
  |<-- Finished ----------------------|
  |--- Finished --------------------->|
  |        1-RTT로 완료              |
```

TLS 1.3은 1-RTT로 handshake 완료 (TLS 1.2는 2-RTT). 0-RTT 재연결도 지원 (replay attack 주의).

## Keep-Alive & Connection Pooling

### HTTP Keep-Alive

```typescript
// Node.js fetch/undici는 기본적으로 keep-alive 사용
import { Agent, setGlobalDispatcher } from 'undici';

const agent = new Agent({
  keepAliveTimeout: 30000,
  keepAliveMaxTimeout: 60000,
  pipelining: 1,
  connections: 50,    // 호스트당 최대 연결 수
});
setGlobalDispatcher(agent);
```

### DB Connection Pooling

```typescript
// PostgreSQL connection pool (pg 또는 postgres.js)
import postgres from 'postgres';

const sql = postgres({
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  max: 20,            // 최대 연결 수
  idle_timeout: 20,   // 유휴 연결 제거 (초)
  connect_timeout: 10,
  max_lifetime: 60 * 30, // 연결 최대 수명 30분
});

// Drizzle + postgres.js
import { drizzle } from 'drizzle-orm/postgres-js';
const db = drizzle(sql);
```

## 실무 가이드라인

1. **REST**: 공개 API, 프론트엔드-백엔드 통신의 기본
2. **gRPC**: 마이크로서비스 간 내부 통신 (성능 중요 시)
3. **WebSocket**: 양방향 실시간 필요 시 (채팅, 게임)
4. **SSE**: 서버→클라이언트 단방향 스트림 (알림, 피드)
5. **Connection pooling**: 모든 외부 연결(DB, Redis, HTTP)에 적용
6. **DNS**: `dns.resolve()` 사용 권장 (thread pool 절약)
7. **TLS**: 프로덕션에서 TLS 1.3 사용, TLS 1.2 이전은 비활성화

---

## Related

- [performance.md](performance.md) — HTTP 성능 프로파일링·Keep-Alive 튜닝
- [security.md](security.md) — TLS·CORS·네트워크 레벨 방어
- [api-design.md](api-design.md) — HTTP/2 서버 설정·스트리밍
- [observability.md](observability.md) — 네트워크 레이어 추적·요청 로깅
