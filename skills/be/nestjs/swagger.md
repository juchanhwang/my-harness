# NestJS Swagger (OpenAPI)

> 이 파일은 **NestJS 11 + `@nestjs/swagger`** 전용 구현을 다룬다.
> Framework-agnostic API 설계 원칙(RESTful URL, HTTP method, versioning)은 [../api-design.md](../api-design.md)에 정식 정의가 있다.

## 목차

1. [설치 & 부트스트랩](#설치--부트스트랩)
2. [`DocumentBuilder`](#documentbuilder)
3. [`@ApiProperty` — DTO 스키마](#apiproperty--dto-스키마)
4. [Operation Decorator — `@ApiOperation`, `@ApiResponse`](#operation-decorator)
5. [Parameter Decorator — `@ApiQuery`, `@ApiParam`, `@ApiBody`, `@ApiHeader`](#parameter-decorator)
6. [Security — Bearer, Basic, OAuth2, Cookie](#security)
7. [Schema 재사용 — `@ApiExtraModels`, `getSchemaPath`](#schema-재사용)
8. [API Versioning과 Swagger](#api-versioning과-swagger)
9. [CLI Plugin (자동 decorator 생성)](#cli-plugin)
10. [안티패턴](#안티패턴)
11. [Related](#related)
12. [References](#references-공식-문서)

> **RESTful URL 설계, HTTP method 선택, RFC 9457 Problem Details, pagination 설계**는 [../api-design.md](../api-design.md)에 정식 정의가 있다.
> 이 파일은 NestJS decorator 기반 OpenAPI 문서 생성에 집중한다.

## 설치 & 부트스트랩

```bash
npm i @nestjs/swagger
```

공식 문서의 부트스트랩 코드 (`main.ts`):

```typescript
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('My API')
    .setDescription('Production API for X service')
    .setVersion('1.0.0')
    .addBearerAuth() // JWT
    .addTag('users', 'User management endpoints')
    .addTag('orders', 'Order endpoints')
    .build();

  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory, {
    swaggerOptions: {
      persistAuthorization: true, // 새로고침 후에도 토큰 유지
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

> **공식 Hint 인용**: *"The factory method `SwaggerModule.createDocument()` is used specifically to generate the Swagger document when you request it. This approach helps save some initialization time."*
>
> `documentFactory`를 함수로 전달하면 첫 요청 시에만 document를 생성하므로 부트스트랩이 빨라진다.

### 접근 경로

- `http://localhost:3000/api` — Swagger UI
- `http://localhost:3000/api-json` — JSON 정의 (client SDK 생성용)
- `http://localhost:3000/api-yaml` — YAML 정의

Production에서는 Swagger UI를 **인증 뒤에 숨기거나 공개 제외**하는 것이 좋다.

```typescript
if (process.env.NODE_ENV !== 'production') {
  SwaggerModule.setup('api', app, documentFactory);
}
```

> **Fastify + Helmet CSP 주의** (공식 경고):
>
> ```typescript
> app.register(helmet, {
>   contentSecurityPolicy: {
>     directives: {
>       defaultSrc: [`'self'`],
>       styleSrc: [`'self'`, `'unsafe-inline'`],
>       imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
>       scriptSrc: [`'self'`, `https: 'unsafe-inline'`],
>     },
>   },
> });
> ```

## `DocumentBuilder`

`DocumentBuilder`는 OpenAPI Specification(OAS) base document를 fluent 방식으로 구성한다. 공식 API:

| 메서드 | 용도 |
|---|---|
| `.setTitle(title)` | API 제목 |
| `.setDescription(desc)` | 설명 |
| `.setVersion(version)` | API 버전 |
| `.setContact(name, url, email)` | 연락처 |
| `.setLicense(name, url)` | 라이센스 |
| `.setExternalDoc(desc, url)` | 외부 문서 링크 |
| `.setTermsOfService(url)` | 이용약관 |
| `.addServer(url, desc?, variables?)` | 서버 URL 추가 (multi-env) |
| `.addTag(name, desc?)` | 태그 정의 |
| `.addBearerAuth(options?, name?)` | JWT Bearer |
| `.addBasicAuth()` | HTTP Basic |
| `.addCookieAuth(cookieName)` | 쿠키 인증 |
| `.addOAuth2()` | OAuth2 |
| `.addApiKey(options, name?)` | API Key (header/query) |
| `.addSecurity(name, options)` | custom security scheme |
| `.build()` | `OpenAPIObject` 반환 |

### Multi-server 예시

```typescript
const config = new DocumentBuilder()
  .setTitle('My API')
  .addServer('https://api.example.com', 'Production')
  .addServer('https://staging-api.example.com', 'Staging')
  .addServer('http://localhost:3000', 'Local')
  .build();
```

## `@ApiProperty` — DTO 스키마

공식 문서 인용: *"In order to make the class properties visible to the `SwaggerModule`, we have to either annotate them with the `@ApiProperty()` decorator or use the CLI plugin."*

```typescript
// src/modules/users/dto/create-user.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'User email',
    example: 'alice@example.com',
    format: 'email',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'Full name',
    minLength: 2,
    maxLength: 50,
    example: 'Alice Smith',
  })
  @IsString()
  @Length(2, 50)
  name!: string;

  @ApiProperty({
    description: 'Age in years',
    minimum: 13,
    maximum: 130,
    example: 25,
  })
  @IsInt()
  @Min(13)
  @Max(130)
  age!: number;

  @ApiPropertyOptional({
    description: 'Optional short bio',
    maxLength: 500,
    example: 'Software engineer',
  })
  @IsOptional()
  @IsString()
  bio?: string;
}
```

> `@ApiPropertyOptional()`은 `@ApiProperty({ required: false })`의 short-hand.

### Array / Enum / Nested

```typescript
// Array
@ApiProperty({ type: [String], description: 'List of tags' })
tags!: string[];

// Enum with reusable schema
enum UserRole {
  Admin = 'Admin',
  User = 'User',
}

@ApiProperty({ enum: UserRole, enumName: 'UserRole' })
role!: UserRole;
// enumName이 있어야 client code generator가 enum 중복 정의를 피함

// Nested DTO
@ApiProperty({ type: AddressDto })
address!: AddressDto;

// Circular dependency — lazy function 필수
@ApiProperty({ type: () => Node })
parent!: Node;
```

## Operation Decorator

### `@ApiOperation` — 엔드포인트 설명

```typescript
import { ApiOperation } from '@nestjs/swagger';

@ApiOperation({
  summary: 'Create a new user',
  description: 'Creates a user and returns the created entity with an auto-generated ID',
  operationId: 'createUser', // client SDK의 메서드 이름
})
@Post()
create(@Body() dto: CreateUserDto): Promise<UserResponseDto> { /* ... */ }
```

### `@ApiResponse` — 응답 스키마

각 status code마다 별도로 선언. 공식에서 제공하는 short-hand도 존재.

```typescript
import {
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
} from '@nestjs/swagger';

@Post()
@ApiCreatedResponse({ description: 'User created', type: UserResponseDto })
@ApiBadRequestResponse({ description: 'Validation failed' })
@ApiConflictResponse({ description: 'Email already in use' })
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
create(@Body() dto: CreateUserDto): Promise<UserResponseDto> { /* ... */ }

@Get(':id')
@ApiOkResponse({ description: 'User found', type: UserResponseDto })
@ApiNotFoundResponse({ description: 'User not found' })
findOne(@Param('id') id: string): Promise<UserResponseDto> { /* ... */ }
```

`@ApiResponse` 전체 목록:
- `@ApiOkResponse` (200)
- `@ApiCreatedResponse` (201)
- `@ApiAcceptedResponse` (202)
- `@ApiNoContentResponse` (204)
- `@ApiMovedPermanentlyResponse`, `@ApiFoundResponse`
- `@ApiBadRequestResponse` (400)
- `@ApiUnauthorizedResponse` (401)
- `@ApiForbiddenResponse` (403)
- `@ApiNotFoundResponse` (404)
- `@ApiMethodNotAllowedResponse` (405)
- `@ApiNotAcceptableResponse` (406)
- `@ApiConflictResponse` (409)
- `@ApiGoneResponse` (410)
- `@ApiPayloadTooLargeResponse` (413)
- `@ApiUnsupportedMediaTypeResponse` (415)
- `@ApiUnprocessableEntityResponse` (422)
- `@ApiTooManyRequestsResponse` (429)
- `@ApiInternalServerErrorResponse` (500)
- `@ApiNotImplementedResponse` (501)
- `@ApiBadGatewayResponse` (502)
- `@ApiServiceUnavailableResponse` (503)
- `@ApiGatewayTimeoutResponse` (504)

## Parameter Decorator

### `@ApiQuery`, `@ApiParam`

```typescript
@Get()
@ApiQuery({ name: 'page', type: Number, required: false, example: 1 })
@ApiQuery({ name: 'limit', type: Number, required: false, example: 20 })
@ApiQuery({
  name: 'role',
  enum: UserRole,
  required: false,
  description: 'Filter by role',
})
findAll(
  @Query('page') page = 1,
  @Query('limit') limit = 20,
  @Query('role') role?: UserRole,
) {}

@Get(':id')
@ApiParam({ name: 'id', type: String, format: 'uuid', description: 'User ID' })
findOne(@Param('id') id: string) {}
```

### `@ApiBody`

```typescript
@Post('bulk')
@ApiBody({ type: [CreateUserDto], description: 'Array of users to create' })
createBulk(@Body() users: CreateUserDto[]) {}
```

공식 문서 인용: *"Since TypeScript does not store metadata about generics or interfaces, when you use them in your DTOs, SwaggerModule may not be able to properly generate model definitions at runtime."* 배열은 반드시 `type: [Dto]` 형태로 명시.

### `@ApiHeader`

```typescript
@ApiHeader({
  name: 'X-Request-ID',
  description: 'Client-provided request ID for tracing',
  required: false,
})
@Get()
findAll(@Headers('x-request-id') requestId?: string) {}
```

### `@ApiTags` — controller/operation 그룹화

```typescript
@ApiTags('users')
@Controller('users')
export class UsersController { /* 모든 메서드가 users 태그 */ }
```

## Security

### Bearer JWT

```typescript
// DocumentBuilder에 security scheme 선언
const config = new DocumentBuilder()
  .addBearerAuth({
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  })
  .build();
```

```typescript
// Controller 또는 method에 적용
import { ApiBearerAuth } from '@nestjs/swagger';

@ApiBearerAuth()
@Controller('users')
export class UsersController {}
```

### Custom API Key (Header)

```typescript
const config = new DocumentBuilder()
  .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'api-key')
  .build();
```

```typescript
@ApiSecurity('api-key')
@Controller('admin')
export class AdminController {}
```

### OAuth2

```typescript
const config = new DocumentBuilder()
  .addOAuth2({
    type: 'oauth2',
    flows: {
      authorizationCode: {
        authorizationUrl: 'https://auth.example.com/authorize',
        tokenUrl: 'https://auth.example.com/token',
        scopes: {
          'read:users': 'Read users',
          'write:users': 'Write users',
        },
      },
    },
  })
  .build();

// Controller
@ApiOAuth2(['read:users'])
@Get()
findAll() {}
```

## Schema 재사용

공식 문서 인용: *"When you have circular dependencies between classes, use a lazy function to provide the SwaggerModule with type information: `@ApiProperty({ type: () => Node })`"*.

### `@ApiExtraModels` + `getSchemaPath`

DTO가 직접 controller parameter로 쓰이지 않지만 schema에 등장해야 할 때 (예: discriminated union, wrapper type).

```typescript
import { ApiExtraModels, getSchemaPath, ApiOkResponse } from '@nestjs/swagger';

@ApiExtraModels(PaginationMeta, UserResponseDto)
@Get()
@ApiOkResponse({
  schema: {
    allOf: [
      { $ref: getSchemaPath(PaginationMeta) },
      {
        properties: {
          items: {
            type: 'array',
            items: { $ref: getSchemaPath(UserResponseDto) },
          },
        },
      },
    ],
  },
})
findAll(): Promise<Paginated<UserResponseDto>> { /* ... */ }
```

### Generic wrapper 패턴

```typescript
// src/common/dto/paginated.dto.ts
export class PaginatedDto<T> {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  items!: T[];
}
```

```typescript
// usage
@ApiOkResponse({
  schema: {
    allOf: [
      { $ref: getSchemaPath(PaginatedDto) },
      {
        properties: {
          items: {
            type: 'array',
            items: { $ref: getSchemaPath(UserResponseDto) },
          },
        },
      },
    ],
  },
})
```

## API Versioning과 Swagger

NestJS URI versioning을 쓰면 Swagger가 자동으로 `v1`, `v2` 엔드포인트를 모두 문서화한다. 별도 설정 불필요.

```typescript
// main.ts
app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
// DocumentBuilder에는 버전 정보가 별도로 들어가지 않음 — 라우트에 반영됨
```

버전별로 **별도 Swagger document**를 원한다면:

```typescript
for (const version of ['1', '2'] as const) {
  const config = new DocumentBuilder()
    .setTitle(`My API v${version}`)
    .setVersion(version)
    .build();

  const doc = SwaggerModule.createDocument(app, config, {
    include: [], // 각 버전의 module만 선택적으로
  });
  SwaggerModule.setup(`api/v${version}`, app, doc);
}
```

## CLI Plugin

공식 문서 인용: *"Instead of manually annotating each property, consider using the Swagger plugin which will automatically provide this for you."*

### 활성화

```json
// nest-cli.json
{
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "plugins": [
      {
        "name": "@nestjs/swagger",
        "options": {
          "classValidatorShim": true,
          "introspectComments": true,
          "dtoFileNameSuffix": [".dto.ts", ".entity.ts"]
        }
      }
    ]
  }
}
```

이 플러그인은 다음을 자동으로 수행:

1. `CreateUserDto.email: string` → `@ApiProperty({ type: String, required: true })` 자동 추가
2. Optional 속성(`?` 또는 `@IsOptional()`) → `required: false`
3. `class-validator` decorator → schema 제약 변환 (`@Min`, `@MaxLength` 등)
4. JSDoc comment → `description` 자동 변환

> **권장**: 큰 프로젝트에서는 CLI plugin을 꼭 쓴다. 수백 개 DTO에 `@ApiProperty()`를 수작업하는 것은 유지보수 지옥이다.

## 안티패턴

### 1. `@ApiProperty` 없이 DTO가 빈 schema

```typescript
// ❌ Swagger UI에서 "empty object"로 표시됨
export class CreateUserDto {
  email!: string;
  password!: string;
}
```

각 필드에 `@ApiProperty()`를 붙이거나 CLI plugin을 활성화하라.

### 2. Response DTO 대신 Entity를 노출

```typescript
// ❌ password, 내부 필드까지 swagger에 노출
@ApiOkResponse({ type: UserEntity })
findOne() {}
```

`UserResponseDto`처럼 공개용 DTO를 만들어 반환하라 ([./validation.md#response-dto--serialization](./validation.md#response-dto--serialization)).

### 3. Production에 Swagger UI 공개

```typescript
// ❌ 프로덕션에서 전체 API 구조가 노출
SwaggerModule.setup('api', app, doc);
```

Production에서는 조건부로 비활성화하거나 auth 뒤에 숨겨라.

### 4. Enum을 `enumName` 없이 여러 DTO에서 사용

```typescript
// ❌ client code generator가 중복 enum 생성
@ApiProperty({ enum: UserRole })
role!: UserRole;
```

`enumName: 'UserRole'`을 지정해 재사용 가능한 schema로 만들어라 (공식 문서 명시).

### 5. 배열을 plain 타입으로 선언

```typescript
// ❌ Swagger가 타입을 추론 못함
@ApiProperty()
items!: Item[];
```

`type: [Item]` 또는 `isArray: true` 명시.

### 6. `operationId` 충돌

```typescript
// ❌ 두 controller에 findAll 메서드가 있으면 operationId 중복 → 클라이언트 SDK 생성 실패
```

`SwaggerDocumentOptions.operationIdFactory`로 controller 이름을 포함시키거나 `@ApiOperation({ operationId: 'users.findAll' })`로 명시하라.

```typescript
const options: SwaggerDocumentOptions = {
  operationIdFactory: (controllerKey, methodKey) =>
    `${controllerKey.replace('Controller', '').toLowerCase()}.${methodKey}`,
};
```

### 7. 민감 필드에 `@ApiProperty` 유지

```typescript
// ❌ passwordHash가 응답 스키마에 노출
@ApiProperty()
passwordHash!: string;
```

Response DTO에서는 민감 필드를 아예 제거하거나 `@ApiHideProperty()`를 쓴다 (단 `@ApiHideProperty`는 `applyDecorators` 합성 불가 — 공식 경고).

## Related

- [../api-design.md](../api-design.md) — RESTful 설계, HTTP method, RFC 9457
- [./validation.md](./validation.md) — DTO + class-validator (swagger와 함께)
- [./controllers.md](./controllers.md) — controller/route 정의
- [./error-handling.md](./error-handling.md) — RFC 9457 Problem Details 응답 스키마
- [../fastify/api-design.md](../fastify/api-design.md) — Fastify `@fastify/swagger` 비교

## References (공식 문서)

- [NestJS Docs — OpenAPI Introduction](https://docs.nestjs.com/openapi/introduction) — `SwaggerModule`, `DocumentBuilder`, `createDocument`, `setup`, `SwaggerDocumentOptions`, `SwaggerCustomOptions`, Fastify + Helmet CSP 주의
- [NestJS Docs — Types and Parameters](https://docs.nestjs.com/openapi/types-and-parameters) — `@ApiProperty`, `@ApiPropertyOptional`, array, enum with `enumName`, circular dependency, generics
- [NestJS Docs — Operations](https://docs.nestjs.com/openapi/operations) — `@ApiOperation`, `@ApiResponse` + short-hands, `@ApiBody`, `@ApiQuery`, `@ApiParam`, `@ApiHeader`, `@ApiExtraModels`, `getSchemaPath`
- [NestJS Docs — Security](https://docs.nestjs.com/openapi/security) — `@ApiBearerAuth`, `@ApiBasicAuth`, `@ApiOAuth2`, `@ApiCookieAuth`, `@ApiSecurity`
- [NestJS Docs — CLI Plugin](https://docs.nestjs.com/openapi/cli-plugin) — `nest-cli.json`의 `plugins`, `classValidatorShim`, `introspectComments`, auto `@ApiProperty` 생성
- [NestJS Docs — Mapped Types](https://docs.nestjs.com/openapi/mapped-types) — `PartialType`, `PickType`, `OmitType`, `IntersectionType` (swagger 전용 버전)
- [OpenAPI Specification](https://swagger.io/specification/) — OAS 3.x 표준
