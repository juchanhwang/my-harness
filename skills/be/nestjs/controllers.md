# NestJS Controllers

> 이 파일은 **NestJS 11** 전용 구현을 다룬다.
> Framework-agnostic REST 설계 원칙(리소스 중심, HTTP method, status code, RFC 9457)은 [../api-design.md](../api-design.md)를 참조하라.

## 목차

1. [Controller 기본 구조](#controller-기본-구조)
2. [HTTP Method Decorator](#http-method-decorator)
3. [Route Parameter Decorators](#route-parameter-decorators)
4. [Status Code & Headers](#status-code--headers)
5. [Response 처리: Standard vs Library-specific](#response-처리-standard-vs-library-specific)
6. [API Versioning (URI/Header/Media Type/Custom)](#api-versioning)
7. [Guards, Interceptors, Pipes 적용](#guards-interceptors-pipes-적용)
8. [Sub-domain Routing](#sub-domain-routing)
9. [Async & RxJS Observable](#async--rxjs-observable)
10. [전체 CRUD 예시](#전체-crud-예시)
11. [안티패턴](#안티패턴)
12. [Related](#related)
13. [References](#references-공식-문서)

> **리소스 중심 URL 설계, HTTP method 의미, status code 선택 기준**은 [../api-design.md](../api-design.md#1-리소스-중심-설계)에 정식 정의가 있다.
> 이 파일은 NestJS decorator 기반의 라우팅/바인딩 구현에 집중한다.

## Controller 기본 구조

```typescript
// src/modules/cats/cats.controller.ts
import { Controller, Get } from '@nestjs/common';
import { CatsService } from './cats.service';
import type { Cat } from './cat.interface';

@Controller('cats') // /cats prefix
export class CatsController {
  constructor(private readonly catsService: CatsService) {}

  @Get()
  findAll(): Promise<readonly Cat[]> {
    return this.catsService.findAll();
  }
}
```

Controller는 **module의 `controllers` 배열에 반드시 등록**해야 Nest가 라우팅 테이블을 생성한다.

```typescript
@Module({
  controllers: [CatsController],
  providers: [CatsService],
})
export class CatsModule {}
```

> **CLI 단축**: `nest g resource cats` 를 쓰면 DTO, service, controller, module이 한 번에 생성된다 (공식 CRUD generator).

## HTTP Method Decorator

공식 문서에 명시된 모든 HTTP method decorator:

| Decorator | HTTP Method | 기본 Status |
|---|---|---|
| `@Get()` | GET | 200 |
| `@Post()` | POST | 201 |
| `@Put()` | PUT | 200 |
| `@Delete()` | DELETE | 200 |
| `@Patch()` | PATCH | 200 |
| `@Options()` | OPTIONS | 200 |
| `@Head()` | HEAD | 200 |
| `@All()` | 모든 method | 200 |

```typescript
@Controller('cats')
export class CatsController {
  @Post()
  create(@Body() dto: CreateCatDto): Promise<Cat> {
    return this.catsService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListCatsQuery): Promise<PaginatedCats> {
    return this.catsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Cat> {
    return this.catsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCatDto): Promise<Cat> {
    return this.catsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.catsService.remove(id);
  }
}
```

### Route Wildcard

```typescript
// Express 5 이상에서 네임드 와일드카드 필요 (공식 문서 경고)
@Get('abcd/*splat') // splat은 와일드카드 이름 — 의미 없음
findAll() { /* ... */ }
```

> **공식 경고 인용**: *"With the latest release of Express (v5), the routing system has become more strict. In pure Express, you must use a named wildcard. ... When it comes to asterisks used in the middle of a route, Express requires named wildcards, while Fastify does not support them at all."*

### 라우트 순서 경고

> **공식 Hint**: *"Routes with parameters should be declared after any static paths. This prevents the parameterized paths from intercepting traffic destined for the static paths."*

```typescript
@Controller('cats')
export class CatsController {
  @Get('featured') // ✅ 먼저: static path
  findFeatured() { /* ... */ }

  @Get(':id') // ✅ 나중: parameterized
  findOne(@Param('id') id: string) { /* ... */ }
}
```

## Route Parameter Decorators

공식 문서가 제공하는 전체 목록 (Express/Fastify 공통):

| Decorator | Express/Fastify 대응 | 타입 힌트 |
|---|---|---|
| `@Request()`, `@Req()` | `req` | platform-specific |
| `@Response()`, `@Res()` | `res` | platform-specific |
| `@Next()` | `next` | function |
| `@Session()` | `req.session` | platform-specific |
| `@Param(key?)` | `req.params` | `Record<string, string>` |
| `@Body(key?)` | `req.body` | DTO 클래스 |
| `@Query(key?)` | `req.query` | DTO 클래스 |
| `@Headers(name?)` | `req.headers` | `Record<string, string>` |
| `@Ip()` | `req.ip` | `string` |
| `@HostParam()` | `req.hosts` | `Record<string, string>` |

```typescript
@Get(':id')
findOne(
  @Param('id') id: string,
  @Query('include') include: string | undefined,
  @Headers('x-request-id') requestId: string,
  @Ip() ip: string,
): Promise<Cat> {
  return this.catsService.findOne(id, { include });
}
```

> **`@Body()`에는 반드시 DTO 클래스**를 써라 (interface 금지). 이유는 [./validation.md](./validation.md#dto를-클래스로-만들어야-하는-이유)에서 설명한다. Nest ValidationPipe는 런타임 reflection이 필요하므로 TypeScript interface(컴파일 후 사라짐)로는 동작하지 않는다.

### Complex Query Parsing

`?filter[where][name]=John` 같은 nested query는 기본 파서로 지원되지 않는다. 공식 문서 예시:

```typescript
// main.ts
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.set('query parser', 'extended'); // Express의 extended parser
```

## Status Code & Headers

### `@HttpCode()`

```typescript
import { HttpCode, HttpStatus } from '@nestjs/common';

@Post()
@HttpCode(HttpStatus.ACCEPTED) // 202
acceptJob(@Body() dto: JobDto): void {
  this.jobsService.enqueue(dto);
}

@Delete(':id')
@HttpCode(HttpStatus.NO_CONTENT) // 204
remove(@Param('id') id: string): Promise<void> {
  return this.catsService.remove(id);
}
```

동적 status code가 필요하면 `@Res({ passthrough: true })`를 쓰거나 exception을 throw 한다 ([./error-handling.md](./error-handling.md) 참조).

### `@Header()`

```typescript
@Post()
@Header('Cache-Control', 'no-store')
@Header('X-Content-Type-Options', 'nosniff')
create(@Body() dto: CreateCatDto): Promise<Cat> {
  return this.catsService.create(dto);
}
```

### `@Redirect()`

```typescript
@Get('docs')
@Redirect('https://docs.nestjs.com', 302)
getDocs(@Query('version') version?: string): { url: string } | undefined {
  if (version === '5') {
    return { url: 'https://docs.nestjs.com/v5/' }; // 반환값이 decorator를 override
  }
  return undefined;
}
```

## Response 처리: Standard vs Library-specific

공식 문서는 두 가지 응답 방식을 명시한다:

### Standard (권장)

값을 `return` 하면 Nest가 자동으로 처리한다. 객체/배열 → JSON, primitive → raw 값.

```typescript
@Get()
findAll(): Promise<Cat[]> {
  return this.catsService.findAll(); // Nest가 자동 JSON 직렬화
}
```

**기본 status code**: GET/PUT/DELETE/PATCH는 200, POST는 201 (공식 문서 인용).

### Library-specific (주의 필요)

`@Res()`를 주입해 직접 응답 객체를 조작. Interceptor, `@HttpCode`, `@Header` 모두 무효화된다.

```typescript
import { Response } from 'express';

@Get()
findAll(@Res() res: Response): void {
  res.status(200).json([]); // Nest 기능 우회
}
```

> **공식 경고 인용**: *"When you inject either `@Res()` or `@Response()` in a method handler, you put Nest into Library-specific mode for that handler, and you become responsible for managing the response. ... you must issue some kind of response by making a call on the response object, or the HTTP server will hang."*

### `passthrough: true` — 혼합 모드

header/cookie만 직접 조작하고 body는 Nest에 맡기는 경우:

```typescript
@Get()
findAll(@Res({ passthrough: true }) res: Response): Promise<Cat[]> {
  res.setHeader('X-Total-Count', '100');
  return this.catsService.findAll(); // 여전히 Nest가 JSON 직렬화
}
```

> **실무 원칙**: 90% 이상의 케이스에서 `@Res()`를 쓸 이유가 없다. 쓰는 순간 platform lock-in, 테스트 어려움, 기능 상실이 함께 온다. 정말 필요한 edge case만 `passthrough: true`로 제한.

## API Versioning

공식 문서는 4가지 versioning 방식을 명시한다. `main.ts`에서 활성화:

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableVersioning({
    type: VersioningType.URI, // 또는 HEADER, MEDIA_TYPE, CUSTOM
    defaultVersion: '1',      // 선택: 버전 미지정 시 기본값
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

### 1. URI Versioning (기본 권장)

```typescript
app.enableVersioning({ type: VersioningType.URI });

@Controller({ path: 'cats', version: '1' })
export class CatsControllerV1 {}

@Controller({ path: 'cats', version: '2' })
export class CatsControllerV2 {}
// → GET /v1/cats, GET /v2/cats
```

> **공식 Notice**: *"With URI Versioning the version will be automatically added to the URI after the global path prefix (if one exists), and before any controller or route paths."* 즉 `/api/v1/cats`처럼 글로벌 prefix와 조합 가능.

### 2. Header Versioning

```typescript
app.enableVersioning({
  type: VersioningType.HEADER,
  header: 'X-API-Version',
});
// Request: X-API-Version: 2
```

### 3. Media Type Versioning

```typescript
app.enableVersioning({
  type: VersioningType.MEDIA_TYPE,
  key: 'v=', // "v=2" 형태
});
// Request: Accept: application/json;v=2
```

### 4. Custom Versioning

```typescript
import type { FastifyRequest } from 'fastify';

app.enableVersioning({
  type: VersioningType.CUSTOM,
  extractor: (request: FastifyRequest): string[] =>
    [String(request.headers['custom-versioning-field'] ?? '')]
      .flatMap((v) => v.split(','))
      .filter(Boolean)
      .sort()
      .reverse(),
});
```

> **공식 경고**: *"Selecting the highest matching version based on the array returned from extractor does not reliably work with the Express adapter due to design limitations. ... Fastify correctly supports both."*

### Route 단위 버전 override

```typescript
@Controller('cats')
export class CatsController {
  @Version('1')
  @Get()
  findAllV1(): string { return 'v1'; }

  @Version(['2', '3']) // 여러 버전 동시 매핑
  @Get()
  findAllV2(): string { return 'v2/v3'; }

  @Version(VERSION_NEUTRAL) // 모든 버전에서 동작
  @Get('ping')
  ping(): 'pong' { return 'pong'; }
}
```

## Guards, Interceptors, Pipes 적용

Controller 또는 handler 레벨에서 각 컴포넌트를 적용할 수 있다. Scope 순서: **Global → Controller → Handler** (좁을수록 우선).

```typescript
import { UseGuards, UseInterceptors, UsePipes } from '@nestjs/common';

@Controller('cats')
@UseGuards(JwtAuthGuard, RolesGuard) // 컨트롤러 전체
@UseInterceptors(LoggingInterceptor)
export class CatsController {
  @Post()
  @UseGuards(RateLimitGuard) // 이 핸들러만 추가
  @UsePipes(new ValidationPipe({ whitelist: true }))
  create(@Body() dto: CreateCatDto): Promise<Cat> {
    return this.catsService.create(dto);
  }
}
```

> Global scope 등록, DI가 가능한 global 컴포넌트(`APP_GUARD`, `APP_INTERCEPTOR`, `APP_PIPE`, `APP_FILTER`) 패턴은 [./request-lifecycle.md](./request-lifecycle.md#global-component-등록-방식)에서 다룬다.

## Sub-domain Routing

공식 예시:

```typescript
@Controller({ host: 'admin.example.com' })
export class AdminController {
  @Get()
  index(): string {
    return 'Admin page';
  }
}

// host parameter
@Controller({ host: ':account.example.com' })
export class AccountController {
  @Get()
  getInfo(@HostParam('account') account: string): string {
    return account;
  }
}
```

> **공식 경고**: *"Since Fastify does not support nested routers, if you are using sub-domain routing, it is recommended to use the default Express adapter instead."*

## Async & RxJS Observable

공식 문서는 두 가지 async 반환 타입을 모두 지원한다고 명시한다.

### async/await (권장)

```typescript
@Get()
async findAll(): Promise<Cat[]> {
  return this.catsService.findAll();
}
```

### RxJS Observable

```typescript
import { Observable, of } from 'rxjs';

@Get()
findAll(): Observable<Cat[]> {
  return of([]);
}
```

> **실무 권장**: 특별한 이유(스트리밍, reactive composition, `@nestjs/microservices`의 `@MessagePattern` 결과)가 없으면 `Promise` 기반으로 통일한다. 코드베이스에 Observable을 섞으면 에러 처리/테스트 복잡도가 크게 올라간다.

## 전체 CRUD 예시

```typescript
// src/modules/cats/cats.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CatsService } from './cats.service';
import { CreateCatDto } from './dto/create-cat.dto';
import { UpdateCatDto } from './dto/update-cat.dto';
import { ListCatsQuery } from './dto/list-cats.query';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { Cat, PaginatedCats } from './cat.types';

@Controller({ path: 'cats', version: '1' })
@UseGuards(JwtAuthGuard)
export class CatsController {
  constructor(private readonly catsService: CatsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCatDto): Promise<Cat> {
    return this.catsService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListCatsQuery): Promise<PaginatedCats> {
    return this.catsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Cat> {
    return this.catsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatDto,
  ): Promise<Cat> {
    return this.catsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.catsService.remove(id);
  }
}
```

**주목할 점**:

- `ParseUUIDPipe` — built-in pipe로 `id`가 유효한 UUID인지 검증. 실패 시 400 반환.
- `@HttpCode(HttpStatus.NO_CONTENT)` — DELETE 는 204가 RFC 권장 ([../api-design.md#2-http-methods--status-codes](../api-design.md#2-http-methods--status-codes) 참조).
- `@Query() query: ListCatsQuery` — DTO 클래스로 타입 안전성 + ValidationPipe 자동 적용.

## 안티패턴

### 1. Controller에 비즈니스 로직 작성

```typescript
// ❌ DB 호출, 복잡한 계산이 controller에 직접
@Post()
async create(@Body() dto: CreateCatDto) {
  const existing = await this.db.query.cats.findFirst({ where: eq(cats.name, dto.name) });
  if (existing) throw new ConflictException();
  // ... 100줄의 로직
}
```

Controller는 HTTP 경계일 뿐이다. 비즈니스 로직은 Service에 위임하라 ([../architecture.md#2-service-layer-pattern](../architecture.md#2-service-layer-pattern)).

### 2. `@Res()` 남용

```typescript
// ❌ 모든 핸들러에 @Res
@Get()
findAll(@Res() res: Response): void {
  res.json(this.catsService.findAll());
}
```

Interceptor, global filter, transform 모두 무효가 된다. 정말 필요한 경우만 `passthrough: true`로.

### 3. Interface로 DTO 선언

```typescript
// ❌ 런타임에 reflection 불가 → ValidationPipe 작동 안 함
interface CreateCatDto {
  name: string;
}

@Post()
create(@Body() dto: CreateCatDto): Promise<Cat> { /* ... */ }
```

항상 `class`로 선언. ([./validation.md](./validation.md#dto를-클래스로-만들어야-하는-이유))

### 4. parameterized 라우트를 static 라우트보다 먼저 선언

```typescript
// ❌ :id가 'search'를 먹어 404
@Get(':id')
findOne() {}

@Get('search')
search() {} // 도달 불가
```

static 먼저, parameterized 나중에.

### 5. Controller에 `providers`로 service가 아닌 값 주입

```typescript
// ❌ controller에 constant 직접 주입
@Controller('cats')
export class CatsController {
  constructor(@Inject('CONFIG') private config: Config) {} // module providers로 등록 필요
}
```

이런 주입은 어차피 module에 provider 등록이 필요하고, controller에서 직접 config 값을 참조하는 것 자체가 SRP 위반이다. Service에서 `ConfigService`를 주입받고 그 결과를 controller로 돌리는 것이 낫다.

### 6. Global prefix와 versioning을 잘못 조합

```typescript
app.setGlobalPrefix('api');
app.enableVersioning({ type: VersioningType.URI });

@Controller({ path: 'cats', version: '1' })
// → GET /api/v1/cats  (OK)
```

순서를 바꾸거나, controller에 `/api`를 또 넣으면 `/api/v1/api/cats`가 된다. 공식 문서의 설명을 따라 global prefix만 `setGlobalPrefix`로 관리하라.

## Related

- [../api-design.md](../api-design.md) — REST 원칙, HTTP method/status, RFC 9457, versioning 전략
- [./request-lifecycle.md](./request-lifecycle.md) — Guards/Interceptors/Pipes 실행 순서
- [./validation.md](./validation.md) — DTO + ValidationPipe
- [./error-handling.md](./error-handling.md) — HttpException, 전역 filter
- [./swagger.md](./swagger.md) — controller/route 문서화
- [../fastify/api-design.md](../fastify/api-design.md) — Fastify route 기반 설계 비교

## References (공식 문서)

- [NestJS Docs — Controllers](https://docs.nestjs.com/controllers) — `@Controller`, HTTP method decorator, param decorator table, status code, header, redirect, route wildcard, sub-domain routing, async/Observable, library-specific response, `passthrough`
- [NestJS Docs — Versioning](https://docs.nestjs.com/techniques/versioning) — 4가지 versioning (URI/Header/Media Type/Custom), `@Version` decorator, `VERSION_NEUTRAL`, `defaultVersion`, middleware versioning
- [NestJS Docs — Custom Decorators](https://docs.nestjs.com/custom-decorators) — `createParamDecorator`, `applyDecorators`
- [NestJS Docs — CRUD Generator Recipe](https://docs.nestjs.com/recipes/crud-generator) — `nest g resource` CLI
