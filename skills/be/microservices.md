# Microservices

## Monolith vs Microservices 결정 기준

| 기준      | Monolith 유리 | Microservices 유리 |
| ------- | ----------- | ---------------- |
| 팀 규모    | < 10명       | 10명+ (여러 팀)      |
| 도메인 복잡도 | 단순~중간      | 높음, 경계가 명확       |
| 배포 주기   | 통합 배포 가능    | 독립 배포 필요         |
| 확장 요구   | 균일한 트래픽     | 서비스별 다른 확장       |
| 기술 다양성  | 단일 스택       | 서비스별 최적 기술       |
| 운영 역량   | DevOps 미성숙  | 성숙한 DevOps/SRE   |

> "Monolith first" — 도메인을 충분히 이해한 후 분리하라. 경계를 잘못 잡으면 distributed monolith가 된다.

### Modular Monolith (중간 선택지)

```
src/
├── modules/
│   ├── order/          # 독립 모듈
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   └── index.ts    # 모듈 public API
│   ├── payment/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   └── index.ts
│   └── notification/
├── shared/             # 공통 인프라
└── main.ts
```

모듈 간 통신은 public API(인터페이스)로만. DB 테이블도 모듈별 소유. 나중에 마이크로서비스로 분리 용이.

## Service Decomposition 전략

### By Business Capability

비즈니스 기능 단위로 분리.

```
이커머스:
- Order Service (주문 관리)
- Payment Service (결제 처리)
- Inventory Service (재고 관리)
- Shipping Service (배송 관리)
- Notification Service (알림)
- User Service (사용자 관리)
```

### By Subdomain (DDD)

```
Core Domain      → 직접 구현 (차별화 요소)
Supporting Domain → 직접 또는 오프더셀프
Generic Domain    → 외부 서비스 (인증, 이메일, 결제)
```

### 분리 기준 체크리스트

1. **독립 배포 가능한가?** — 다른 서비스 변경 없이 배포 가능
2. **독립 확장 가능한가?** — 이 서비스만 scale out 가능
3. **데이터 소유권이 명확한가?** — 다른 서비스의 DB를 직접 접근하지 않음
4. **팀 소유권이 가능한가?** — 한 팀이 책임질 수 있는 크기
5. **장애 격리가 되는가?** — 이 서비스 장애가 다른 서비스에 영향 최소

## API Gateway Pattern

클라이언트의 단일 진입점. 라우팅, 인증, rate limiting 등 cross-cutting concern 처리.

```
Client → API Gateway → Order Service
                     → Payment Service
                     → User Service

API Gateway 역할:
- Request routing
- Authentication/Authorization
- Rate limiting
- Request/Response transformation
- Load balancing
- Circuit breaking
- Logging/Monitoring
```

