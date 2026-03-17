---
name: security
description: 보안 코딩 가이드라인을 제공한다. 프론트엔드(XSS, 민감 정보 노출)와 백엔드(인젝션, 인증/인가, CORS) 보안 취약점을 사전에 방지하는 코딩 규칙을 포함한다. 보안 관련 코드 작성·리뷰, 인증/인가 구현, 사용자 입력 처리, CORS 설정 시 사용한다.
---

# 보안 코딩 가이드라인

## 프론트엔드

### XSS 방지

- `dangerouslySetInnerHTML` 사용 금지. 불가피하면 DOMPurify로 sanitize 후 사용
- 사용자 입력을 `innerHTML`로 직접 삽입하지 않는다
- URL 파라미터를 그대로 렌더링하지 않는다 — 반드시 이스케이프/검증 후 사용

### 민감 정보 노출 방지

- API 키, 시크릿을 클라이언트 번들에 포함하지 않는다
- `NEXT_PUBLIC_` 접두사가 붙은 환경변수에 민감 정보를 넣지 않는다
- 서버 전용 값은 Server Component 또는 API Route에서만 접근한다

### CSRF 방어

- 상태 변경 API 호출 시 CSRF 토큰을 포함한다
- `SameSite` 쿠키 속성을 적절히 설정한다

### URL/쿼리 파라미터

- 리다이렉트 URL은 화이트리스트 검증한다 (open redirect 방지)
- 쿼리 파라미터를 DB 쿼리나 파일 경로에 직접 사용하지 않는다

## 백엔드 (NestJS)

### 인증/인가

- 모든 보호 대상 엔드포인트에 Guard를 적용한다
- JWT 검증 로직은 미들웨어/Guard에서 처리한다 (Controller에서 직접 검증 금지)
- 역할 기반 접근 제어가 필요한 엔드포인트에 `@Roles()` 데코레이터를 사용한다

### 인젝션 방지

- 쿼리 파라미터를 직접 SQL/쿼리에 삽입하지 않는다 — Prisma의 파라미터 바인딩을 사용한다
- `$queryRaw`/`$executeRaw` 사용 시 반드시 `Prisma.sql` 태그를 사용한다

### 입력 검증

- 모든 외부 입력은 DTO + `class-validator`로 검증한다
- DTO 없이 `@Body() body: any` 형태로 원시 입력을 받지 않는다
- `whitelist: true` 옵션으로 DTO에 정의되지 않은 필드를 자동 제거한다

### CORS

- origin에 와일드카드 `*`를 사용하지 않는다 (특히 credentials 사용 시)
- 허용 도메인을 명시적으로 나열한다

### Rate Limiting

- 인증 관련 엔드포인트(로그인, 비밀번호 재설정)에 rate limiting을 적용한다

### 에러 응답

- 에러 응답에 스택 트레이스, 내부 경로, DB 스키마 정보를 포함하지 않는다
- 프로덕션에서는 일반화된 에러 메시지만 반환한다
- 상세 에러는 서버 로거에만 기록한다

### 환경 변수

- 시크릿을 코드에 하드코딩하지 않는다
- `.env` 파일은 `.gitignore`에 포함한다

### 헤더 보안

- Helmet 미들웨어를 적용한다

## 공통

- 인증 토큰은 `httpOnly` 쿠키에 저장한다 (localStorage/sessionStorage 지양)
- 토큰 만료를 적절히 설정하고 갱신 로직을 구현한다
- 의존성에 알려진 CVE가 없는지 주기적으로 확인한다
