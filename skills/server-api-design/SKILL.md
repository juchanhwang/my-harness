---
name: api-design
description: NestJS API 설계 가이드라인을 제공한다. REST 컨벤션, DTO 검증, 응답 포맷 일관성, Controller/Service 책임 분리, 에러 처리 규칙을 포함한다. NestJS 엔드포인트 설계·구현, DTO 작성, Controller/Service 구조 설계, API 에러 처리 구현 시 사용한다.
---

# API 설계 가이드라인

## REST 컨벤션

### URL 설계

- 리소스는 복수형 명사: `/users`, `/posts` (동사 금지: `/getUsers`)
- 계층 관계는 중첩: `/users/:id/posts`
- 2단계 이상 중첩 금지 — 깊어지면 별도 리소스로 분리
- 쿼리 파라미터는 필터링/정렬/페이지네이션 용도: `?status=active&sort=createdAt`

### HTTP 메서드

- `GET` — 조회 (멱등, 부수 효과 없음)
- `POST` — 생성
- `PATCH` — 부분 수정 (PUT보다 PATCH 선호)
- `DELETE` — 삭제

### 상태 코드

- `200` — 성공 (조회, 수정)
- `201` — 생성 성공
- `204` — 삭제 성공 (응답 본문 없음)
- `400` — 잘못된 요청 (validation 실패)
- `401` — 인증 필요
- `403` — 권한 없음
- `404` — 리소스 없음
- `409` — 충돌 (중복 등)
- `500` — 서버 내부 에러 (클라이언트에 구현 상세 노출 금지)

## 응답 포맷

### 성공 응답

- 단일 리소스: 객체 직접 반환 `{ id, name, ... }`
- 리스트: `{ items: [...], totalCount, page, pageSize }`
- 생성: 생성된 리소스 반환

### 에러 응답 (프로젝트 전체 통일)

```json
{
  "statusCode": 400,
  "message": "사용자에게 보여줄 수 있는 메시지",
  "error": "Bad Request"
}
```

### 일관성 규칙

- 같은 종류의 엔드포인트는 동일한 응답 형태를 반환한다
- 페이지네이션 방식을 통일한다
- 에러 응답에 스택 트레이스, 내부 경로 등을 포함하지 않는다

## DTO 검증

### 요청 DTO

- 모든 외부 입력은 DTO로 정의하여 타입 안전성을 확보한다
- `class-validator` 데코레이터로 검증 규칙을 명시한다
- 선택적 필드는 `?`와 `@IsOptional()`을 함께 사용한다
- 수정 DTO는 `PartialType(CreateDto)`로 생성하여 중복을 최소화한다

### 필수 규칙

- Controller의 `@Body()`, `@Param()`, `@Query()`에 반드시 DTO를 적용한다
- 원시 타입(`string`, `number`)을 직접 받지 않는다
- DTO 필드명은 API 응답과 일관성을 유지한다

## Controller/Service 책임 분리

### Controller의 책임 (요청/응답 처리만)

- HTTP 데코레이터 (`@Get`, `@Post`, ...)
- 파라미터 추출 (`@Body`, `@Param`, `@Query`)
- 응답 코드 지정 (`@HttpCode`)
- Service 호출 후 결과 반환

### Controller가 하면 안 되는 것

- 비즈니스 로직 (조건 분기, 계산, 변환)
- 직접적인 DB/외부 API 호출
- 여러 Service를 조합하는 오케스트레이션 (→ 별도 Service로 분리)

### Service의 책임

- 비즈니스 로직
- 데이터 접근 계층 호출
- 트랜잭션 관리

## 에러 처리

### NestJS 에러 처리 패턴

- 비즈니스 에러는 NestJS 내장 예외 사용: `NotFoundException`, `BadRequestException`, `ConflictException`
- 커스텀 에러가 필요하면 `HttpException`을 상속한다
- 예상치 못한 에러는 `ExceptionFilter`에서 일괄 처리한다
- Service에서 HTTP 상태 코드를 직접 다루지 않는다 — 예외 클래스로 표현한다

### 금지 사항

- try/catch로 에러를 삼키지 않는다
- 에러 메시지에 내부 구현 상세를 노출하지 않는다
- 같은 유형의 에러가 다른 상태 코드를 반환하지 않도록 한다
