# API Testing

## REST API 테스트 기본

API 테스트는 프론트엔드 없이 백엔드 로직을 직접 검증한다. UI 변경에 영향받지 않아 안정적이고 빠르다.

## 테스트 범위

### 기능 테스트

* 올바른 HTTP 메서드 사용 (GET, POST, PUT, PATCH, DELETE)
* 요청/응답 형태 검증
* 비즈니스 로직 정확성
* 에러 응답 형태 일관성

### 비기능 테스트

* 인증/인가 (401, 403)
* 입력 검증 (400)
* 속도 제한 (429)
* CORS 설정
* 응답 시간

## HTTP 상태 코드 테스트 매트릭스

```typescript
describe('GET /api/users/:id', () => {
  test('200 — 존재하는 사용자', async () => {
    const res = await request(app).get('/api/users/1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: '1',
      name: expect.any(String),
      email: expect.any(String),
    });
  });

  test('404 — 존재하지 않는 사용자', async () => {
    const res = await request(app).get('/api/users/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      error: 'Not Found',
      message: expect.any(String),
    });
  });

  test('401 — 인증 없이 접근', async () => {
    const res = await request(app).get('/api/users/1');
    // 인증 토큰 없이
    expect(res.status).toBe(401);
  });

  test('403 — 다른 사용자 정보 접근', async () => {
    const res = await request(app)
      .get('/api/users/2')
      .set('Authorization', `Bearer ${user1Token}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/users', () => {
  test('201 — 유효한 생성', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'Alice', email: 'alice@test.com' });
    expect(res.status).toBe(201);
    expect(res.headers.location).toMatch(/\/api\/users\/.+/);
  });

  test('400 — 필수 필드 누락', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'Alice' }); // email 누락
    expect(res.status).toBe(400);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({ field: 'email', message: expect.any(String) })
    );
  });

  test('409 — 중복', async () => {
    await seedUser({ email: 'exists@test.com' });
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'Bob', email: 'exists@test.com' });
    expect(res.status).toBe(409);
  });

  test('422 — 유효성 검증 실패', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ name: '', email: 'invalid' });
    expect(res.status).toBe(422);
  });
});
```

## 계약 테스트 (Contract Testing)

프론트엔드와 백엔드가 **API 계약(contract)**을 합의하고, 양쪽이 계약을 지키는지 독립적으로 검증.

### 왜 필요한가?

* 프론트/백 독립 배포 시 호환성 보장
* "서버에서 응답 구조 바꿨는데 프론트가 터짐" 방지
* 통합 환경 없이도 호환성 검증

### Pact를 이용한 Consumer-Driven Contract

```typescript
// Consumer (프론트엔드) 측
import { PactV3, MatchersV3 } from '@pact-foundation/pact';

const provider = new PactV3({
  consumer: 'WebApp',
  provider: 'UserAPI',
});

test('사용자 목록을 조회할 수 있다', async () => {
  await provider
    .given('사용자가 존재함')
    .uponReceiving('사용자 목록 요청')
    .withRequest({
      method: 'GET',
      path: '/api/users',
      headers: { Accept: 'application/json' },
    })
    .willRespondWith({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: MatchersV3.eachLike({
        id: MatchersV3.string('user-1'),
        name: MatchersV3.string('Alice'),
        email: MatchersV3.email('alice@test.com'),
      }),
    })
    .executeTest(async (mockServer) => {
      const client = new UserApiClient(mockServer.url);
      const users = await client.getUsers();
      expect(users).toHaveLength(1);
      expect(users[0]).toHaveProperty('name');
    });
});
```

```typescript
// Provider (백엔드) 측 검증
import { Verifier } from '@pact-foundation/pact';

