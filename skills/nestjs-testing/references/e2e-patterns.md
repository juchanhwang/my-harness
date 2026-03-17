# E2E 테스트 패턴

## 목차

- [기본 E2E 설정](#기본-e2e-설정)
- [JWT 인증 흐름](#jwt-인증-흐름)
- [overrideProvider / overrideModule](#overrideprovider--overridemodule)
- [GraphQL E2E](#graphql-e2e)
- [WebSocket E2E](#websocket-e2e)
- [BaseTestHelper 패턴](#basetesthelper-패턴)

---

## 기본 E2E 설정

E2E 테스트는 전체 앱을 부트스트랩하고 HTTP 요청으로 검증한다. **크리티컬 패스만** 작성한다.

```typescript
import * as request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';

describe('Users (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleRef.createNestApplication();
    // 프로덕션과 동일한 파이프/필터 설정
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close(); // 반드시 정리
  });

  it('POST /users — 유효한 데이터로 사용자를 생성한다', () => {
    return request(app.getHttpServer())
      .post('/users')
      .send({ email: 'test@test.com', name: 'Test', password: 'Pass123!' })
      .expect(201)
      .expect(res => {
        expect(res.body).toHaveProperty('id');
        expect(res.body.email).toBe('test@test.com');
        expect(res.body).not.toHaveProperty('password'); // 비밀번호 노출 금지
      });
  });

  it('POST /users — 이메일 누락 시 400', () => {
    return request(app.getHttpServer())
      .post('/users')
      .send({ name: 'Test', password: 'Pass123!' })
      .expect(400);
  });

  it('GET /users/:id — 존재하지 않는 ID는 404', () => {
    return request(app.getHttpServer())
      .get('/users/nonexistent')
      .expect(404);
  });
});
```

---

## JWT 인증 흐름

```typescript
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('POST /auth/login — 유효한 자격증명으로 토큰을 반환한다', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'password' })
      .expect(200);

    expect(res.body).toHaveProperty('accessToken');
    accessToken = res.body.accessToken;
  });

  it('GET /auth/profile — 토큰으로 프로필을 조회한다', () => {
    return request(app.getHttpServer())
      .get('/auth/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(res => {
        expect(res.body).toHaveProperty('email', 'admin@test.com');
      });
  });

  it('GET /auth/profile — 토큰 없으면 401', () => {
    return request(app.getHttpServer())
      .get('/auth/profile')
      .expect(401);
  });

  it('GET /auth/profile — 만료된 토큰은 401', () => {
    return request(app.getHttpServer())
      .get('/auth/profile')
      .set('Authorization', 'Bearer expired.token.here')
      .expect(401);
  });
});
```

---

## overrideProvider / overrideModule

### Provider 교체

```typescript
const module = await Test.createTestingModule({
  imports: [AppModule],
})
  // 방법 1: useValue
  .overrideProvider(EmailService)
  .useValue({ send: jest.fn() })

  // 방법 2: useClass
  .overrideProvider(CacheService)
  .useClass(InMemoryCacheService)

  // 방법 3: useFactory
  .overrideProvider(ConfigService)
  .useFactory({
    factory: () => ({ get: (key: string) => testConfig[key] }),
  })
  .compile();
```

### Module 교체

```typescript
// 중첩 모듈, 동적 모듈, Global 모듈, Lazy-loaded 모듈 모두 지원
const module = await Test.createTestingModule({
  imports: [AppModule],
})
  .overrideModule(DatabaseModule)
  .useModule(TestDatabaseModule)
  .compile();
```

### Guard/Pipe/Interceptor/Filter 교체

```typescript
const module = await Test.createTestingModule({
  imports: [AppModule],
})
  .overrideGuard(JwtAuthGuard)
  .useValue({ canActivate: () => true })

  .overridePipe(ValidationPipe)
  .useValue({ transform: (val: any) => val })

  .overrideInterceptor(LoggingInterceptor)
  .useValue({ intercept: (ctx: any, next: any) => next.handle() })

  .overrideFilter(HttpExceptionFilter)
  .useValue({ catch: jest.fn() })

  .compile();
```

---

## GraphQL E2E

```typescript
const GRAPHQL_ENDPOINT = '/graphql';

describe('Users GraphQL (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => { /* AppModule 부트스트랩 */ });
  afterAll(async () => { await app.close(); });

  it('query getUsers — 사용자 목록을 반환한다', () => {
    return request(app.getHttpServer())
      .post(GRAPHQL_ENDPOINT)
      .send({
        query: `{
          getUsers {
            id
            email
            name
          }
        }`,
      })
      .expect(200)
      .expect(res => {
        expect(res.body.data.getUsers).toBeInstanceOf(Array);
        expect(res.body.data.getUsers[0]).toHaveProperty('email');
      });
  });

  it('mutation createUser — 사용자를 생성한다', () => {
    return request(app.getHttpServer())
      .post(GRAPHQL_ENDPOINT)
      .send({
        query: `
          mutation {
            createUser(input: { email: "new@test.com", name: "New" }) {
              id
              email
            }
          }
        `,
      })
      .expect(200)
      .expect(res => {
        expect(res.body.data.createUser.email).toBe('new@test.com');
      });
  });
});
```

---

## WebSocket E2E

```typescript
import * as io from 'socket.io-client';

describe('Chat Gateway (e2e)', () => {
  let app: INestApplication;
  let socket: ReturnType<typeof io>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ChatGateway],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0); // OS가 포트 자동 할당
  });

  afterAll(async () => {
    socket?.disconnect();
    await app.close();
  });

  it('메시지를 전송하면 응답을 받는다', (done) => {
    const url = await app.getUrl();
    socket = io(url);

    socket.emit('message', { text: 'Hello' }, (response: any) => {
      expect(response.text).toBe('Hello');
      expect(response).toHaveProperty('timestamp');
      done();
    });
  });
});
```

---

## BaseTestHelper 패턴

반복되는 E2E 보일러플레이트를 추상화한다.

```typescript
// test/helpers/test.helper.ts
export abstract class BaseTestHelper {
  public app: INestApplication;

  abstract getModuleBuilder(): Promise<TestingModuleBuilder>;

  async initialize(): Promise<void> {
    const builder = await this.getModuleBuilder();
    const moduleRef = await builder.compile();

    this.app = moduleRef.createNestApplication();
    this.app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await this.app.init();
  }

  async close(): Promise<void> {
    await this.app?.close();
  }

  // HTTP 헬퍼
  get(url: string) { return request(this.app.getHttpServer()).get(url); }
  post(url: string) { return request(this.app.getHttpServer()).post(url); }
  put(url: string) { return request(this.app.getHttpServer()).put(url); }
  delete(url: string) { return request(this.app.getHttpServer()).delete(url); }

  // 인증 헬퍼
  async loginAs(email: string, password: string): Promise<string> {
    const res = await this.post('/auth/login').send({ email, password });
    return res.body.accessToken;
  }

  authenticatedGet(url: string, token: string) {
    return this.get(url).set('Authorization', `Bearer ${token}`);
  }

  authenticatedPost(url: string, token: string) {
    return this.post(url).set('Authorization', `Bearer ${token}`);
  }
}

// test/helpers/app-test.helper.ts
export class AppTestHelper extends BaseTestHelper {
  async getModuleBuilder() {
    return Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn() });
  }
}

// 사용
describe('Orders (e2e)', () => {
  const helper = new AppTestHelper();

  beforeAll(() => helper.initialize());
  afterAll(() => helper.close());

  it('인증된 사용자가 주문을 생성한다', async () => {
    const token = await helper.loginAs('user@test.com', 'password');
    const res = await helper.authenticatedPost('/orders', token)
      .send({ items: [{ productId: '1', quantity: 2 }] })
      .expect(201);

    expect(res.body).toHaveProperty('id');
  });
});
```