> **Rate limiting 구현**: API Gateway/인프라 레벨은 [system-design.md](system-design.md#reverse-proxy-nginx), 애플리케이션 레벨(`@fastify/rate-limit`, 라우트 단위)은 [security.md](security.md#4-rate-limiting) 참조. 이 문서는 gateway의 역할 나열만 다룬다.

```typescript
// 간단한 API Gateway (Fastify)
import Fastify from 'fastify';
import httpProxy from '@fastify/http-proxy';

const gateway = Fastify();

// 서비스별 라우팅
gateway.register(httpProxy, {
  upstream: 'http://order-service:3001',
  prefix: '/api/orders',
  rewritePrefix: '/orders',
});

gateway.register(httpProxy, {
  upstream: 'http://payment-service:3002',
  prefix: '/api/payments',
  rewritePrefix: '/payments',
});

gateway.register(httpProxy, {
  upstream: 'http://user-service:3003',
  prefix: '/api/users',
  rewritePrefix: '/users',
});

// 공통 미들웨어
gateway.addHook('onRequest', async (request) => {
  // 인증 검증
  await verifyAuth(request);
  // Rate limiting
  await checkRateLimit(request);
});

gateway.listen({ port: 8080 });
```

## Service Discovery

서비스 인스턴스의 위치(IP:port)를 동적으로 찾는 메커니즘.

### Client-Side Discovery

```
Service Registry (Consul, etcd)에 등록
→ 클라이언트가 registry에서 목록 조회
→ 클라이언트가 직접 load balancing
```

### Server-Side Discovery

```
Service Registry에 등록
→ Load Balancer가 registry에서 목록 조회
→ 요청을 적절한 인스턴스로 라우팅
```

### Kubernetes 환경

```yaml
# Kubernetes Service = 내장 service discovery
apiVersion: v1
kind: Service
metadata:
  name: order-service
spec:
  selector:
    app: order-service
  ports:
    - port: 3000
# 다른 서비스에서: http://order-service:3000
```

## Inter-Service Communication

### Sync (동기)

```typescript
// HTTP (REST)
const order = await fetch('http://order-service:3001/orders/123');

// gRPC (성능 중요 시)
const order = await orderClient.getOrder({ id: '123' });
```

### Async (비동기)

```typescript
// Event-based (이벤트 발행 → 구독자가 처리)
await eventBus.publish('order.created', { orderId: '123', amount: 50000 });

// Message Queue (작업 위임)
await queue.add('process-payment', { orderId: '123', amount: 50000 });
```

### 선택 기준

| 동기          | 비동기             |
| ----------- | --------------- |
| 즉시 응답 필요    | 응답 불필요 또는 지연 가능 |
| 간단한 요청-응답   | 장기 실행 작업        |
| 강한 일관성 필요   | 최종 일관성 허용       |
| 서비스 간 결합도 높음 | 느슨한 결합          |

## Data Ownership & Database per Service

```
핵심 규칙: 각 서비스는 자체 DB를 소유.
다른 서비스의 DB에 직접 접근 금지.

Order Service → orders_db
Payment Service → payments_db
User Service → users_db

데이터가 필요하면:
1. API 호출 (sync)
2. 이벤트 구독으로 로컬 복사본 유지 (async)
```

```typescript
// ❌ 직접 다른 서비스의 DB 접근
const user = await otherServiceDb.query.users.findFirst(...);

// ✅ API 호출
const user = await userServiceClient.getUser(userId);

// ✅ 이벤트로 로컬 복사본 유지
eventBus.subscribe('user.updated', async (event) => {
  await db.insert(userProjections).values({
    userId: event.data.id,
    name: event.data.name,
    email: event.data.email,
  }).onConflictDoUpdate({
    target: userProjections.userId,
    set: { name: event.data.name, email: event.data.email },
  });
});
```

## Strangler Fig Pattern (점진적 마이그레이션)

레거시 모놀리스를 점진적으로 마이크로서비스로 교체.

```
Phase 1: 프록시 설정
┌──────────┐    ┌──────────┐    ┌──────────────┐
│ Client   │───→│ Proxy    │───→│ Monolith     │
└──────────┘    └──────────┘    └──────────────┘

Phase 2: 일부 기능 분리
┌──────────┐    ┌──────────┐    ┌──────────────┐
│ Client   │───→│ Proxy    │─┬─→│ Monolith     │
└──────────┘    └──────────┘ │  └──────────────┘
                              │  ┌──────────────┐
                              └─→│ New Service  │
                                 └──────────────┘

Phase 3: 점점 더 많은 기능 분리
...

Phase N: 모놀리스 제거
```

```typescript
// Proxy에서 feature flag로 트래픽 분배
gateway.addHook('onRequest', async (request, reply) => {
  const path = request.url;

  if (path.startsWith('/api/orders')) {
    const useNewService = await featureFlag.isEnabled('orders-microservice');
    if (useNewService) {
      // 새 서비스로 라우팅
      return proxy.web(request.raw, reply.raw, {
        target: 'http://order-service:3001',
      });
    }
    // 레거시 모놀리스로 라우팅
    return proxy.web(request.raw, reply.raw, {
      target: 'http://monolith:3000',
    });
  }
});
```

### 마이그레이션 단계

1. **식별**: 분리할 기능 선정 (경계가 명확한 것부터)
2. **인터페이스 정의**: API 계약 작성
3. **구현**: 새 서비스 구현 + 테스트
4. **병행 운영**: 프록시로 트래픽 분배, 양쪽 결과 비교
5. **전환**: 트래픽 100% 새 서비스로
6. **정리**: 모놀리스에서 해당 코드 제거

## 실무 가이드라인

1. **Start with monolith**: 도메인 이해 없이 분리하면 distributed monolith
2. **2 pizza rule**: 서비스 크기는 한 팀(6-8명)이 소유할 수 있는 정도
3. **Database per service**: 절대 DB 공유하지 않기
4. **Async first**: 서비스 간 통신은 가능하면 비동기
5. **Observability 필수**: 분산 추적, 중앙 로깅 없으면 디버깅 불가
6. **Contract testing**: 서비스 간 API 계약을 테스트로 보장
7. **운영 역량 확인**: CI/CD, 모니터링, 로깅이 준비되지 않으면 분리하지 마라

---

## Related

- [distributed-systems.md](distributed-systems.md) — Consensus·Service Discovery·Saga
- [system-design.md](system-design.md) — API Gateway·Load Balancer·Reverse Proxy
- [observability.md](observability.md) — 분산 추적·서비스 간 로깅
- [resilience.md](resilience.md) — 서비스 간 timeout·Circuit Breaker
