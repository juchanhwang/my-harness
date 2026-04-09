# Deployment

## 목차

1. [Zero-Downtime Deployment 전략](#zero-downtime-deployment-전략)
2. [Feature Flags](#feature-flags)
3. [Backward Compatible Schema Migration](#backward-compatible-schema-migration)
4. [Rollback 전략](#rollback-전략)
5. [Docker Multi-Stage Build](#docker-multi-stage-build)
6. [Railway / Vercel 배포 패턴](#railway--vercel-배포-패턴)
7. [실무 체크리스트](#실무-체크리스트)

## Zero-Downtime Deployment 전략

### Blue-Green Deployment

두 개의 동일한 환경(Blue, Green)을 유지. 하나에 배포 후 트래픽을 전환.

```
Before:  LB ──→ Blue (v1.0) ← active
               Green (idle)

Deploy:  LB ──→ Blue (v1.0) ← active
               Green (v1.1) ← deploying & testing

Switch:  LB ──→ Green (v1.1) ← active
               Blue (v1.0) ← standby (rollback ready)
```

**장점**: 즉시 rollback 가능 (LB 전환만 하면 됨)
**단점**: 인프라 비용 2배

### Canary Deployment

새 버전에 소량의 트래픽만 보내서 검증 후 점진적 확대.

```
Phase 1: 5% → new version, 95% → old version
Phase 2: 25% → new version, 75% → old version
Phase 3: 50% → new version, 50% → old version
Phase 4: 100% → new version
```

### Rolling Deployment

인스턴스를 하나씩 순차적으로 교체.

```
[v1] [v1] [v1] [v1]
[v2] [v1] [v1] [v1]  ← 첫 번째 교체
[v2] [v2] [v1] [v1]
[v2] [v2] [v2] [v1]
[v2] [v2] [v2] [v2]  ← 완료
```

## Feature Flags

배포와 릴리즈를 분리. 코드는 배포하되, 기능은 flag로 제어.

```typescript
// 간단한 Feature Flag 구현
interface FeatureFlag {
  name: string;
  enabled: boolean;
  rolloutPercentage?: number; // 0-100
  allowedUserIds?: string[];
}

class FeatureFlagService {
  private flags = new Map<string, FeatureFlag>();

  async isEnabled(flagName: string, userId?: string): Promise<boolean> {
    const flag = this.flags.get(flagName);
    if (!flag) return false;
    if (!flag.enabled) return false;

    // 특정 사용자 허용
    if (userId && flag.allowedUserIds?.includes(userId)) return true;

    // 점진적 롤아웃
    if (flag.rolloutPercentage !== undefined && userId) {
      const hash = this.hashUserId(userId);
      return hash % 100 < flag.rolloutPercentage;
    }

    return flag.enabled;
  }

  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}

// 사용
app.get('/api/dashboard', async (request, reply) => {
  const useNewDashboard = await featureFlags.isEnabled(
    'new-dashboard',
    request.userId
  );

  if (useNewDashboard) {
    return reply.send(await getNewDashboard(request.userId));
  }
  return reply.send(await getLegacyDashboard(request.userId));
});
```

### 점진적 롤아웃 전략

```
1. 내부 팀 (allowedUserIds) → 1일 검증
2. 5% 사용자 → 1-2일 모니터링
3. 25% → 에러율, latency 확인
4. 50% → A/B 테스트 결과 비교
5. 100% → 전체 롤아웃
6. Flag 정리 → 코드에서 분기 제거
```

## Backward Compatible Schema Migration

새 코드와 이전 코드가 동시에 실행될 수 있으므로, DB 스키마 변경은 backward compatible해야 한다.

### 안전한 변경

```sql
-- ✅ 안전: 새 컬럼 추가 (nullable 또는 default)
ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT NULL;

-- ✅ 안전: 새 테이블 추가
CREATE TABLE user_preferences (...);

-- ✅ 안전: 새 인덱스 (CONCURRENTLY)
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
```

### 위험한 변경 (multi-step 필요)

```sql
-- ❌ 컬럼 이름 변경 → 이전 코드가 깨짐
ALTER TABLE users RENAME COLUMN name TO full_name;

-- ✅ 안전한 컬럼 이름 변경 (3단계)
-- Step 1: 새 컬럼 추가 + 데이터 복사
ALTER TABLE users ADD COLUMN full_name VARCHAR(255);
UPDATE users SET full_name = name;
-- Step 2: 코드를 full_name 사용으로 변경, 배포
-- Step 3: 이전 컬럼 삭제 (다음 배포)
ALTER TABLE users DROP COLUMN name;
```

```sql
-- ❌ NOT NULL 추가 → 이전 코드가 NULL로 insert해서 실패
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;

-- ✅ 안전한 NOT NULL 추가 (3단계)
-- Step 1: 새 코드에서 항상 값을 넣도록 배포
-- Step 2: 기존 NULL 데이터 채우기
UPDATE users SET phone = 'unknown' WHERE phone IS NULL;
-- Step 3: NOT NULL constraint 추가
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
```

## Rollback 전략

### 코드 Rollback

```bash
# 이전 버전으로 즉시 배포
git revert HEAD
git push origin main  # CI/CD가 자동 배포

# 또는 이전 Docker 이미지로 롤백
docker pull myapp:v1.2.3  # 이전 안정 버전
```

### DB Migration Rollback

```typescript
// Drizzle: down migration은 수동 작성 필요
// 각 migration에 rollback SQL 포함

// 0001_add_phone_column.sql
-- up
ALTER TABLE users ADD COLUMN phone VARCHAR(20);

-- down (별도 파일)
ALTER TABLE users DROP COLUMN phone;
```

## Docker Multi-Stage Build

```dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build
RUN npm prune --production

# Stage 2: Production
FROM node:22-alpine AS runner
WORKDIR /app

# 보안: non-root user
RUN addgroup --system app && adduser --system --ingroup app app

# 필요한 파일만 복사
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

USER app

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
```

### .dockerignore

```
node_modules
.git
.env*
*.md
tests
coverage
.github
```

## Railway / Vercel 배포 패턴

### Railway (Backend)

```toml
# railway.toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3

[service]
internalPort = 3000
```

> **Graceful Shutdown 구현**은 [resilience.md](resilience.md#graceful-shutdown)에 정식 정의가 있다. `GracefulShutdown` 클래스가 Fastify hooks + connection 추적 + DB/Redis 종료를 담당한다.

Railway/컨테이너 환경에서는 BullMQ worker도 SIGTERM 시 정리해야 한다. `resilience.md`의 `GracefulShutdown` 구성에 추가:

```ts
gracefulShutdown.register(async () => {
  await worker.close();
});
```

### Vercel (Frontend + Serverless)

```json
// vercel.json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "regions": ["icn1"],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "no-store" }
      ]
    }
  ]
}
```

## 실무 체크리스트

### 배포 전

* [ ] Migration이 backward compatible한가?
* [ ] Feature flag로 새 기능을 제어할 수 있는가?
* [ ] Health check endpoint가 동작하는가?
* [ ] Rollback 계획이 있는가?
* [ ] 환경 변수가 모든 환경에 설정되었는가?

### 배포 후

* [ ] Health check 통과 확인
* [ ] Error rate 모니터링 (배포 전 대비)
* [ ] Latency 변화 확인
* [ ] 주요 기능 smoke test
* [ ] 로그에 이상 없는지 확인

### 원칙

1. **작게, 자주 배포**: 큰 배포 = 큰 위험
2. **Feature flag 활용**: 배포 ≠ 릴리즈
3. **자동화**: 수동 배포는 실수의 원인
4. **Rollback은 항상 가능하게**: 1분 이내 rollback
5. **Canary 먼저**: 전체 배포 전 소수에게 검증

---

## Related

- [architecture.md](architecture.md) — Plugin 기반 모듈 구조
- [observability.md](observability.md) — 프로덕션 로깅·모니터링
- [resilience.md](resilience.md) — Graceful Shutdown·헬스체크
- [security.md](security.md) — 환경 변수 관리·시크릿