test('Provider가 Consumer 계약을 충족한다', async () => {
  const verifier = new Verifier({
    providerBaseUrl: 'http://localhost:3000',
    pactUrls: ['./pacts/webapp-userapi.json'],
    stateHandlers: {
      '사용자가 존재함': async () => {
        await seedUser({ name: 'Alice', email: 'alice@test.com' });
      },
    },
  });

  await verifier.verifyProvider();
});
```

## 스키마 검증

### Zod를 이용한 런타임 스키마 검증

```typescript
import { z } from 'zod';

const UserResponseSchema = z.object({
  id: z.uuid(),                              // v3: z.string().uuid() — deprecated in v4
  name: z.string().min(1),
  email: z.email(),                          // v3: z.string().email() — deprecated in v4
  role: z.enum(['admin', 'member', 'guest']),
  createdAt: z.iso.datetime(),               // v3: z.string().datetime() — deprecated in v4
});

const UsersListSchema = z.object({
  data: z.array(UserResponseSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});

test('응답이 스키마와 일치한다', async () => {
  const res = await request(app).get('/api/users');
  const parsed = UsersListSchema.safeParse(res.body);

  expect(parsed.success).toBe(true);
  if (!parsed.success) {
    console.error('Schema errors:', parsed.error.issues);
  }
});
```

### OpenAPI 스키마 자동 검증

```typescript
import SwaggerParser from '@apidevtools/swagger-parser';

test('응답이 OpenAPI 스펙과 일치한다', async () => {
  const api = await SwaggerParser.validate('./openapi.yaml');
  const res = await request(app).get('/api/users');

  // 응답을 OpenAPI 스키마와 대조
  const schema = api.paths['/api/users'].get.responses['200'].content['application/json'].schema;
  // ajv 등으로 검증
});
```

## API 테스트 도구

### Bruno (오픈소스, Git 친화적)

```yaml
# collections/users/get-users.bru
meta {
  name: Get Users
  type: http
  seq: 1
}

get {
  url: {{baseUrl}}/api/users
  body: none
  auth: bearer {{token}}
}

assert {
  res.status: eq 200
  res.body.data: isArray
  res.responseTime: lessThan 500
}

tests {
  test("should return users array", function() {
    expect(res.body.data).to.be.an('array');
    expect(res.body.data.length).to.be.greaterThan(0);
  });
}
```

### HTTP 파일 (VS Code REST Client)

```http
### 사용자 목록 조회
GET http://localhost:3000/api/users
Authorization: Bearer {{token}}

### 사용자 생성
POST http://localhost:3000/api/users
Content-Type: application/json

{
  "name": "Alice",
  "email": "alice@test.com"
}

### 사용자 삭제
DELETE http://localhost:3000/api/users/{{userId}}
Authorization: Bearer {{adminToken}}
```

## API 테스트 체크리스트

### 기능

* [ ] 모든 HTTP 메서드가 올바르게 동작하는가
* [ ] 응답 상태 코드가 정확한가 (200, 201, 400, 401, 403, 404, 409, 422, 500)
* [ ] 응답 body 구조가 스키마와 일치하는가
* [ ] 페이지네이션이 올바르게 작동하는가
* [ ] 필터/정렬/검색이 올바르게 작동하는가

### 보안

* [ ] 인증 없이 보호된 엔드포인트 접근 시 401
* [ ] 권한 없는 리소스 접근 시 403
* [ ] SQL injection 방어 (파라미터화 쿼리)
* [ ] Rate limiting 적용 여부
* [ ] 민감 데이터가 응답에 포함되지 않는가 (비밀번호 등)

### 에러 처리

* [ ] 에러 응답 형태가 일관적인가
* [ ] 에러 메시지가 사용자 친화적인가
* [ ] 내부 에러 정보가 노출되지 않는가 (스택 트레이스)
* [ ] 잘못된 JSON 입력 시 400을 반환하는가

### 성능

* [ ] 응답 시간이 SLA 이내인가
* [ ] 대용량 데이터 요청 시 페이지네이션이 있는가
* [ ] 불필요한 데이터가 응답에 포함되지 않는가