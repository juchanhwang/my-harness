# 인프라 레이어 테스트 패턴

## 목차

- [Guard 테스트](#guard-테스트)
- [Pipe 테스트](#pipe-테스트)
- [Interceptor 테스트](#interceptor-테스트)
- [Exception Filter 테스트](#exception-filter-테스트)
- [Custom Decorator 테스트](#custom-decorator-테스트)
- [APP_GUARD 오버라이드 패턴](#app_guard-오버라이드-패턴)

---

## Guard 테스트

Guard는 `canActivate(context)` 메서드의 반환값을 테스트한다. `ExecutionContext`는 `@golevelup/ts-jest`의 `createMock`을 사용하거나 헬퍼를 작성한다.

### createMock 사용 (권장)

```typescript
import { createMock } from '@golevelup/ts-jest';
import { ExecutionContext } from '@nestjs/common';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('필요한 역할이 없으면 통과시킨다', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createMock<ExecutionContext>();

    expect(guard.canActivate(context)).toBe(true);
  });

  it('올바른 역할을 가진 사용자를 통과시킨다', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const context = createMock<ExecutionContext>();
    context.switchToHttp().getRequest.mockReturnValue({
      user: { role: Role.ADMIN },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('역할이 맞지 않는 사용자를 거부한다', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const context = createMock<ExecutionContext>();
    context.switchToHttp().getRequest.mockReturnValue({
      user: { role: Role.USER },
    });

    expect(guard.canActivate(context)).toBe(false);
  });
});
```

### ExecutionContext 헬퍼 (createMock 없이)

```typescript
function createMockExecutionContext(request: Partial<Request> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => jest.fn(),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn() as any,
    getType: () => 'http',
    getArgs: () => [request, {}, jest.fn()],
    getArgByIndex: (i: number) => [request, {}, jest.fn()][i],
    switchToRpc: () => ({ getData: () => ({}), getContext: () => ({}) }),
    switchToWs: () => ({ getData: () => ({}), getClient: () => ({}) }),
  } as ExecutionContext;
}
```

---

## Pipe 테스트

Pipe는 `transform(value, metadata)` 메서드를 직접 테스트한다. DI가 필요 없는 가장 단순한 테스트다.

```typescript
describe('ParseIntPipe', () => {
  let pipe: ParseIntPipe;

  beforeEach(() => {
    pipe = new ParseIntPipe();
  });

  it('유효한 숫자 문자열을 변환한다', () => {
    expect(pipe.transform('123', { type: 'param', data: 'id' } as any)).toBe(123);
  });

  it('유효하지 않은 값은 BadRequestException을 던진다', () => {
    expect(() => pipe.transform('abc', { type: 'param' } as any))
      .toThrow(BadRequestException);
  });
});
```

### ValidationPipe 통합 테스트

class-validator DTO와 함께 사용하는 경우:

```typescript
describe('CreateUserDto + ValidationPipe', () => {
  let pipe: ValidationPipe;

  beforeEach(() => {
    pipe = new ValidationPipe({ whitelist: true, transform: true });
  });

  it('유효한 DTO를 통과시킨다', async () => {
    const dto = { email: 'test@test.com', name: 'Test', password: 'Pass123!' };
    const result = await pipe.transform(dto, {
      type: 'body',
      metatype: CreateUserDto,
    } as any);
    expect(result).toEqual(dto);
  });

  it('이메일 형식이 틀리면 BadRequestException', async () => {
    const dto = { email: 'invalid', name: 'Test', password: 'Pass123!' };
    await expect(
      pipe.transform(dto, { type: 'body', metatype: CreateUserDto } as any),
    ).rejects.toThrow(BadRequestException);
  });
});
```

---

## Interceptor 테스트

Interceptor는 Observable을 반환하므로 `subscribe` + `done` 콜백 패턴을 사용한다.

```typescript
import { of } from 'rxjs';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
  });

  it('응답을 { data: ... } 형태로 감싼다', (done) => {
    const mockData = { id: 1, name: 'test' };
    const callHandler = { handle: () => of(mockData) };

    interceptor.intercept(createMock<ExecutionContext>(), callHandler).subscribe({
      next: (value) => {
        expect(value).toEqual({ data: mockData });
      },
      complete: () => done(),
    });
  });

  it('null 응답도 감싼다', (done) => {
    const callHandler = { handle: () => of(null) };

    interceptor.intercept(createMock<ExecutionContext>(), callHandler).subscribe({
      next: (value) => {
        expect(value).toEqual({ data: null });
      },
      complete: () => done(),
    });
  });
});
```

### Logging Interceptor (시간 측정)

```typescript
describe('LoggingInterceptor', () => {
  it('요청 처리 시간을 로깅한다', (done) => {
    const logSpy = jest.spyOn(Logger.prototype, 'log');
    const interceptor = new LoggingInterceptor();
    const callHandler = { handle: () => of('result') };

    interceptor.intercept(createMock<ExecutionContext>(), callHandler).subscribe({
      complete: () => {
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ms'));
        done();
      },
    });
  });
});
```

---

## Exception Filter 테스트

### 단위 테스트 (직접 호출)

```typescript
describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
  });

  it('HttpException을 구조화된 응답으로 변환한다', () => {
    const exception = new NotFoundException('사용자를 찾을 수 없습니다');
    const mockJson = jest.fn();
    const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    const mockGetResponse = jest.fn().mockReturnValue({ status: mockStatus });
    const mockGetRequest = jest.fn().mockReturnValue({ url: '/users/999' });

    const host = {
      switchToHttp: () => ({
        getResponse: mockGetResponse,
        getRequest: mockGetRequest,
      }),
    } as unknown as ArgumentsHost;

    filter.catch(exception, host);

    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockJson).toHaveBeenCalledWith({
      statusCode: 404,
      message: '사용자를 찾을 수 없습니다',
      timestamp: expect.any(String),
      path: '/users/999',
    });
  });
});
```

### E2E 테스트 (supertest)

```typescript
it('존재하지 않는 리소스 요청 시 필터가 적용된다', () => {
  return request(app.getHttpServer())
    .get('/users/999')
    .expect(404)
    .expect(res => {
      expect(res.body).toHaveProperty('statusCode', 404);
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('timestamp');
    });
});
```

---

## Custom Decorator 테스트

### Param Decorator

```typescript
// 대상
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return data ? request.user?.[data] : request.user;
  },
);

// 테스트
describe('CurrentUser Decorator', () => {
  const mockUser = { id: 1, email: 'test@example.com', role: 'admin' };

  it('전체 user 객체를 반환한다', () => {
    const ctx = createMock<ExecutionContext>();
    ctx.switchToHttp().getRequest.mockReturnValue({ user: mockUser });

    // createParamDecorator의 factory 함수를 직접 테스트하기 어려우므로
    // E2E 테스트로 검증하거나, factory 로직을 별도 함수로 추출
    const extractUser = (data: string | undefined, request: any) =>
      data ? request.user?.[data] : request.user;

    expect(extractUser(undefined, { user: mockUser })).toEqual(mockUser);
    expect(extractUser('email', { user: mockUser })).toBe('test@example.com');
  });
});
```

### Metadata Decorator (Reflector)

```typescript
// 대상
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);

// 테스트 — Guard 테스트에서 자연스럽게 검증됨
it('Roles 데코레이터가 메타데이터를 설정한다', () => {
  @Controller()
  class TestController {
    @Roles(Role.ADMIN, Role.MANAGER)
    @Get()
    test() {}
  }

  const reflector = new Reflector();
  const roles = reflector.get<Role[]>('roles', TestController.prototype.test);
  expect(roles).toEqual([Role.ADMIN, Role.MANAGER]);
});
```

---

## APP_GUARD 오버라이드 패턴

전역 Guard를 E2E 테스트에서 교체하려면, 프로덕션 모듈에서 반드시 `useExisting` 패턴을 사용해야 한다.

### 프로덕션 설정 (필수)

```typescript
// app.module.ts
@Module({
  providers: [
    JwtAuthGuard,  // 먼저 일반 provider로 등록
    {
      provide: APP_GUARD,
      useExisting: JwtAuthGuard,  // ❗ useClass가 아닌 useExisting
    },
  ],
})
export class AppModule {}
```

### 테스트에서 오버라이드

```typescript
// useExisting이므로 overrideProvider가 동작한다
const module = await Test.createTestingModule({
  imports: [AppModule],
})
  .overrideProvider(JwtAuthGuard)
  .useValue({ canActivate: () => true })  // 인증 우회
  .compile();
```

> `useClass`로 등록하면 `overrideProvider`가 동작하지 않는다. 이것은 NestJS의 알려진 동작이며, `useExisting`이 공식 권장 패턴이다.
