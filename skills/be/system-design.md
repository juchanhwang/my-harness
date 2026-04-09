# System Design

## 목차

1. [시스템 디자인 사고 프레임워크](#시스템-디자인-사고-프레임워크)
2. [Capacity Planning](#capacity-planning)
3. [Load Balancing 전략](#load-balancing-전략)
4. [Database Partitioning / Sharding](#database-partitioning--sharding)
5. [CDN & Reverse Proxy](#cdn--reverse-proxy)
6. [실제 시스템 설계 예제](#실제-시스템-설계-예제)
7. [설계 트레이드오프 정리](#설계-트레이드오프-정리)

## 시스템 디자인 사고 프레임워크

### STAR 프레임워크

1. **S — Scope**: 요구사항 명확화, 기능 범위 결정
2. **T — Traffic**: 트래픽/데이터 규모 추정 (QPS, 저장량, 대역폭)
3. **A — Architecture**: 고수준 아키텍처 설계, 컴포넌트 결정
4. **R — Refine**: 상세 설계, 병목 해결, 트레이드오프 논의

### Step 1: 요구사항 정리

```
Functional Requirements (FR):
- 사용자가 URL을 단축할 수 있다
- 단축 URL로 접근하면 원본 URL로 리다이렉트
- 만료 기간 설정 가능
- 클릭 통계 조회

Non-Functional Requirements (NFR):
- 가용성 99.99%
- 리다이렉트 latency < 100ms
- 단축 URL은 고유하고 예측 불가
```

## Capacity Planning

### QPS 계산

```
DAU (Daily Active Users): 100M
사용자당 하루 읽기 요청: 10
사용자당 하루 쓰기 요청: 1

읽기 QPS = 100M × 10 / 86400 ≈ 11,574 QPS
쓰기 QPS = 100M × 1 / 86400 ≈ 1,157 QPS

피크 QPS (× 3~5배):
  읽기 피크 ≈ 35,000~58,000 QPS
  쓰기 피크 ≈ 3,500~5,800 QPS
```

### Storage 계산

```
일일 새 레코드: 1M
레코드당 크기: 500 bytes
일일 저장량: 1M × 500B = 500MB/day

연간: 500MB × 365 ≈ 180GB/year
5년: ~900GB → 1TB 예상

+ 인덱스 오버헤드 (~30%): ~1.3TB
```

### Bandwidth 계산

```
읽기: 11,574 QPS × 500B ≈ 5.8 MB/s
쓰기: 1,157 QPS × 500B ≈ 0.6 MB/s
피크: × 5 = 읽기 29 MB/s, 쓰기 3 MB/s
```

## Load Balancing 전략

### L4 vs L7

| 레벨        | 작동 계층       | 장점                    | 단점            |
| --------- | ----------- | --------------------- | ------------- |
| L4 (TCP)  | Transport   | 빠름, 간단                | 콘텐츠 기반 라우팅 불가 |
| L7 (HTTP) | Application | URL/헤더 기반 라우팅, SSL 종료 | 상대적으로 느림      |

### 알고리즘

```
Round Robin          — 균등 분배, 가장 단순
Weighted Round Robin — 서버 성능에 따라 가중치
Least Connections    — 현재 연결 수 가장 적은 서버로
IP Hash              — 같은 클라이언트 → 같은 서버 (세션 유지)
Consistent Hashing   — 서버 추가/제거 시 최소한의 재분배
```

### Consistent Hashing

```typescript
import { createHash } from 'crypto';

class ConsistentHash {
  private ring: Map<number, string> = new Map();
  private sortedKeys: number[] = [];
  private readonly replicas: number;

  constructor(replicas: number = 150) {
    this.replicas = replicas;
  }

  private hash(key: string): number {
    const h = createHash('md5').update(key).digest();
    return h.readUInt32BE(0);
  }

  addNode(node: string): void {
    for (let i = 0; i < this.replicas; i++) {
      const key = this.hash(`${node}:${i}`);
      this.ring.set(key, node);
      this.sortedKeys.push(key);
    }
    this.sortedKeys.sort((a, b) => a - b);
  }

  removeNode(node: string): void {
    for (let i = 0; i < this.replicas; i++) {
      const key = this.hash(`${node}:${i}`);
      this.ring.delete(key);
      this.sortedKeys = this.sortedKeys.filter((k) => k !== key);
    }
  }

  getNode(key: string): string {
    const hash = this.hash(key);
    // 해시값보다 크거나 같은 첫 번째 노드 찾기
    for (const ringKey of this.sortedKeys) {
      if (ringKey >= hash) {
        return this.ring.get(ringKey)!;
      }
    }
    // 없으면 첫 번째 노드 (원형)
    return this.ring.get(this.sortedKeys[0])!;
  }
}

// 사용
const ring = new ConsistentHash();
ring.addNode('cache-1');
ring.addNode('cache-2');
ring.addNode('cache-3');

const node = ring.getNode('user:123'); // → 'cache-2'
```

## Database Partitioning / Sharding

### Horizontal Partitioning (Sharding)

같은 테이블의 행을 여러 DB 인스턴스에 분산.

```
Shard Key 선택 기준:
- 카디널리티가 높아야 함 (고유값이 많은 컬럼)
- 쿼리에 자주 사용되는 컬럼
- 균등 분배가 가능한 컬럼

예: user_id로 샤딩
  shard_0: user_id % 4 == 0
  shard_1: user_id % 4 == 1
  shard_2: user_id % 4 == 2
  shard_3: user_id % 4 == 3
```

### Vertical Partitioning

자주 사용하는 컬럼과 아닌 컬럼을 분리.

```sql
-- 분리 전: users 테이블에 모든 컬럼
-- 분리 후:
-- users (자주 조회): id, name, email, status
-- user_profiles (가끔 조회): id, user_id, bio, avatar_url, preferences
```

### PostgreSQL Partitioning

```sql
-- Range partitioning (날짜 기반)
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  total_amount DECIMAL(12,2)
) PARTITION BY RANGE (created_at);

CREATE TABLE orders_2024_q1 PARTITION OF orders
  FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');
CREATE TABLE orders_2024_q2 PARTITION OF orders
  FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');

-- Hash partitioning (균등 분배)
CREATE TABLE events (
  id UUID NOT NULL,
  user_id UUID NOT NULL,
  event_type VARCHAR(50),
  data JSONB
) PARTITION BY HASH (user_id);

CREATE TABLE events_0 PARTITION OF events FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE events_1 PARTITION OF events FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE events_2 PARTITION OF events FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE events_3 PARTITION OF events FOR VALUES WITH (MODULUS 4, REMAINDER 3);
```

## CDN & Reverse Proxy

### CDN

정적 자산(이미지, CSS, JS)을 사용자에 가까운 edge 서버에서 제공.

```
사용자 → CDN Edge (cache hit) → 즉시 응답
사용자 → CDN Edge (cache miss) → Origin Server → CDN에 캐시 → 응답
```

```typescript
// Cloudflare/Vercel 설정 예시
// next.config.js
module.exports = {
  images: {
    domains: ['cdn.example.com'],
    loader: 'custom',
  },
  headers: async () => [
    {
      source: '/static/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
    {
      source: '/api/:path*',
      headers: [
        { key: 'Cache-Control', value: 'no-store' },
      ],
    },
  ],
};
```

### Reverse Proxy (Nginx)

> **Rate Limiting SSOT (infra)**: 이 섹션은 **인프라 레벨 rate limit** (Nginx `limit_req`, API Gateway, Cloudflare 등 네트워크 경계에서의 제한)을 다룬다. 애플리케이션 레벨(`@fastify/rate-limit`, 라우트/사용자 단위 제한)은 [security.md](security.md#4-rate-limiting)에서 다룬다.

```nginx
upstream api_servers {
    least_conn;
    server api-1:3000 weight=3;
    server api-2:3000 weight=2;
    server api-3:3000 weight=1;

    keepalive 32;
}

server {
    listen 80;

    # 정적 파일 직접 서빙
    location /static/ {
        root /var/www;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # API 요청 프록시
    location /api/ {
        proxy_pass http://api_servers;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # Timeouts
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;

        # Rate limiting
        limit_req zone=api burst=20 nodelay;
    }
}
```

## 실제 시스템 설계 예제

### URL Shortener

```
Requirements:
- 단축 URL 생성 (write): ~1000 QPS
- 리다이렉트 (read): ~100,000 QPS (read-heavy)
- URL 7자 (base62): 62^7 = 3.5조 조합

Architecture:
┌─────────┐    ┌──────────┐    ┌─────────────┐
│ Client  │───→│ LB (L7)  │───→│ API Server  │
└─────────┘    └──────────┘    └──────┬──────┘
                                      │
                            ┌─────────┴─────────┐
                            │                   │
                       ┌────▼────┐        ┌─────▼────┐
                       │  Redis  │        │ Postgres │
                       │ (cache) │        │  (store) │
                       └─────────┘        └──────────┘

Key Decisions:
1. ID 생성: Snowflake ID → base62 인코딩
2. 캐시: 인기 URL은 Redis 캐시 (cache-aside, TTL 24h)
3. 301 vs 302: 클릭 통계 필요 → 302 (매번 서버 경유)
4. DB: PostgreSQL (UNIQUE constraint on short_code)
```

```typescript
// URL Shortener 핵심 로직
class UrlShortener {
  private readonly BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

  private toBase62(num: bigint): string {
    let result = '';
    while (num > 0n) {
      result = this.BASE62[Number(num % 62n)] + result;
      num = num / 62n;
    }
    return result.padStart(7, '0');
  }

  async shorten(originalUrl: string): Promise<string> {
    const id = snowflake.generate(); // Snowflake ID
    const shortCode = this.toBase62(BigInt(id));

    await db.insert(urls).values({
      shortCode,
      originalUrl,
      createdAt: new Date(),
    });

    return `https://short.ly/${shortCode}`;
  }

  async resolve(shortCode: string): Promise<string | null> {
    // Cache-aside
    const cached = await redis.get(`url:${shortCode}`);
    if (cached) return cached;

    const url = await db.query.urls.findFirst({
      where: eq(urls.shortCode, shortCode),
    });

    if (url) {
      await redis.setex(`url:${shortCode}`, 86400, url.originalUrl);
      // 비동기로 클릭 수 증가
      await clickQueue.add('increment', { shortCode });
    }

    return url?.originalUrl ?? null;
  }
}
```

### Notification System

```
Requirements:
- 푸시 알림, 이메일, SMS, 인앱 알림
- 일 1억 알림 발송
- 사용자별 알림 설정 (opt-in/out)
- 알림 히스토리 저장

Architecture:
┌──────────┐    ┌───────────────┐    ┌─────────────┐
│ Services │───→│ Notification  │───→│ Message     │
│          │    │ API           │    │ Queue       │
└──────────┘    └───────────────┘    └──────┬──────┘
                                           │
                      ┌────────────────────┼────────────────────┐
                      │                    │                    │
                ┌─────▼─────┐       ┌──────▼──────┐     ┌──────▼──────┐
                │ Push      │       │ Email       │     │ SMS         │
                │ Worker    │       │ Worker      │     │ Worker      │
                └─────┬─────┘       └──────┬──────┘     └──────┬──────┘
                      │                    │                    │
                ┌─────▼─────┐       ┌──────▼──────┐     ┌──────▼──────┐
                │ FCM/APNs  │       │ SES/SendGrid│     │ Twilio      │
                └───────────┘       └─────────────┘     └─────────────┘

Key Decisions:
1. Rate limiting: 사용자당 시간당 최대 알림 수 제한
2. Priority queue: 긴급 알림 > 일반 알림 > 마케팅 알림
3. Template engine: 채널별 알림 템플릿 (HTML, text, push)
4. Deduplication: 같은 알림 중복 발송 방지 (idempotency key)
5. User preferences: Redis에 캐싱 (알림 설정 조회 빈번)
```

## 설계 트레이드오프 정리

| 선택 A        | 선택 B         | 판단 기준                   |
| ----------- | ------------ | ----------------------- |
| SQL         | NoSQL        | 관계 복잡도, 트랜잭션 필요 여부      |
| Sync        | Async        | 실시간 응답 필요 vs 처리 속도      |
| 캐시 추가       | DB 최적화       | 읽기/쓰기 비율, 일관성 요구        |
| Monolith    | Microservice | 팀 규모, 배포 독립성 필요 여부      |
| Push        | Pull         | 실시간 요구, 연결 수            |
| Consistency | Availability | CAP theorem 기반, 비즈니스 요구 |

### 설계 원칙

1. **Start simple**: MVP는 단일 서버, 단일 DB로 시작
2. **Measure first**: 병목을 추측하지 말고, 측정하고 최적화
3. **Scale horizontally**: Stateless 서버 → 수평 확장 용이
4. **Cache aggressively**: 읽기 heavy 시스템은 캐싱이 핵심
5. **Async where possible**: 즉시 응답 불필요한 작업은 큐로
6. **Design for failure**: 모든 외부 의존성은 실패할 수 있다

---

## Related

- [architecture.md](architecture.md) — 애플리케이션 레벨 구조
- [distributed-systems.md](distributed-systems.md) — Consensus·Service Discovery
- [microservices.md](microservices.md) — 서비스 분해·API Gateway
- [deployment.md](deployment.md) — 배포·환경 분리·스케일링
