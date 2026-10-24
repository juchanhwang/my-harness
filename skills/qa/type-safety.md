# Type Safety

> 참조: [TypeScript Handbook — Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) (discriminated unions, type guards, `never` 활용) · [Matt Pocock — Discriminated Unions Are A Dev's Best Friend](https://www.totaltypescript.com/discriminated-unions-are-a-devs-best-friend) · [Zod 공식 문서](https://zod.dev/) · [Egghead — Using Branded Types in TypeScript](https://egghead.io/blog/using-branded-types-in-typescript) · Dan Vanderkam, *Effective TypeScript* (2nd ed., O'Reilly, 2024)
> 핵심 메시지: **"any는 TypeScript를 쓰는 이유를 없앤다. unknown에서 시작하고, 경계에서 검증하라."**

> 📎 규칙 상세(타입 선언 컨벤션, 금지 패턴, `as` 허용 기준, 스택별 타입 패턴, tsconfig 권장 설정)는 `~/.claude/skills/fe/typescript.md`가 기준이다. 이 파일은 QA가 diff에서 확인할 항목만 둔다. 컴파일 오류는 typecheck 결과(`static-analysis.md`)가 증거이고, 여기서는 컴파일러가 통과시키는 것을 본다.

## 금지 패턴 (`fe/typescript.md` §3)

diff에 있으면 finding 후보다. `fix:`에는 오른쪽 대안을 쓴다.

| 패턴 | 대안 |
|---|---|
| `any`, `as any` | `unknown` + 타입 가드 |
| `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` | 타입을 고치거나 좁힌다. 에러를 숨기면 런타임 버그가 된다 |
| `enum` 선언 | union 또는 `as const` 객체 (§1) |
| Zod 스키마와 같은 모양으로 손으로 쓴 타입 | `z.infer`로 파생 (§4) |
| 빈 `catch {}`, `catch (e: any)` | `catch (error: unknown)` + 로깅 |

## 단언과 가드

* [ ] **`as`** — 허용은 DOM API 반환 좁히기와 테스트 mock·fake(`as unknown as T`는 테스트에서만)다. 그 외 비즈니스 로직의 `as`는 타입 가드나 Zod로 바꿀 수 없는지 본다 (§2)
* [ ] **`!` (non-null)** — `find`·`Map.get`·`querySelector`·배열 인덱스 결과에 붙이면 값이 없을 때 런타임 TypeError다. 명시적 검사로 바꾼다
* [ ] **사용자 정의 가드(`x is T`)·`asserts`** — 필요한 필드를 모두 검사하는가. `'id' in data`처럼 얕게 보면 `as`와 다르지 않다

## 외부 입력 경계

타입 선언은 런타임에 강제되지 않는다. 경계마다 검증이 있는지 본다.

* [ ] API 응답, `FormData`, `searchParams`, `process.env`, `JSON.parse`·`localStorage` 값, webhook payload를 타입만 붙여 쓰지 않는가. Zod `safeParse`로 검증하고 실패 분기까지 있는가
* [ ] `res.json()`이나 제네릭 없는 HTTP 클라이언트 반환이 `any`로 흘러가지 않는가. API 함수에서 반환 타입을 확정한다 (§4)
* [ ] `.transform()`이 있는 스키마의 입력 타입에 `z.infer`를 쓰지 않았는가. `z.infer`는 변환 후 출력 타입이고 입력 타입은 `z.input`이다 (§4)
* [ ] Zod v4 형태인가. `z.string().email()`·`.uuid()`·`.url()`·`.datetime()`은 deprecated이고 `z.email()`·`z.uuid()`·`z.url()`·`z.iso.datetime()`을 쓴다

## 상태 모델링

* [ ] 선택 필드(`data?`, `error?`)나 boolean 여러 개로 상태를 표현하지 않는가. discriminated union으로 바꾼다 (`~/.claude/skills/fe/forms.md` §5.1 `ActionResult<T>`, `~/.claude/skills/fe/component-patterns.md` §6.6)
* [ ] union 멤버를 추가한 diff에서, 그 union을 분기하는 모든 `switch`·`if`에 `never` exhaustive check가 있는가. 없으면 새 멤버가 조용히 `default`로 빠진다

## 설정과 선언

* [ ] tsconfig diff가 `strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`를 끄거나 `include`·`exclude`로 검사 범위를 줄이지 않는가 (권장 설정: `fe/typescript.md` §6)
* [ ] 일반 객체 타입은 `type`으로 선언하고 `interface`는 상속·라이브러리 타입 확장에만 쓰는가 (§1)
