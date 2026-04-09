# NestJS Validation (DTO + class-validator)

> 이 파일은 **NestJS 11** 전용 구현을 다룬다.
> Framework-agnostic 입력 검증 원칙(Zero-trust, fail-fast, sanitization)은 [../security.md](../security.md#3-input-validation)에 정식 정의가 있다.

## 목차

1. [DTO를 클래스로 만들어야 하는 이유](#dto를-클래스로-만들어야-하는-이유)
2. [설치 & 부트스트랩](#설치--부트스트랩)
3. [ValidationPipe 권장 옵션](#validationpipe-권장-옵션)
4. [class-validator 주요 decorator](#class-validator-주요-decorator)
5. [class-transformer — `@Type`, `@Transform`, `@Expose`, `@Exclude`](#class-transformer)
6. [Nested DTO 검증](#nested-dto-검증)
7. [Mapped Types — `PartialType`, `PickType`, `OmitType`, `IntersectionType`](#mapped-types)
8. [Array 검증 — `ParseArrayPipe`](#array-검증--parsearraypipe)
9. [Custom Validator](#custom-validator)
10. [Response DTO & Serialization](#response-dto--serialization)
11. [안티패턴](#안티패턴)
12. [Related](#related)
13. [References](#references-공식-문서)

> **Zero-trust input validation 원칙**(모든 경계에서 검증, client 신뢰 금지, sanitization)은 [../security.md](../security.md#3-input-validation)에 정식 정의가 있다.
> 이 파일은 NestJS의 `class-validator` + `ValidationPipe` 통합에 집중한다.

## DTO를 클래스로 만들어야 하는 이유

공식 문서 인용: *"We recommend using **classes** here. Why? Classes are part of the JavaScript ES6 standard, so they remain intact as real entities in the compiled JavaScript. In contrast, TypeScript interfaces are removed during transpilation, meaning Nest can't reference them at runtime."*

즉 Nest의 `ValidationPipe`는 TypeScript의 `emitDecoratorMetadata`가 생성한 **런타임 타입 메타데이터**에 의존하는데, `interface`는 컴파일 시 사라지므로 이 정보가 없다.

```typescript
// ❌ 동작하지 않는다
export interface CreateCatDto {
  name: string;
  age: number;
}

// ✅ 정상 동작
export class CreateCatDto {
  name!: string;
  age!: number;
}
```

또한 DTO import 시 **type-only import를 쓰지 말라**:

```typescript
// ❌ 런타임에 사라짐
import type { CreateCatDto } from './create-cat.dto';

// ✅
import { CreateCatDto } from './create-cat.dto';
```

## 설치 & 부트스트랩

```bash
npm i class-validator class-transformer
# @nestjs/mapped-types는 @nestjs/swagger 또는 @nestjs/graphql을 쓰면 해당 패키지에서 re-export 되므로 별도 설치 불필요
```

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

DI가 필요하면 `APP_PIPE` provider 방식을 쓴다 ([./request-lifecycle.md](./request-lifecycle.md#global-component-등록-방식)).

## ValidationPipe 권장 옵션

공식 문서 표를 기반으로 프로덕션에서 필수로 권장되는 옵션 세 가지:

| 옵션 | 권장값 | 효과 |
|---|---|---|
| `whitelist` | `true` | DTO에 decorator가 없는 속성은 자동으로 제거 |
| `forbidNonWhitelisted` | `true` | whitelist 속성 외의 값이 들어오면 400 에러 |
| `transform` | `true` | plain object → DTO 클래스 인스턴스 변환. `typeof id === 'number'` 같은 타입 기대를 정확히 만족 |

### 왜 세 개 모두 필요한가

- `whitelist` 단독은 조용히 drop 되므로 공격자가 악의적 필드(예: `isAdmin: true`)를 넣어도 에러가 나지 않고 우연히 누락된 보안 로직을 우회할 수 있다.
- `forbidNonWhitelisted`를 함께 켜면 확실히 **fail fast**: 존재하면 안 되는 속성이 오면 즉시 거부.
- `transform: true`는 plain object를 DTO 인스턴스로 바꿔 method 호출, default 값, 타입 변환(string → number)이 가능해진다.

> **공식 문서 근거**: *"With the auto-transformation option enabled, the ValidationPipe will also perform conversion of primitive types."* 즉 `@Param('id') id: number` 선언 시 URL의 `"123"` 문자열이 `123` 숫자로 자동 변환된다.

### `disableErrorMessages`

Production에서는 상세 에러 메시지를 숨기는 옵션도 있다:

```typescript
new ValidationPipe({ disableErrorMessages: process.env.NODE_ENV === 'production' })
```

단, 이렇게 하면 정상 클라이언트도 원인을 파악하기 어렵다. **RFC 9457 Problem Details**로 세분화된 에러 정보를 제공하되 민감 정보는 제거하는 것이 더 나은 접근이다 ([./error-handling.md](./error-handling.md#rfc-9457-problem-details-구현)).

## class-validator 주요 decorator

`class-validator` 공식 README에 정의된 대표적인 decorator만 정리한다. 전체 목록은 [https://github.com/typestack/class-validator](https://github.com/typestack/class-validator)에 있다.

### 공통

- `@IsDefined()`, `@IsOptional()`, `@IsNotEmpty()`, `@IsEmpty()`
- `@Equals(value)`, `@NotEquals(value)`
- `@IsIn(values)`, `@IsNotIn(values)`

### 타입

- `@IsString()`, `@IsNumber()`, `@IsInt()`, `@IsBoolean()`, `@IsDate()`
- `@IsArray()`, `@IsObject()`, `@IsEnum(entity)`

### 문자열

- `@MinLength(n)`, `@MaxLength(n)`, `@Length(min, max)`
- `@IsEmail()`, `@IsUrl()`, `@IsUUID(version?)`
- `@Matches(regex)`, `@Contains(seed)`
- `@IsAlphanumeric()`, `@IsAscii()`, `@IsBase64()`
- `@IsPhoneNumber(region?)`, `@IsLocale()`

### 숫자

- `@Min(value)`, `@Max(value)`
- `@IsPositive()`, `@IsNegative()`
- `@IsDivisibleBy(n)`

### 날짜

- `@MinDate(date)`, `@MaxDate(date)`

### 예시

```typescript
// src/modules/users/dto/create-user.dto.ts
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @Length(2, 50)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 72) // bcrypt max 72 bytes
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'password must contain uppercase, lowercase, and digit',
  })
  password!: string;

  @IsInt()
  @Min(13)
  @Max(130)
  age!: number;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  bio?: string;
}
```

## class-transformer

`class-transformer`는 plain object ↔ 클래스 인스턴스 변환을 담당한다. `ValidationPipe`의 `transform: true`가 내부적으로 이 라이브러리를 호출한다.

### `@Type()` — 중첩 타입 지정

TypeScript metadata만으로는 generic `Array<T>`의 `T`를 알 수 없으므로 명시해야 한다:

```typescript
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';

export class CreateOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto) // ← 필수
  items!: OrderItemDto[];
}
```

### `@Transform()` — 커스텀 변환

```typescript
import { Transform } from 'class-transformer';

export class SearchDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  query!: string;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page: number = 1;
}
```

### `@Expose()` / `@Exclude()` — 직렬화 제어

응답 DTO에서 민감 필드 숨기기:

```typescript
import { Exclude, Expose } from 'class-transformer';

export class UserResponseDto {
  @Expose()
  id!: string;

  @Expose()
  email!: string;

  @Exclude()
  password!: string; // JSON 직렬화 시 제거
}
```

> **주의**: `@Exclude()`만으로는 부족하다. `ClassSerializerInterceptor`를 함께 등록해야 실제로 응답에서 빠진다 ([Response DTO & Serialization](#response-dto--serialization) 참조).

## Nested DTO 검증

```typescript
import { Type } from 'class-transformer';
import { IsString, IsNumber, ValidateNested, Min } from 'class-validator';

export class AddressDto {
  @IsString()
  street!: string;

  @IsString()
  city!: string;

  @IsString()
  zipCode!: string;
}

export class OrderItemDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class CreateOrderDto {
  @ValidateNested()
  @Type(() => AddressDto)
  shippingAddress!: AddressDto;

  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}
```

`@ValidateNested({ each: true })`는 배열의 **각 요소**에 대해 nested 검증을 수행한다.

## Mapped Types

공식 문서의 네 가지 유틸리티. `@nestjs/mapped-types`에서 가져오거나, `@nestjs/swagger`/`@nestjs/graphql`을 쓸 때는 해당 패키지에서 import 한다 (공식 경고: 혼합하면 "undocumented side-effects" 발생).

```typescript
import { PartialType, PickType, OmitType, IntersectionType } from '@nestjs/mapped-types';
// Swagger 사용 시:
// import { PartialType, PickType, OmitType, IntersectionType } from '@nestjs/swagger';
```

### `PartialType` — 모든 필드를 optional로

```typescript
export class UpdateUserDto extends PartialType(CreateUserDto) {}
// name?, email?, password?, age?, bio? — 모두 optional
```

### `PickType` — 일부 필드만 선택

```typescript
export class LoginDto extends PickType(CreateUserDto, ['email', 'password'] as const) {}
```

### `OmitType` — 특정 필드 제외

```typescript
export class PublicUserDto extends OmitType(CreateUserDto, ['password'] as const) {}
```

### `IntersectionType` — 두 타입 결합

```typescript
export class UpdateUserWithRoleDto extends IntersectionType(
  PartialType(CreateUserDto),
  AssignRoleDto,
) {}
```

### 합성

```typescript
// 모든 필드 optional + password 제외
export class UpdateProfileDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {}
```

## Array 검증 — `ParseArrayPipe`

배열 body나 comma-separated query 파싱:

```typescript
import { ParseArrayPipe } from '@nestjs/common';

@Post('bulk')
createBulk(
  @Body(new ParseArrayPipe({ items: CreateUserDto }))
  dtos: CreateUserDto[],
): Promise<User[]> {
  return this.usersService.bulkCreate(dtos);
}

@Get('by-ids')
findByIds(
  @Query('ids', new ParseArrayPipe({ items: Number, separator: ',' }))
  ids: readonly number[],
): Promise<User[]> {
  return this.usersService.findByIds(ids);
}
// GET /users/by-ids?ids=1,2,3
```

## Custom Validator

재사용 가능한 검증 로직이 필요할 때. `class-validator`의 `registerDecorator` 사용.

### 동기 버전

```typescript
// src/common/validators/is-strong-password.validator.ts
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'IsStrongPassword', async: false })
export class IsStrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const hasUpper = /[A-Z]/.test(value);
    const hasLower = /[a-z]/.test(value);
    const hasDigit = /\d/.test(value);
    const hasSpecial = /[^a-zA-Z0-9]/.test(value);
    return value.length >= 12 && hasUpper && hasLower && hasDigit && hasSpecial;
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'password must be >=12 chars and contain upper, lower, digit, special';
  }
}

export function IsStrongPassword(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'IsStrongPassword',
      target: object.constructor,
      propertyName,
      options,
      validator: IsStrongPasswordConstraint,
    });
  };
}
```

사용:

```typescript
export class ResetPasswordDto {
  @IsStrongPassword()
  newPassword!: string;
}
```

### 비동기 (DI 주입 가능) 버전

```typescript
// DB 중복 체크 같이 provider 접근이 필요한 경우
import { Injectable } from '@nestjs/common';
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';
import { UsersRepository } from '../../modules/users/users.repository';

@ValidatorConstraint({ name: 'IsEmailUnique', async: true })
@Injectable()
export class IsEmailUniqueConstraint implements ValidatorConstraintInterface {
  constructor(private readonly usersRepo: UsersRepository) {}

  async validate(value: string): Promise<boolean> {
    const existing = await this.usersRepo.findByEmail(value);
    return existing === null;
  }

  defaultMessage(): string {
    return 'email already in use';
  }
}

export function IsEmailUnique() {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'IsEmailUnique',
      target: object.constructor,
      propertyName,
      validator: IsEmailUniqueConstraint,
    });
  };
}
```

> **DI 사용 시 필수**: `main.ts`에서 `useContainer` 호출.
>
> ```typescript
> import { useContainer } from 'class-validator';
> useContainer(app.select(AppModule), { fallbackOnErrors: true });
> ```
>
> 이 줄이 없으면 `IsEmailUniqueConstraint`가 DI 없이 `new`로 생성되어 `usersRepo`가 undefined가 된다.

## Response DTO & Serialization

입력(Request DTO)과 출력(Response DTO)은 **반드시 분리**하라. 이유:

1. 입력에 있지만 출력엔 없는 필드(예: `password`)
2. 출력에만 있는 계산 필드(예: `displayName`, `isOwner`)
3. 버전/클라이언트별 다른 응답 형태

```typescript
// src/modules/users/dto/user-response.dto.ts
import { Exclude, Expose, Type } from 'class-transformer';

export class UserResponseDto {
  @Expose()
  id!: string;

  @Expose()
  email!: string;

  @Expose()
  name!: string;

  @Exclude()
  password!: string;

  @Expose()
  @Type(() => Date)
  createdAt!: Date;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
```

### `ClassSerializerInterceptor` 등록

```typescript
// main.ts
import { ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const app = await NestFactory.create(AppModule);
app.useGlobalInterceptors(
  new ClassSerializerInterceptor(app.get(Reflector), {
    excludeExtraneousValues: true,
    // @Expose가 있는 필드만 응답에 포함 — 실수로 민감 정보 노출 방지
  }),
);
```

Controller에서 반환:

```typescript
@Get(':id')
async findOne(@Param('id') id: string): Promise<UserResponseDto> {
  const user = await this.usersService.findOne(id);
  return new UserResponseDto(user);
}
```

> `excludeExtraneousValues: true`는 "화이트리스트 모드"이다. `@Expose()`가 붙은 필드만 응답에 포함되므로, 새 필드를 Entity에 추가해도 실수로 노출되지 않는다. 보안상 권장.

## 안티패턴

### 1. Interface DTO

```typescript
// ❌ 런타임에 사라짐 → ValidationPipe 무동작
interface CreateUserDto { email: string; }
```

class로 선언하라.

### 2. `whitelist` 없이 ValidationPipe 등록

```typescript
// ❌ 악의적 필드가 silently 저장될 수 있음
app.useGlobalPipes(new ValidationPipe());
```

`whitelist: true, forbidNonWhitelisted: true, transform: true` 세 개를 함께 켜라.

### 3. 같은 DTO를 Request와 Response에 재사용

```typescript
// ❌ password가 응답에 섞여 나감
@Post()
create(@Body() dto: UserDto): Promise<UserDto> {
  return this.service.create(dto);
}
```

Request DTO와 Response DTO를 분리하라.

### 4. Nested DTO에 `@Type()` 누락

```typescript
// ❌ items가 plain object로 유지돼 nested validation이 동작하지 않음
@ValidateNested({ each: true })
items!: OrderItemDto[];
```

`@Type(() => OrderItemDto)`를 반드시 함께 써야 한다.

### 5. `@nestjs/mapped-types`와 `@nestjs/swagger`를 혼용

공식 경고 인용: *"if you used `@nestjs/mapped-types` (instead of ... either `@nestjs/swagger` or `@nestjs/graphql` depending on the type of your app), you may face various, undocumented side-effects."*

Swagger를 쓴다면 **반드시 `@nestjs/swagger`에서만** 가져와라.

### 6. 비즈니스 규칙을 DTO validator에

```typescript
// ❌ 비즈니스 규칙(중복 체크)을 DTO level에서 — 일관성 보장 불가
@IsEmailUnique()
email!: string;
```

`IsEmailUnique` 같은 DB 조회는 race condition에 취약하다 (TOCTOU — Time of Check vs Time of Use). 최종 보증은 **DB unique constraint**와 Service layer에서 `try/catch`로 해야 한다. 이런 validator는 "편의 기능"일 뿐, 보안 경계로 믿지 마라.

## Related

- [../security.md](../security.md#3-input-validation) — Zero-trust 검증 원칙
- [./controllers.md](./controllers.md) — DTO를 `@Body`/`@Query`/`@Param`에 바인딩
- [./error-handling.md](./error-handling.md) — ValidationPipe 에러 → RFC 9457 변환
- [./swagger.md](./swagger.md) — DTO에서 Swagger schema 자동 생성
- [./testing.md](./testing.md) — DTO validation 테스트
- [../fastify/api-design.md](../fastify/api-design.md) — Fastify JSON Schema 검증 비교

## References (공식 문서)

- [NestJS Docs — Validation](https://docs.nestjs.com/techniques/validation) — `ValidationPipe`, 옵션 표 (whitelist/forbidNonWhitelisted/transform/disableErrorMessages/exceptionFactory/groups 등), auto-validation, explicit conversion, `ParseArrayPipe`, DTO는 class로 써야 하는 이유
- [NestJS Docs — Pipes](https://docs.nestjs.com/pipes) — 내장 pipe 목록 (ParseInt, ParseBool, ParseUUID)
- [NestJS Docs — Mapped Types (OpenAPI)](https://docs.nestjs.com/openapi/mapped-types) — `PartialType`, `PickType`, `OmitType`, `IntersectionType`, 패키지 혼용 경고
- [typestack/class-validator](https://github.com/typestack/class-validator) — decorator 전체 목록, `registerDecorator`, async validator
- [typestack/class-transformer](https://github.com/typestack/class-transformer) — `@Type`, `@Transform`, `@Expose`, `@Exclude`
