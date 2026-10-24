# Security Testing

> 참조: [OWASP Top 10 (2025)](https://owasp.org/Top10/2025/) — 웹 보안 위협 분류 표준 (2025년판) · [OWASP Web Security Testing Guide (WSTG)](https://owasp.org/www-project-web-security-testing-guide/) · [OWASP ASVS — Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/) · [CWE — Common Weakness Enumeration](https://cwe.mitre.org/) · [MDN — HTTP Security Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers) · [GitHub — CodeQL](https://codeql.github.com/) · [Semgrep Rules](https://semgrep.dev/r)

> 📎 이 파일은 QA가 diff에서 확인할 보안 항목만 둔다. 스택별 상세는 FE는 `~/.claude/skills/fe/security.md` §7(AI가 자주 생성하는 보안 실수)·§8(검증 체크리스트), BE는 `~/.claude/skills/be/security.md`와 `~/.claude/skills/be/fastify/security.md`가 기준이다. NestJS는 `~/.claude/skills/be/nestjs/controllers.md`(Guard)와 `~/.claude/skills/be/nestjs/validation.md`(입력 검증)를 본다.

## OWASP Top 10 (2025)

번호는 2025판 기준이다. 2021판과 다르다(Injection은 A05, Security Misconfiguration은 A02, A10은 SSRF가 아니다). 아래 위험 신호가 diff에 하나라도 있으면 finding 후보다.

### A01:2025 Broken Access Control

* 인증만 하고 리소스 소유권(IDOR)을 확인하지 않는다. Server Action은 export 즉시 공개 POST 엔드포인트다. 인증을 Layout·Proxy에만 두고 페이지·DAL·Action에서 다시 검증하지 않는다
* `searchParams`나 클라이언트가 보낸 `role`·`userId`로 권한을 판단한다. `.bind(null, 값)`으로 넘긴 값은 암호화되지 않아 변조된다
* 스키마에 없는 필드를 받아들인다(mass assignment). Fastify는 `additionalProperties: false`, NestJS는 `whitelist`+`forbidNonWhitelisted`로 막는다
* Server Actions 밖의 상태 변경 엔드포인트가 GET이거나, 쿠키 인증인데 `SameSite`가 없다(CSRF)

### A02:2025 Security Misconfiguration

* CORS에 `origin: '*'`를 쓴다(credentials를 쓰면 정확한 origin 목록이어야 한다). `.env*`가 `.gitignore`에 없다. CSP·helmet을 끄거나 완화한다. 보안 헤더가 빠졌다(아래 「그 밖의 확인 항목」)

### A03:2025 Software Supply Chain Failures

* `package.json`·lockfile diff의 새 패키지, 버전 범위 완화(`latest`·`*`), git·URL 의존성, `postinstall`. CI가 `--frozen-lockfile` 없이 설치하거나 액션을 `@master` 같은 움직이는 ref로 참조한다

### A04:2025 Cryptographic Failures

* 비밀번호를 Argon2id로 해싱하지 않는다(평문·가역 암호화·MD5/SHA 단독은 물론 bcrypt도 기준보다 약하다. `be/security.md` §1). JWT secret이 32자 미만이거나 길이를 검증하지 않는다 (`be/security.md` §6)
* 시크릿을 하드코딩하거나 `NEXT_PUBLIC_` 접두사를 붙인다. 응답·RSC props·로그에 민감 필드가 섞인다. 허용 목록(`select`·DTO)이 아니라 `{ password, ...rest }`로 빼면 새 컬럼이 기본으로 노출된다

### A05:2025 Injection

* SQL을 문자열 보간·`sql.raw`로 만들거나 `db.execute()`에 일반 템플릿 리터럴로 조립한다. `sql` 태그 템플릿만 파라미터화된다
* `innerHTML`·`insertAdjacentHTML`·`dangerouslySetInnerHTML`에 이스케이프·sanitize(DOMPurify)되지 않은 사용자 입력이 들어간다. 사용자 입력 URL을 `href`·`src`에 넣는다(`javascript:`)
* body·query·params를 타입까지 스키마로 검증하지 않는다(NoSQL의 `{ $gt: '' }` 연산자 객체 포함). 입력을 `exec`·`path.join`에 이어붙인다

### A06:2025 Insecure Design

* 가격·수량·권한·상태 전이를 클라이언트가 보낸 값으로 신뢰한다. 로그인·가입·OTP·결제 같은 민감 흐름에 횟수 제한이 없다. 중복 요청(이중 결제)에 멱등성이 없다

### A07:2025 Authentication Failures

* 토큰을 `localStorage`에 저장한다(FE 기준 금지, 세션은 httpOnly 쿠키. `fe/security.md` §6). 인증 쿠키에 `HttpOnly`·`Secure`·`SameSite`(Strict 또는 Lax)가 빠졌다
* Access Token 15분·Refresh Token 7일 기준에서 벗어나거나, 재발급 때 이전 Refresh Token을 폐기(rotation)하지 않는다 (`be/security.md` §1)
* JWT를 `decode`만 하고 `verify`(서명·`exp`·알고리즘 고정)하지 않는다

### A08:2025 Software or Data Integrity Failures

* webhook·콜백의 서명 검증이 없다. 신뢰할 수 없는 데이터를 `eval`·`new Function`·`vm`으로 실행·역직렬화한다. 외부 CDN 스크립트에 SRI가 없다

### A09:2025 Security Logging and Alerting Failures

* 비밀번호·토큰·쿠키·카드번호가 로그·에러 추적(Sentry)에 남는다(Pino `redact`, `beforeSend`. `~/.claude/skills/be/observability.md` §2·§5). 인증 실패·권한 거부 같은 보안 이벤트가 기록되지 않는다

### A10:2025 Mishandling of Exceptional Conditions

* catch에서 오류를 삼키고 계속 진행하거나 기본값을 허용으로 둔다(fail-open). 스택·SQL·파일 경로가 응답에 노출된다(서버에만 로깅하고 클라이언트에는 일반 메시지를 준다. `fe/security.md` §7)
* 예외 경로에서 트랜잭션 롤백·락·커넥션 해제가 빠져 부분 상태가 남는다

## 그 밖의 확인 항목

* [ ] **의존성 취약점** — CI에 의존성 audit(`pnpm audit`·`npm audit`), 갱신 자동화(Dependabot 등), SAST(CodeQL 등)가 있는가. review 세션은 audit를 실행하지 않으므로(`references/review.md` 도구 범위) CI 결과로 확인하거나 `Not checked`에 쓴다
* [ ] **보안 헤더** — CSP(production에 `unsafe-eval`·`unsafe-inline` 없음. Next.js는 `proxy.ts`의 nonce 기반 CSP이고 PPR 페이지는 nonce와 호환되지 않아 정적 CSP·SRI를 쓴다. `fe/security.md` §5. Fastify는 `@fastify/helmet`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, 클릭재킹 방지(`X-Frame-Options: DENY` 또는 CSP `frame-ancestors 'none'`), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`가 설정되는가
* [ ] **Rate limit** — 전역은 IP 기준 분당 100회, 로그인은 이메일 기준 15분 5회, 결제·민감 API는 사용자 기준으로 더 엄격하게 둔다(`be/security.md` §4). 인스턴스가 여러 개인데 in-memory 카운터면 실제 한도가 `max × 인스턴스 수`가 되므로 공유 저장소(Redis)를 쓴다. Next.js에는 내장되어 있지 않다(`fe/security.md` §1)

보안 변경에 거부 케이스(비로그인·타인·잘못된 입력) 테스트가 있는지는 `code-review.md` 「테스트」에서 본다.
