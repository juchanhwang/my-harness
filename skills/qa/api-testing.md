# API Testing

PRD 인수 조건과 FE-BE 계약(`shared/api-contracts.md`, OpenAPI가 있으면 OpenAPI)이 정한 값이 기대값이다. 둘이 정하지 않은 부분은 BE 기준을 기본으로 본다.

- BE 기준: `~/.claude/skills/be/api-design.md`(상태 코드 §2, 에러 응답 §3, 페이지네이션 §5), `~/.claude/skills/be/error-handling.md`(검증 에러 §3), `~/.claude/skills/be/security.md`(rate limit §4, CORS §5)
- 테스트 코드 작성: `~/.claude/skills/be/fastify/testing.md`(`app.inject`), `~/.claude/skills/be/nestjs/testing.md`(Supertest E2E)

## HTTP 상태 코드 테스트 매트릭스

엔드포인트마다 해당하는 코드를 유발하는 요청을 하나씩 보낸다. 400과 422는 구분한다: 스키마·형식 위반은 400, 형식은 맞지만 도메인 규칙에 걸리는 요청은 422다(`be/api-design.md` §2, `be/error-handling.md` §3).

| 코드 | 유발하는 요청 → 확인 |
| --- | --- |
| 200 | 존재하는 리소스 조회·수정 → body가 계약 스키마와 같다 |
| 201 | 유효한 생성 → `Location` 헤더가 새 리소스를 가리킨다 |
| 204 | body 없이 성공하는 요청(삭제 등) → body가 비어 있다 |
| 400 | 필수 필드 누락, 형식 오류, 깨진 JSON → `errors[]`에 문제 필드와 메시지가 있다 |
| 401 | 토큰 없음, 만료 → 보호된 엔드포인트마다 |
| 403 | 로그인했지만 다른 사용자의 리소스·권한 밖 접근 |
| 404 | 존재하지 않는 ID → 에러 body 형식이 다른 에러와 같다 |
| 409 | 같은 값으로 중복 생성, 버전 충돌 |
| 422 | 형식은 맞지만 도메인 규칙 위반(예: 잔액 부족) → 위반 정보가 확장 필드에 있다 |
| 429 | rate limit 초과 |
| 5xx | 서버 오류가 난 응답 → body에 스택 트레이스·내부 정보가 없다 |

## 계약·스키마 확인 항목

계약을 어긴 응답은 FE를 깨뜨린다. 응답마다 대조한다.

- 필드 이름·타입·nullable·필수 여부가 계약과 같다.
- 값의 형식이 스키마와 같다: ID, 이메일, enum 범위, 날짜, 정수·양수.
- 계약에 없는 필드, 특히 민감 정보(비밀번호 해시 등)가 응답에 없다.
- 에러 응답은 RFC 9457이다(`be/api-design.md` §3): `Content-Type: application/problem+json`, `type`·`title`·`status`(HTTP 상태 코드와 같은 값), 필드별 오류는 확장 필드 `errors: [{ field, message }]`.
- 목록 응답은 `data`와 `pagination`을 둔다(§5). cursor(기본)는 `{ nextCursor, hasMore, limit }`, offset은 `{ page, limit, total, totalPages }`.
- URL에 버전이 있다(`/api/v1/...`).

## API 테스트 체크리스트

### 기능

- [ ] 필터·정렬·검색이 동작한다 (`sort`의 `-` 접두사는 내림차순, 복수 정렬은 콤마: `sort=status,-createdAt`)
- [ ] 페이지네이션이 마지막 페이지와 빈 결과에서도 올바르다

### 보안

- [ ] SQL injection 방어 (파라미터화 쿼리)
- [ ] CORS: 허용 목록 밖 `Origin`을 허용하지 않고 `*`를 쓰지 않는다 (`be/security.md` §5)
- [ ] Rate limiting이 적용된다. 계약에 값이 없으면 전역 IP 분당 100회, 로그인 이메일 기준 15분 5회 (`be/security.md` §4)

### 에러 처리

- [ ] 에러 메시지가 사용자 친화적인가

### 성능

- [ ] 응답 시간이 SLA 이내인가
- [ ] 대용량 데이터 요청 시 페이지네이션이 있는가
