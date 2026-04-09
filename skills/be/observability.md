# Observability

## 목차

1. [Observability의 3대 축](#1-observability의-3대-축)
2. [Structured Logging (Pino)](#2-structured-logging-pino)
3. [Metrics (Prometheus)](#3-metrics-prometheus)
4. [Tracing (OpenTelemetry)](#4-tracing-opentelemetry)
5. [Error Tracking (Sentry)](#5-error-tracking-sentry)
6. [Health Checks](#6-health-checks)
7. [핵심 원칙 요약](#7-핵심-원칙-요약)

## 1. Observability의 3대 축

```
Logs    — 무엇이 일어났는가 (이벤트 기록)
Metrics — 얼마나 일어났는가 (수치 집계)
Traces  — 어떤 경로로 일어났는가 (요청 흐름 추적)
```

세 가지를 조합해야 문제의 원인을 빠르게 파악할 수 있다. 각각의 역할:

* **Logs** — 특정 시점의 이벤트를 검색·필터링. 에러의 상세 컨텍스트
* **Metrics** — 시계열로 집계. "5분간 에러율이 급등했다"
* **Traces** — 분산 시스템에서 요청이 거친 모든 서비스와 경로

## 2. Structured Logging (Pino)

### 로깅 원칙

* **JSON 형식** — 파싱, 검색, 집계가 쉬움
* **요청별 context** — requestId, userId를 모든 로그에 포함
* **레벨 분리** — error/warn/info/debug를 적절히 사용
* **민감 정보 제거** — password, token, 카드번호 등 redact

> **Fastify + Pino 설정**(transport, redact, genReqId)과 **request-scoped child logger 패턴**은 [fastify/observability.md](fastify/observability.md#fastify--pino-설정)에 정식 정의가 있다.
> 이 파일은 framework 중립 logging 이론에 집중한다.

### 로그 구조화 규칙

```typescript
// ✅ 구조화된 로그 — 검색, 필터링, 집계 가능
logger.info({
  event: 'order.created',
  orderId: order.id,
  userId: user.id,
  amount: order.totalAmount,
  itemCount: order.items.length,
}, 'Order created successfully');

// ❌ 비구조화 로그 — 파싱 불가
logger.info(`Order ${order.id} created by user ${user.id} for ${order.totalAmount}`);
```

첫 번째 인자는 **구조화된 context 객체**, 두 번째 인자는 **사람이 읽을 수 있는 메시지**다. ELK, Datadog 등 log aggregator는 JSON 필드를 인덱싱하여 빠른 검색을 제공한다.

### 로그 레벨 가이드

| Level   | 용도                                   | 프로덕션 기본 활성화 |
| ------- | ------------------------------------ | ----------- |
| `fatal` | 프로세스 종료 필요 (OOM, DB 연결 불가)           | ✅           |
| `error` | 요청 실패 (5xx), 외부 연동 실패                | ✅           |
| `warn`  | 비정상이지만 처리됨 (rate limit, deprecation) | ✅           |
| `info`  | 비즈니스 이벤트 (주문, 결제, 가입)                | ✅           |
| `debug` | 상세 디버깅 (SQL, 내부 state)               | ❌           |
| `trace` | 매우 상세 (프레임워크 내부)                     | ❌           |

### 비즈니스 이벤트 로깅

```typescript
// 핵심 비즈니스 로직에서는 비즈니스 로그가 특히 중요
logger.info({
  event: 'transfer.completed',
  fromAccount: transfer.fromAccountId,
  toAccount: transfer.toAccountId,
  amount: transfer.amount,
  currency: 'KRW',
  transactionId: transfer.id,
}, 'Transfer completed successfully');
```

## 3. Metrics (Prometheus)

### 핵심 메트릭 (RED Method)

* **Rate**: 초당 요청 수
* **Errors**: 에러율 (4xx, 5xx)
* **Duration**: 응답 시간 (p50, p95, p99)

RED는 **request-driven system**을 관찰하는 데 적합한 방법론이다. 유사한 방법론으로 USE Method(Utilization, Saturation, Errors — 리소스 중심)가 있다.

### 커스텀 비즈니스 메트릭

```typescript
import { Counter, Histogram, Gauge } from 'prom-client';

// 주문 생성 카운터
const orderCounter = new Counter({
  name: 'orders_created_total',
  help: 'Total number of orders created',
  labelNames: ['status'],
});

// 결제 처리 시간
const paymentDuration = new Histogram({
  name: 'payment_processing_seconds',
  help: 'Payment processing duration',
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

// 활성 커넥션 수
const activeConnections = new Gauge({
  name: 'db_active_connections',
  help: 'Number of active database connections',
});

// 사용
orderCounter.inc({ status: 'completed' });

const timer = paymentDuration.startTimer();
await processPayment();
timer();  // 자동으로 duration 기록
```

메트릭 종류:
* **Counter** — 단조 증가 (요청 수, 에러 수)
* **Histogram** — 분포 (응답 시간, payload 크기) — p50, p95, p99 계산 가능
* **Gauge** — 현재 값 (커넥션 수, 큐 크기) — 증감 가능

> **Fastify의 `fastify-metrics` plugin 설정**(histogram buckets, `/metrics` endpoint)은 [fastify/observability.md](fastify/observability.md#fastify-metrics)에 정식 정의가 있다.

## 4. Tracing (OpenTelemetry)

분산 시스템에서 요청이 여러 서비스를 거칠 때, 각 단계의 시간과 순서를 추적한다.

### 핵심 개념

* **Trace** — 하나의 요청이 만든 전체 흐름 (여러 span의 tree)
* **Span** — 단일 작업 단위 (HTTP request, DB query, 함수 호출)
* **Trace ID** — 모든 span이 공유하는 고유 ID
* **Span ID** — 개별 span 식별자
* **Context propagation** — 서비스 간 trace context 전파 (보통 HTTP 헤더)

### 수동 span 추가

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('order-service');

async function processOrder(orderId: number) {
  return tracer.startActiveSpan('processOrder', async (span) => {
    span.setAttribute('order.id', orderId);

    try {
      await validateOrder(orderId);
      await chargePayment(orderId);
      await sendConfirmation(orderId);

      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

> **OpenTelemetry NodeSDK 초기화**(`NodeSDK`, auto-instrumentation, OTLP exporter)와 **Fastify instrumentation**은 [fastify/observability.md](fastify/observability.md#opentelemetry-fastify-instrumentation)에 정식 정의가 있다.

## 5. Error Tracking (Sentry)

Sentry는 에러를 **스택 트레이스, 사용자 컨텍스트, 브레드크럼**과 함께 수집하여 프로덕션 에러 추적에 특화되어 있다.

### 원칙

* **4xx는 보고하지 않음** — 클라이언트 에러는 noise
* **PII 제거** — `beforeSend` hook에서 authorization, cookie 등 제거
* **Sampling** — 트래픽이 많으면 `tracesSampleRate`로 일부만 수집
* **User context 포함** — `Sentry.captureException(err, { user })`로 재현 가능하게

### 기본 설정

```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  beforeSend(event) {
    // PII 제거
    if (event.request?.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
    }
    return event;
  },
});
```

> **Fastify Sentry plugin 통합**(`onError` hook으로 5xx만 보고, requestId/userId tag)은 [fastify/observability.md](fastify/observability.md#sentry-plugin)와 [fastify/error-handling.md](fastify/error-handling.md#onerror-hook--sentry-통합)에 정식 정의가 있다.

## 6. Health Checks

### Liveness vs Readiness

| 종류 | 목적 | 실패 시 동작 |
|------|------|-------------|
| **Liveness** | 프로세스가 살아있는가? | Kubernetes가 재시작 |
| **Readiness** | 트래픽을 받을 준비가 되었는가? | LB에서 트래픽 제거 |

### 원칙

* **Liveness는 단순하게** — HTTP 200 반환만 (DB 상태 체크 X)
* **Readiness는 의존성 포함** — DB, Redis, 외부 서비스 연결 상태 확인
* **Readiness 실패는 일시적** — 의존성이 복구되면 자동으로 트래픽 재개
* **Graceful Shutdown 중에는 Readiness 실패** — 새 트래픽 차단, 진행 중 요청 완료 대기

> **Fastify health check routes 구현**(liveness `/health`, readiness `/ready`, DB/Redis ping)은 [fastify/observability.md](fastify/observability.md#health-check-routes)에 정식 정의가 있다.
> **Graceful Shutdown 패턴 이론**은 [resilience.md](resilience.md#graceful-shutdown)에 정식 정의가 있다.

## 7. 핵심 원칙 요약

1. **구조화된 로그만** — JSON 형식, 검색/집계 가능
2. **Request ID 전파** — 모든 로그에 requestId 포함
3. **민감 정보 마스킹** — redact 설정 필수
4. **RED 메트릭 기본** — Rate, Errors, Duration
5. **Health check 2종** — `/health` (liveness), `/ready` (readiness)
6. **Graceful shutdown** — 진행 중 요청 완료 후 종료

---

## Related

- [fastify/observability.md](fastify/observability.md) — Fastify + Pino 설정, fastify-metrics, OTel instrumentation, Sentry plugin, health routes
- [debugging.md](debugging.md) — 로그 기반 디버깅·trace 연계
- [error-handling.md](error-handling.md) — 에러 serializer·Pino redact
- [resilience.md](resilience.md) — Graceful Shutdown
- [performance.md](performance.md) — 메트릭·APM 통합
- [message-queues.md](message-queues.md) — BullMQ 메트릭·worker 로깅
