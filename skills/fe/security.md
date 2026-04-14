# Security

> 핵심 메시지: **"프론트엔드는 신뢰할 수 없는 환경이다. 모든 보안 검증은 서버에서 한다."**

## 목차

1. [Next.js가 보호하는 것 vs 개발자 책임](#1-nextjs가-보호하는-것-vs-개발자-책임)
2. [Server Actions 보안](#2-server-actions-보안--가장-중요)
3. [라우트 보호 계층](#3-라우트-보호-계층)
4. [데이터 노출 방지](#4-데이터-노출-방지)
5. [CSP](#5-csp-content-security-policy)
6. [인증 토큰 저장](#6-인증-토큰-저장)
7. [안티패턴](#7-안티패턴-ai가-자주-생성하는-보안-실수)
8. [검증 체크리스트](#8-검증-체크리스트)

***

## 1. Next.js가 보호하는 것 vs 개발자 책임

프레임워크가 자동으로 처리하는 영역과 개발자가 반드시 추가해야 하는 영역을 혼동하면 "프레임워크를 쓰니까 안전하다"는 잘못된 안심이 생긴다.

### 프레임워크가 자동 처리

| 항목 | 범위 |
|---|---|
| **XSS 방지** | JSX auto-escaping. `dangerouslySetInnerHTML`를 쓰지 않는 한 안전 |
| **CSRF (Server Actions)** | `Origin` vs `Host`/`X-Forwarded-Host` 헤더 비교, POST 전용, SameSite 쿠키 |
| **Closure 값 암호화** | Server Action closure로 캡처된 값은 AES-GCM으로 자동 암호화 |
| **Action ID 난독화** | 소스 위치 해시로 생성, 빌드마다 재계산 |
| **Dead Code Elimination** | 사용되지 않는 Server Action은 클라이언트 번들에서 제거 |
| **모듈 격리** | `server-only` 패키지를 Client Component에서 import하면 빌드 에러 |
| **Production 에러 해싱** | Production에서 에러 메시지가 클라이언트로 노출되지 않음 |

### 개발자가 반드시 추가

| 항목 | 범위 |
|---|---|
| **인증** | 모든 Server Action / DAL 함수에서 `auth()` 재검증 |
| **인가** | 리소스 소유권 확인 (IDOR 방지) |
| **입력 검증** | Zod로 런타임 검증 — TypeScript 타입은 런타임에 강제되지 않는다 |
| **반환값 최소화** | 전체 DB 레코드가 아닌 필요한 필드만 |
| **속도 제한** | 프레임워크에 내장되지 않음 |
| **SQL Injection 방지** | ORM 또는 parameterized query 사용 |

> 📎 출처: [Next.js Security Guide](https://nextjs.org/blog/security-nextjs-server-components-actions)

***

## 2. Server Actions 보안 — 가장 중요

**Server Action은 export 시 public POST 엔드포인트가 된다.** Action ID만 있으면 누구나 직접 호출할 수 있다. "페이지에서 인증했으니 안전하다"는 **틀린 가정**이다. 페이지 인증은 UI 렌더링만 제어하며, Server Action은 별도 진입점이다.

> 📎 출처: [Next.js data-security.mdx](https://nextjs.org/docs/app/guides/data-security) — "Server Action is reachable via a direct POST request, not just through your application's UI"

### 매 Server Action마다 실행할 5단계

```tsx
'use server'

import { z } from 'zod'
import { auth } from '@/lib/auth'

const DeletePostSchema = z.object({
  postId: z.string().uuid(),
})

export async function deletePost(formData: FormData) {
  // 1. 입력 검증 — TypeScript 타입은 런타임 방어가 아니다
  const parsed = DeletePostSchema.safeParse({
    postId: formData.get('postId'),
  })
  if (!parsed.success) throw new Error('Invalid input')

  // 2. 인증 — 페이지 인증에 의존하지 말고 매번 재검증
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')

  // 3. 인가 — 리소스 소유권 확인 (IDOR 방지)
  const post = await db.post.findUnique({ where: { id: parsed.data.postId } })
  if (post?.authorId !== session.user.id) throw new Error('Forbidden')

  // 4. 실행
  await db.post.delete({ where: { id: parsed.data.postId } })

  // 5. 반환값 최소화 — 전체 레코드 반환 금지
  return { success: true }
}
```

### `.bind()` 주의

Closure로 캡처된 값은 자동 암호화되지만, **`.bind(null, value)`로 전달된 값은 암호화되지 않는다.** 이는 성능 opt-out이다. 민감한 값은 closure로 전달한다.

```tsx
// ❌ bind로 전달 — 암호화되지 않음, 클라이언트에서 변조 가능
const action = deletePost.bind(null, post.id)

// ✅ closure로 전달 — 자동 암호화
const action = async (formData: FormData) => {
  'use server'
  return deletePost(post.id, formData)
}
```

> 📎 출처: Next.js Security Blog — "These are NOT encrypted"

***

## 3. 라우트 보호 계층

Next.js 공식 권장 계층: **Proxy(낙관적) → DAL(확정적) → Page(DAL 호출) → Action(독립 검증)**.

| 계층 | 역할 | 비용 |
|---|---|---|
| **Proxy** (`proxy.ts`) | 쿠키 기반 세션 존재만 확인, 리다이렉트 | 매 요청마다 실행 — DB 조회 금지 |
| **DAL (Data Access Layer)** | DB 세션 검증 + 인가 로직, 모든 데이터 요청의 단일 진입점 | 보안 감사가 집중되는 계층 |
| **Page/Component** | DAL 함수 호출 (직접 인증 X) | DAL이 반환하는 데이터만 사용 |
| **Server Action** | 매번 자체 인증 + 인가 | 페이지 인증과 독립 |

### Layout에서 인증하지 말 것

**Layout은 Partial Rendering으로 클라이언트 네비게이션 시 재실행되지 않는다.** Layout에서만 인증을 검사하면 사용자가 다른 보호된 페이지로 이동할 때 검사가 건너뛰어진다.

```tsx
// ❌ Layout 인증 — 클라이언트 네비게이션 시 재실행 안 됨
export default async function AdminLayout({ children }) {
  const session = await auth()
  if (!session) redirect('/login')
  return <>{children}</>
}

// ✅ 각 페이지 / DAL 호출 시점에 인증
export default async function AdminPage() {
  const session = await requireAuth() // DAL 함수
  return <AdminContent data={await getAdminData(session)} />
}
```

> 📎 출처: [Next.js authentication.mdx](https://nextjs.org/docs/app/guides/authentication) — "be cautious when doing checks in Layouts"

### Proxy에서 흔한 실수

- **DB 조회 수행** — Proxy는 prefetch 포함 모든 요청에서 실행. 쿠키 존재만 확인
- **Deny list 방식** — Allow list로 전환. 새 경로 추가 시 보호 누락 위험
- **Proxy를 유일한 방어선으로 사용** — Proxy는 optimistic check, 실제 데이터 보호는 DAL에서

### proxy.ts 런타임

`proxy.ts`는 **Node.js 런타임**에서 실행된다 (Next.js 15까지의 `middleware.ts`는 Edge Runtime이었다). Node.js API를 자유롭게 쓸 수 있지만, 기존에 Edge Runtime 전제로 작성된 auth 라이브러리 코드가 있다면 호환성 확인이 필요하다.

***

## 4. 데이터 노출 방지

### RSC → Client Component props 직렬화

Server Component에서 Client Component로 전달되는 모든 props는 RSC Protocol을 통해 직렬화되어 클라이언트로 전송된다. **DB 레코드 전체를 그대로 넘기면 비밀번호, 토큰, 내부 필드가 모두 노출된다.**

```tsx
// ❌ DB 레코드 전체 노출
const user = await db.user.findUnique({ where: { id } })
return <Profile user={user} /> // password, refreshToken 등 전부 노출

// ✅ 필요한 필드만 추출
const user = await db.user.findUnique({
  where: { id },
  select: { id: true, name: true, email: true, avatarUrl: true },
})
return <Profile user={user} />
```

### server-only 패키지

민감한 로직이 실수로 Client Component에 번들되는 것을 빌드 타임에 방지한다.

```tsx
// lib/dal.ts
import 'server-only' // 이 파일을 Client Component에서 import하면 빌드 에러

export async function getUserById(id: string) {
  const session = await auth()
  if (!session) throw new Error('Unauthorized')
  return db.user.findUnique({ where: { id } })
}
```

### 환경 변수

`NEXT_PUBLIC_` 접두사가 있는 변수는 **빌드 시 클라이언트 번들에 인라인**된다. 한 번 빌드된 후 제거할 수 없다.

```bash
# ✅ 서버 전용 — 클라이언트에 노출되지 않음
DATABASE_URL=postgresql://...
API_SECRET=sk-...
JWT_SECRET=...

# ✅ 클라이언트 접근 가능 — 공개 정보만
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_SENTRY_DSN=https://...
```

**절대 규칙:** API 키, DB 자격증명, 비밀키, webhook secret은 **절대** `NEXT_PUBLIC_` 접두사를 사용하지 않는다.

### searchParams 신뢰 금지

`searchParams`는 클라이언트가 조작할 수 있는 입력이다. 인가에 사용하면 안 된다.

```tsx
// ❌ URL 파라미터로 권한 결정 — 누구나 ?isAdmin=true 추가 가능
export default async function Page({ searchParams }) {
  const isAdmin = searchParams.get('isAdmin')
  if (isAdmin) return <AdminView />
}

// ✅ 세션에서 권한 확인
export default async function Page() {
  const session = await auth()
  if (session?.user.role === 'admin') return <AdminView />
}
```

***

## 5. CSP (Content Security Policy)

### Nonce 기반 CSP — 엄격한 보안

```tsx
// proxy.ts
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const isDev = process.env.NODE_ENV === 'development'

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''};
    style-src 'self' 'nonce-${nonce}';
    img-src 'self' blob: data:;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `.replace(/\s{2,}/g, ' ').trim()

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', cspHeader)

  return NextResponse.next({ request: { headers: requestHeaders } })
}
```

### `unsafe-eval` / `unsafe-inline` 사용 기준

| 환경 | `unsafe-eval` | `unsafe-inline` |
|---|---|---|
| Development | **필요** — React가 디버깅을 위해 eval 사용 | nonce 대신 사용 가능 |
| Production | **불필요** — React/Next.js production에서 eval 미사용 | nonce 사용 시 **불필요** |

**기존 문서의 `'unsafe-eval' 'unsafe-inline'` 설정은 위험하다.** CSP의 XSS 방어 효과를 무력화한다. Production에서는 nonce 기반을 사용하라.

### PPR과 Nonce 비호환

**Partial Prerendering (PPR)과 nonce 기반 CSP는 호환되지 않는다.** 정적 셸 스크립트가 nonce에 접근할 수 없기 때문이다. PPR을 사용하는 페이지는 정적 CSP(`unsafe-inline` 필요) 또는 SRI 기반 전략을 사용한다.

> 📎 출처: [Next.js CSP Guide](https://nextjs.org/docs/app/guides/content-security-policy)

***

## 6. 인증 토큰 저장

| 저장 위치 | 보안성 | 용도 |
|---|---|---|
| **httpOnly Cookie** | ✅ 가장 안전 | 세션 토큰 (XSS로 접근 불가) |
| **Authorization Header** | ✅ 안전 (단기) | API 요청 시 메모리에서만 관리 |
| **localStorage** | ❌ XSS 취약 | **사용 금지** — 모든 JS 코드가 접근 가능 |
| **sessionStorage** | ⚠️ 탭 한정 | 임시 데이터만 (토큰 금지) |

```tsx
// ✅ httpOnly Cookie (Next.js 16+에서 cookies()는 async)
import { cookies } from 'next/headers'

export async function setSession(token: string) {
  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
}
```

***

## 7. 안티패턴 (AI가 자주 생성하는 보안 실수)

Next.js 공식 문서가 명시한 "흔한 실수" 기반이다.

### Server Action에서 인증 생략

```tsx
// ❌ 공개 POST 엔드포인트로 노출 — 누구나 호출 가능
'use server'
export async function deletePost(postId: string) {
  await db.post.delete({ where: { id: postId } })
}

// ✅ 인증 + 인가
'use server'
export async function deletePost(postId: string) {
  const session = await auth()
  if (!session) throw new Error('Unauthorized')
  const post = await db.post.findUnique({ where: { id: postId } })
  if (post?.authorId !== session.user.id) throw new Error('Forbidden')
  await db.post.delete({ where: { id: postId } })
}
```

### DB 레코드 전체를 Client Component에 전달

```tsx
// ❌ 비밀번호, 토큰 등 내부 필드 노출
const user = await db.user.findUnique({ where: { id } })
return <Profile user={user} />

// ✅ select로 필요한 필드만
const user = await db.user.findUnique({
  where: { id },
  select: { id: true, name: true, email: true },
})
```

### Render 시 사이드 이펙트

```tsx
// ❌ GET 요청으로 mutation — CSRF 위험 패턴
export default async function Page({ searchParams }) {
  if (searchParams.get('logout')) {
    (await cookies()).delete('AUTH_TOKEN')
  }
}

// ✅ Server Action으로 명시적 POST
export async function logoutAction() {
  'use server'
  (await cookies()).delete('AUTH_TOKEN')
  redirect('/login')
}
```

### CORS 완전 개방

```tsx
// ❌ 모든 오리진 허용
headers: { 'Access-Control-Allow-Origin': '*' }

// ✅ 특정 도메인만
headers: {
  'Access-Control-Allow-Origin': 'https://app.example.com',
  'Access-Control-Allow-Credentials': 'true',
}
```

### 에러 메시지에 내부 정보 노출

```tsx
// ❌ 스택 트레이스, SQL 쿼리, 파일 경로 노출
catch (error) {
  return Response.json({ error: error.stack }, { status: 500 })
}

// ✅ 서버에 로깅, 클라이언트에는 일반 메시지
catch (error) {
  console.error('[deletePost]', error)
  return Response.json({ error: '요청을 처리할 수 없습니다' }, { status: 500 })
}
```

***

## 8. 검증 체크리스트

코드 생성 후 반드시 확인. 아는 것과 매번 적용하는 것은 다르다.

### Server Action 작성 시
- [ ] 입력을 Zod로 검증했는가?
- [ ] `auth()`로 세션을 재검증했는가?
- [ ] 리소스 소유권(IDOR)을 확인했는가?
- [ ] 반환값에서 민감 필드를 제거했는가?
- [ ] `.bind()`로 민감 값을 전달하지 않았는가? (closure 사용)

### 데이터 접근 시
- [ ] DB 쿼리에 `select`로 필드를 제한했는가?
- [ ] Client Component props에 민감 필드가 포함되지 않는가?
- [ ] 민감 로직 파일에 `import 'server-only'`가 있는가?

### 환경 변수
- [ ] 비밀키에 `NEXT_PUBLIC_` 접두사가 없는가?
- [ ] `.env*` 파일이 `.gitignore`에 있는가?

### 라우트 보호
- [ ] Layout에서만 인증 검사하지 않는가?
- [ ] Proxy가 DB 조회를 하지 않는가?
- [ ] searchParams를 인가에 사용하지 않는가?

### 사용자 입력 처리
- [ ] `dangerouslySetInnerHTML` 사용 시 DOMPurify로 sanitize했는가?
- [ ] SQL 쿼리가 parameterized되어 있는가? (ORM 사용 권장)
- [ ] 에러 응답에 내부 정보가 노출되지 않는가?

***

> 📎 관련: [forms.md](forms.md) · [error-handling.md](error-handling.md)
