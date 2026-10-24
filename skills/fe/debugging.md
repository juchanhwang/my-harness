# Debugging

> 핵심 메시지: **"재현되지 않는 버그는 고칠 수 없다. 증상이 아니라 원인을 고친다."**
>
> 절차(가설 → 재현 → 격리 → 수정 → 검증)는 `superpowers:systematic-debugging` 스킬을 따른다. 이 문서는 그 절차 위에서 쓰는 **FE 특화 체크리스트**다.

## 목차

1. [진단 — 에러 메시지 triage](#1-진단--에러-메시지-triage)
2. [재현 — 재현 성공 === 해결](#2-재현--재현-성공--해결)
3. [수정 — 겉보기 해결 vs 근본 원인](#3-수정--겉보기-해결-vs-근본-원인)
4. [재발 방지 — 로그·리포트·린트](#4-재발-방지--로그리포트린트)
5. [FE 빈출 버그 패턴](#5-fe-빈출-버그-패턴)
6. [안티패턴](#-안티패턴)

***

## 1. 진단 — 에러 메시지 triage

에러 메시지를 통째로 검색하기 전에 종류부터 분류한다. 종류가 정해지면 확인 순서가 정해진다.

| 메시지 | 뜻 | 먼저 확인할 것 |
|---|---|---|
| `SyntaxError: Unexpected '}'` | 실행 전 파싱 실패 | 괄호·예약어·따옴표 짝 |
| `SyntaxError: Unexpected '<' … not valid JSON` | HTML 응답을 `JSON.parse` | **잘못된 URL** — 404 페이지를 받고 있다 |
| `TypeError: Cannot read properties of undefined` | null/undefined 속성 접근 | 객체 존재 여부, API 응답 구조, `await` 누락 |
| `TypeError: x is not a function` | 함수 아닌 값 호출 | default vs named import, 반환 타입 |
| `ReferenceError: x is not defined` | 식별자 없음 | 미선언, TDZ(선언 전 접근), 스코프 |
| `TypeError: Failed to fetch` / `Load failed` | **네트워크 단계** 실패 | CORS·인증서·CSP·확장 프로그램. 4xx/5xx가 아니다 |
| `Cannot use import statement outside a module` | ESM/CJS 혼재 | `package.json` `"type"`, `.mjs`/`.cjs` |

**`fetch`는 HTTP 4xx/5xx에서 reject하지 않는다.** `res.ok`를 확인하지 않으면 에러 응답을 성공으로 파싱한다.

**에러 메시지가 없는 버그**는 작업 지도로 잡는다 — 동작 순서를 번호로 적고(입력 → 검증 → 결과 → UI 분기) 단계마다 기대값과 실제값을 비교한다. `{isValid && <Error />}` 같은 조건 반전이 여기서 드러난다.

***

## 2. 재현 — 재현 성공 === 해결

- **핵심 로직만 남긴다** — fetch·상태·UI를 떼어내고 문제 함수를 고정 입력으로 호출한다. 수정→확인 주기가 짧아진다.
- **문제가 나는 환경에서 잰다** — "모바일 프로덕션에서만", "Safari에서만"이 조건이면 그 환경에서 직접 프로파일링한다. 데스크톱 CPU throttling으로는 재현되지 않는 경우가 많다.
- **조건을 극단으로 민다** — 시간 조건은 짧게(gcTime 5분 → 1초), 값은 경계 ±1·범위 밖(음수)·극단(`MAX_SAFE_INTEGER + 1`). "이 값은 절대 안 들어와"라고 생각하는 지점이 버그의 틈이다.
- **손으로 못 맞추는 조건은 코드로 만든다** — 연타는 `setInterval`로 `click()` 반복, 빠른 입력은 스크립트로.
- **경로를 기록한다** — `A에서 항목 선택 → B 진입 → 뒤로가기`처럼 이전 상태가 재현 조건인 버그가 많다.

**도구**: `debugger;` + DevTools Watch로 값이 **어느 줄에서** 바뀌는지 본다. `console.table`(표), `console.group`(묶기), `console.time`(구간 시간), `console.trace`(누가 불렀나), `[Tag]` 접두사(필터 검색), `console.debug`(Verbose 필터로 평소엔 숨김).

***

## 3. 수정 — 겉보기 해결 vs 근본 원인

| 증상 | ❌ 겉보기 해결 (문제를 숨김) | ✅ 근본 원인 수정 |
|---|---|---|
| `find()` 결과 `.name` 접근 에러 | `\|\| {}`, `as User`, `!` | `if (!user) throw` 또는 `user?.name ?? '없음'` — "없을 수 있다"를 드러낸다 |
| 자동완성 결과가 이전 요청으로 덮임 | `setTimeout` + `clearTimeout` — 타이머만 취소, **진행 중 fetch는 못 막음** | debounce + `AbortController` — 이전 요청 `abort()`, `AbortError`는 무시, cleanup에서도 abort. TanStack Query 쿼리는 라이브러리가 처리하므로 수동 fetch에만 해당 |

**순수 함수로 분리한다** — 할인 계산·날짜 비교·`localStorage` 접근을 컴포넌트/Effect에서 꺼내 util로 만들면 UI 없이 테스트할 수 있다. 수정 후 같은 버그가 재발하는 것을 막는 가장 싼 방법이다.

**데드코드를 지운다** — 미사용 export는 `knip`, 미사용 CSS는 `stylelint-no-unused-selectors`. **종료된 A/B 실험 분기는 채택안만 남기고 삭제** — 남겨두면 디버깅 중 죽은 분기를 따라간다.

***

## 4. 재발 방지 — 로그·리포트·린트

**에러 로그에 남길 것** — 사용자 상태(앱 버전·디바이스·브라우저·timezone) / 배포 상태(커밋·빌드 일시·환경) / 런타임 상태(선택 옵션·직전 인터랙션). **PII(이름·이메일·전화·IP 전체·결제)는 절대 넣지 않는다.** 행동 타임라인은 Sentry Breadcrumb, 버전·실험군 필터는 Tag — [monitoring.md §1.2](monitoring.md).

**버그 리포트 5항목** — ① 재현 조건(기기·OS·브라우저·상태) ② 맥락(유저 행위를 단계로) ③ 기술적 원인(코드 레벨 + PR 링크) ④ 재발 방지 조치 ⑤ 스크린샷. 재현 조건은 "iOS에서만"이 아니라 `iOS 17.4.1 Safari, 다크모드에서만`처럼 쓴다.

**팀으로 확산한다** — 혼동되는 prop(`isDisabled` vs `disabled`)은 타입에서 하나를 제거해 컴파일 에러로 만든다. 더미 텍스트·맞춤법처럼 반복되는 실수는 ESLint `no-restricted-syntax`로 차단한다.

***

## 5. FE 빈출 버그 패턴

증상이 보이면 원인 열부터 의심한다.

| 증상 | 원인 | 처방 |
|---|---|---|
| 빠른 스크롤·연타에 요청 중복 | `setState(true)`는 다음 렌더까지 반영 안 됨 + 콜백의 **stale closure** | 실행 제어 플래그는 `useRef`. 무한 스크롤은 `useInfiniteQuery` |
| 오래 켜두면 메모리가 계속 는다 | WebSocket·`setInterval`·리스너 **cleanup 누락**, 배열 무한 누적 | Effect마다 `close()`/`clearInterval()`/`removeEventListener()`, 데이터 `slice(-N)`. 실시간 페이지는 30분 켜두고 테스트 |
| 페이지 전환 시 사이드바 상태·애니메이션이 깨짐 | `<Suspense>`가 **Layout 전체**를 감싸 suspend마다 셸이 언마운트 | Suspense는 데이터를 기다리는 컴포넌트 바로 위에. Layout·Nav는 경계 밖 |
| 폼 제출 눌러도 무반응, 에러도 없음 | Zod 검증 실패 → RHF가 `onSubmit`을 호출하지 않음 | `handleSubmit(onSubmit, onError)` — [forms.md](forms.md) |
| `x.some is not a function` | `useQuery<Res, Err, T[]>` 제네릭으로 **배열 단언**, 실제는 객체. `\|\| []` 폴백이 가림 | `select`로 실제 변환. 폴백 제거하고 재현 |
| 드래그·애니메이션이 모바일 프로덕션에서만 버벅임 | 터치마다 `setState` → CSS-in-JS 스타일 재생성 → **스타일 재계산 병목** | 드래그 중 `ref.current.style.transform` 직접 조작, 스냅 시만 `setState`. 실기기로 측정 |
| 서버로 보낸 ID 끝자리가 바뀜 | `Number()` 변환 — `MAX_SAFE_INTEGER` 초과 정밀도 손실 | query param·서버 ID는 **string 유지**, 연산 필요 시 `BigInt` |
| 두 UI 라이브러리 컴포넌트가 서로 간섭(ESC·포커스) | 공통 내부 패키지의 **중복 버전** → 레이어 스택이 둘 | `pnpm list <pkg>` 확인 → `overrides`/`resolutions`로 단일화 |

**격리 휴리스틱**
- "정상인 페이지와 정확히 뭐가 다른가?" — 조건을 하나씩 껐다 켠다
- 폴백(`|| []`, `as`, `!`)이 문제를 가린다 — 의심되면 폴백을 빼고 재현한다
- 라이브러리 간 상호작용 버그는 코드보다 의존성 트리부터
- 에러 메시지가 없는 UI 버그는 DOM 속성·`document.activeElement`·포커스를 본다
- 서드파티 내부 버그면 우회와 동시에 업스트림 릴리즈를 확인한다 — 이미 고쳐져 있으면 버전 업이 답이다

***

## ❌ 안티패턴

- **재현 없이 수정** — "고친 것 같다"를 검증할 수 없다
- **`as`·`!`·`|| {}`로 타입 에러만 지우기** — 잘못된 값이 조용히 흘러간다
- **`setTimeout`으로 레이스 해결** — 이미 시작된 요청은 취소되지 않는다
- **데스크톱 throttling으로 모바일 성능 판단** — 재현되지 않는다
- **버그 고치고 끝** — 로그 항목·리포트·린트 규칙 중 하나는 남긴다

***

> 📎 출처: [Frontend Fundamentals · Debug](https://frontend-fundamentals.com/debug/) · 관련: [error-handling.md](error-handling.md) · [react-effects.md](react-effects.md) · [monitoring.md](monitoring.md) · [forms.md](forms.md)
