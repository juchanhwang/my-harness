# Security Testing

> 참조: [OWASP Top 10 (2025)](https://owasp.org/Top10/2025/) — 웹 보안 위협 분류 표준 (2025년판) · [OWASP Web Security Testing Guide (WSTG)](https://owasp.org/www-project-web-security-testing-guide/) · [OWASP ASVS — Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/) · [CWE — Common Weakness Enumeration](https://cwe.mitre.org/) · [MDN — HTTP Security Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers) · [GitHub — CodeQL](https://codeql.github.com/) · [Semgrep Rules](https://semgrep.dev/r)

## 목차

1. [OWASP Top 10 (2025)](#owasp-top-10-2025) — 상위 10가지 취약점 + 대응
2. [의존성 취약점 스캔](#의존성-취약점-스캔) — npm audit, Snyk, Dependabot
3. [보안 헤더 테스트](#보안-헤더-테스트) — CSP, HSTS, X-Frame-Options
4. [Rate Limiting 테스트](#rate-limiting-테스트) — DoS 방지 검증
5. [CI/CD 보안 파이프라인](#cicd-보안-파이프라인) — SAST, DAST, 시크릿 스캔
6. [보안 테스트 체크리스트](#보안-테스트-체크리스트)

***

## OWASP Top 10 (2025)

웹 애플리케이션 보안의 바이블. 상위 10가지 보안 위협과 대응 방법.

### 2021 → 2025 주요 변경 요약

2025년판에서 카테고리가 재편되었다 (출처: [OWASP Top 10 2025](https://owasp.org/Top10/2025/)):

| # | 2025 카테고리 | 2021 대비 변화 |
|---|---|---|
| **A01** | Broken Access Control | 유지 (여전히 #1, 가장 흔한 취약점) |
| **A02** | Security Misconfiguration | 2021 A05 → **승격** (→ §보안 헤더 테스트) |
| **A03** | Software Supply Chain Failures | **신규** — 2021 A06(Vulnerable Components) + A08(Software Integrity)를 통합·확장 (→ §의존성 취약점 스캔) |
| **A04** | Cryptographic Failures | 2021 A02 → 4위로 |
| **A05** | Injection | 2021 A03 → 5위로 (SQL/NoSQL/XSS 포함) |
| **A06** | Insecure Design | 유지 |
| **A07** | Authentication Failures | 리네임 ("Identification and Authentication Failures" → "Authentication Failures") |
| **A08** | Software or Data Integrity Failures | 유지 |
| **A09** | Security Logging and Alerting Failures | 리네임 ("Monitoring" → "Alerting") |
| **A10** | Mishandling of Exceptional Conditions | **신규** (2021 A10 SSRF 대체) |

> 이 문서는 코드 리뷰 시점에서 가장 자주 마주치는 **A01, A04, A05**에 테스트 예시를 집중한다. A02(Security Misconfiguration)는 §보안 헤더 테스트, A03(Software Supply Chain Failures)은 §의존성 취약점 스캔 섹션에서 다룬다.

### A01:2025 Broken Access Control (접근 제어 실패)

가장 흔한 취약점. 테스트 대상 앱의 94%에서 발견.

```typescript
// 테스트: 다른 사용자의 리소스에 접근
test('사용자 A가 사용자 B의 데이터에 접근할 수 없다', async () => {
  const userAToken = await login('userA@test.com');
  const res = await request(app)
    .get('/api/users/userB-id/orders')
    .set('Authorization', `Bearer ${userAToken}`);
  expect(res.status).toBe(403);
});

// 테스트: ID 조작 (IDOR)
test('URL의 ID를 변경해도 다른 사용자 데이터에 접근 불가', async () => {
  const myOrderRes = await request(app)
    .get('/api/orders/my-order-id')
    .set('Authorization', `Bearer ${token}`);
  expect(myOrderRes.status).toBe(200);

  const otherOrderRes = await request(app)
    .get('/api/orders/other-user-order-id')
    .set('Authorization', `Bearer ${token}`);
  expect(otherOrderRes.status).toBe(403);
});

// 테스트: HTTP 메서드 변경
test('일반 사용자가 DELETE 메서드로 접근 불가', async () => {
  const res = await request(app)
    .delete('/api/users/some-id')
    .set('Authorization', `Bearer ${memberToken}`);
  expect(res.status).toBe(403);
});
```

### A04:2025 Cryptographic Failures (암호화 실패)

> 2021 기준으로는 A02. 2025년판에서 4위로 조정되었다.

```typescript
// 테스트: HTTPS 강제
test('HTTP 요청이 HTTPS로 리다이렉트된다', async () => {
  const res = await fetch('http://example.com/api/users', { redirect: 'manual' });
  expect(res.status).toBe(301);
  expect(res.headers.get('location')).toMatch(/^https:/);
});

// 테스트: 민감 데이터 노출
test('비밀번호가 API 응답에 포함되지 않는다', async () => {
  const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
  expect(res.body).not.toHaveProperty('password');
  expect(res.body).not.toHaveProperty('passwordHash');
  expect(JSON.stringify(res.body)).not.toMatch(/password/i);
});

// 테스트: 보안 헤더
test('보안 관련 HTTP 헤더가 설정되어 있다', async () => {
  const res = await request(app).get('/');
  expect(res.headers['strict-transport-security']).toBeDefined();
  expect(res.headers['x-content-type-options']).toBe('nosniff');
  expect(res.headers['x-frame-options']).toBe('DENY');
  expect(res.headers['content-security-policy']).toBeDefined();
});
```

### A05:2025 Injection (인젝션)

> 2021 기준으로는 A03. 2025년판에서 5위로 조정되었으며, XSS(Cross-Site Scripting)는 여전히 Injection 카테고리에 포함된다.

```typescript
// SQL Injection 테스트
const sqlInjectionPayloads = [
  "' OR '1'='1",
  "'; DROP TABLE users;--",
  "1' UNION SELECT * FROM users--",
  "admin'--",
  "1; EXEC xp_cmdshell('dir')",
];

test.each(sqlInjectionPayloads)(
  'SQL injection 공격 차단: %s',
  async (payload) => {
    const res = await request(app)
      .get(`/api/users?search=${encodeURIComponent(payload)}`);
    expect(res.status).not.toBe(500); // 서버 에러가 나면 안 됨
    expect(res.body).not.toHaveProperty('error', expect.stringContaining('SQL'));
  }
);

// NoSQL Injection 테스트
test('NoSQL injection 차단', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({
      email: { $gt: '' },  // MongoDB operator injection
      password: { $gt: '' },
    });
  expect(res.status).toBe(400);
});
```

### XSS (Cross-Site Scripting) 테스트

```typescript
const xssPayloads = [
  '<script>alert("xss")</script>',
  '<img src="x" onerror="alert(1)">',
  '"><script>alert(document.cookie)</script>',
  "javascript:alert('XSS')",
  '<svg onload=alert(1)>',
  '{{constructor.constructor("return this")().alert(1)}}',
];

test.each(xssPayloads)(
  'XSS 페이로드가 이스케이프된다: %s',
  async (payload) => {
    // 입력 저장
    await request(app)
      .post('/api/comments')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: payload });

    // 출력 확인
    const res = await request(app).get('/api/comments');
    const content = JSON.stringify(res.body);
    expect(content).not.toContain('<script>');
    expect(content).not.toContain('onerror=');
    expect(content).not.toContain('onload=');
  }
);
```

### CSRF (Cross-Site Request Forgery) 테스트

```typescript
test('CSRF 토큰 없이 상태 변경 요청 차단', async () => {
  const res = await request(app)
    .post('/api/transfer')
    .set('Cookie', `session=${sessionCookie}`)
    // CSRF 토큰 없이
    .send({ to: 'attacker', amount: 10000 });
  expect(res.status).toBe(403);
});

test('SameSite 쿠키 설정 확인', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'test@test.com', password: 'password' });
  const setCookie = res.headers['set-cookie']?.[0];
  expect(setCookie).toMatch(/SameSite=(Strict|Lax)/i);
  expect(setCookie).toMatch(/HttpOnly/i);
  expect(setCookie).toMatch(/Secure/i);
});
```

## 의존성 취약점 스캔

### npm audit

```bash
# 취약점 확인
npm audit

# JSON 출력 (CI용)
npm audit --json

# 자동 수정 시도
npm audit fix

# 프로덕션 의존성만
npm audit --omit=dev
```

### Snyk

```bash
# 설치 및 인증
npm install -g snyk
snyk auth

# 취약점 스캔
snyk test

# 지속적 모니터링
snyk monitor

# Docker 이미지 스캔
snyk container test node:20-alpine
```

### GitHub Dependabot 설정

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    labels:
      - "dependencies"
      - "security"
    reviewers:
      - "team-qa"
```

## 보안 헤더 테스트

```typescript
test('필수 보안 헤더가 모두 설정되어 있다', async () => {
  const res = await request(app).get('/');

  // HSTS — HTTPS 강제
  expect(res.headers['strict-transport-security'])
    .toMatch(/max-age=\d+/);

  // Content Type 스니핑 방지
  expect(res.headers['x-content-type-options']).toBe('nosniff');

  // 클릭재킹 방지
  expect(res.headers['x-frame-options']).toBe('DENY');

  // CSP — 인라인 스크립트 차단
  const csp = res.headers['content-security-policy'];
  expect(csp).toBeDefined();
  expect(csp).toContain("default-src 'self'");

  // Referrer 정책
  expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');

  // Permissions Policy
  expect(res.headers['permissions-policy']).toBeDefined();
});
```

## Rate Limiting 테스트

```typescript
test('로그인 엔드포인트에 rate limiting이 적용되어 있다', async () => {
  const requests = Array.from({ length: 15 }, () =>
    request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'wrong' })
  );

  const responses = await Promise.all(requests);
  const tooManyRequests = responses.filter(r => r.status === 429);
  expect(tooManyRequests.length).toBeGreaterThan(0);
});
```

## CI/CD 보안 파이프라인

```yaml
# .github/workflows/security.yml
name: Security Scan
on: [push, pull_request]

jobs:
  dependency-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm audit --audit-level=high

  snyk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  codeql:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
      - uses: github/codeql-action/analyze@v3
```

## 보안 테스트 체크리스트

* [ ] OWASP Top 10 항목별 테스트가 있는가
* [ ] SQL/NoSQL injection 방어가 검증되었는가
* [ ] XSS 페이로드가 이스케이프되는가
* [ ] CSRF 보호가 구현되고 테스트되었는가
* [ ] 보안 HTTP 헤더가 설정되어 있는가
* [ ] 인증/인가가 모든 보호된 엔드포인트에서 동작하는가
* [ ] Rate limiting이 적용되어 있는가
* [ ] 의존성 취약점 스캔이 CI에서 실행되는가
* [ ] 민감 데이터가 로그/응답에 노출되지 않는가
* [ ] 비밀번호가 안전하게 해싱되는가 (bcrypt/argon2)