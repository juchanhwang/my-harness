# Security

> 핵심 메시지: **"프론트엔드는 신뢰할 수 없는 환경이다. 모든 보안 검증은 서버에서 한다."**

***

## 1. XSS 방지

```tsx
// ✅ React는 자동으로 XSS를 방지한다 (auto-escaping)
<div>{userInput}</div>  // 안전

// 🔴 dangerouslySetInnerHTML — 반드시 sanitize
import DOMPurify from 'dompurify';

<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlContent) }} />

// ❌ 절대 하지 말 것
<div dangerouslySetInnerHTML={{ __html: userInput }} />  // XSS 취약
```

***

## 2. 인증 토큰 관리

| 저장 위치              | 보안성        | 용도          |
| ------------------- | ---------- | ----------- |
| httpOnly Cookie     | ✅ 가장 안전    | 세션 토큰       |
| Authorization Header | ✅ 안전      | API 요청      |
| localStorage        | ❌ XSS 위험   | 사용 지양       |
| sessionStorage      | ⚠️ 탭 한정    | 임시 데이터만     |

```tsx
// ✅ httpOnly Cookie (서버에서 설정)
// API route 또는 server action에서:
cookies().set('session', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 7, // 7일
});

// ❌ localStorage에 토큰 저장
localStorage.setItem('token', jwt); // XSS에 노출됨
```

***

## 3. CSRF 방지

```tsx
// Next.js Server Actions — 자동 CSRF 토큰
// → Server Actions 사용 시 별도의 CSRF 처리 불필요

// API Route에서 수동 처리:
// 1. 서버에서 CSRF 토큰 생성 → 쿠키에 저장
// 2. 클라이언트가 요청 헤더에 토큰 포함
// 3. 서버에서 쿠키 vs 헤더 값 비교
```

***

## 4. CSP (Content Security Policy)

```tsx
// next.config.js
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Next.js 필수
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self' https://api.example.com",
    ].join('; '),
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
];
```

***

## 5. 환경 변수

```bash
# ✅ 서버 전용 (클라이언트에 노출되지 않음)
DATABASE_URL=postgresql://...
API_SECRET=sk-...

# ✅ 클라이언트 접근 가능 (공개 정보만)
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_SENTRY_DSN=https://...
```

**절대 규칙:** API 키, 데이터베이스 자격증명, 비밀키는 **절대로** `NEXT_PUBLIC_` 접두사를 사용하지 않는다.

***

## ❌ 안티패턴

* **클라이언트에서만 권한 검사**: 서버에서 반드시 재검증
* **localStorage에 민감 데이터**: httpOnly Cookie 사용
* **eval() 사용**: CSP 위반 + 코드 인젝션 위험
* **CORS 완전 개방**: `Access-Control-Allow-Origin: *` → 특정 도메인만 허용
* **에러 메시지에 내부 정보 노출**: 스택 트레이스, 데이터베이스 쿼리 등

***

> 📎 관련: [error-handling.md](error-handling.md)
