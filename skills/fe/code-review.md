# Code Review

> 참조: [Google Engineering Practices — Code Review](https://google.github.io/eng-practices/review/) · [Conventional Comments](https://conventionalcomments.org/)
> 핵심 메시지: **"코드 리뷰는 지식 공유의 과정이지, 게이트키핑이 아니다."**

코드 리뷰는 두 가지 목적을 달성한다: (1) 저장소에 들어가는 코드의 품질을 유지하고, (2) 팀 전체에 지식과 컨벤션을 전파한다. 좋은 리뷰는 작성자와 리뷰어 모두가 성장하는 상호 학습의 기회다.

***

## 1. 리뷰어 체크리스트

### 1.1 비즈니스 로직

* [ ] 요구사항과 구현이 일치하는가?
* [ ] 엣지 케이스를 처리하는가? (빈 배열, `null`, 에러, 경계값)
* [ ] 의도가 코드에 명확히 드러나는가?

### 1.2 구조 및 설계

* [ ] 4대 원칙을 따르는가? (가독성·예측 가능성·응집도·결합도 — [code-quality.md](code-quality.md) 참조)
* [ ] 컴포넌트/함수 분리가 적절한가? (Kent의 7가지 문제 신호 — [architecture.md](architecture.md) §5 참조)
* [ ] 디렉토리 위치가 합리적인가? (feature boundary 존중 — [architecture.md](architecture.md) §4 참조)
* [ ] 불필요한 추상화를 만들지 않았는가? (AHA — 2번째 중복은 허용, 3번째부터 추상화 검토)

### 1.3 타입 안정성

* [ ] `any`, `as any`, `@ts-ignore`, `@ts-expect-error` 없이 작성됐는가?
* [ ] API 응답 타입이 명시적으로 정의됐는가?
* [ ] 제네릭과 유틸 타입이 적절히 사용됐는가? ([typescript.md](typescript.md) 참조)

### 1.4 테스트

* [ ] 주요 경로에 테스트가 있는가?
* [ ] 테스트가 구현 세부사항이 아닌 사용자 행동을 검증하는가? ([testing.md](testing.md) 참조)
* [ ] 엣지 케이스 테스트가 있는가?

### 1.5 성능

* [ ] 불필요한 리렌더링이 없는가? ([performance-react-rendering.md](performance-react-rendering.md) 참조)
* [ ] 번들에 큰 라이브러리가 추가되지 않았는가? ([build-optimization.md](build-optimization.md) 참조)
* [ ] 불필요한 `useEffect`가 없는가? ([react-effects.md](react-effects.md) 참조)
* [ ] `'use client'` 경계가 leaf에 가까운가? (Next.js App Router)

### 1.6 접근성

* [ ] 시맨틱 HTML을 사용하는가?
* [ ] 키보드 접근이 가능한가?
* [ ] ARIA 속성이 적절한가? ([accessibility.md](accessibility.md) 참조)

### 1.7 보안

* [ ] XSS 방어가 됐는가? (`dangerouslySetInnerHTML` 사용 시 sanitize)
* [ ] 토큰·시크릿이 클라이언트 번들에 노출되지 않는가? ([security.md](security.md) 참조)

***

## 2. 작성자 체크리스트 (Self-Review)

PR을 올리기 전에 스스로 먼저 리뷰한다. 리뷰어의 시간은 비싸다.

* [ ] **자기 리뷰 먼저** — diff를 한 번 더 읽는다. 눈에 띄는 것은 내가 먼저 고친다
* [ ] **불필요한 커밋 정리** — `git rebase -i`로 합치거나 재정렬 ([git-workflow.md](git-workflow.md) 참조)
* [ ] **CI 통과 확인** — 리뷰 요청 전에 빨간불을 남기지 않는다
* [ ] **UI 변경 시 스크린샷·녹화 첨부**
* [ ] **PR 설명에 "왜"가 드러나는가** — "무엇"은 diff가 말해준다. "왜"는 사람이 써야 한다
* [ ] **PR 크기 300-400줄 이내** — 초과 시 분할을 고려

***

## 3. 리뷰 코멘트 컨벤션

코멘트의 우선순위를 prefix로 명시한다. 작성자가 "이게 필수인가, 제안인가, 질문인가"를 빠르게 판단할 수 있다.

| Prefix | 의미 | 작성자의 대응 |
|---|---|---|
| `[blocker]` | 머지 전 반드시 수정 | 반드시 반영 |
| `[suggestion]` | 더 나은 방법이 있음 | 합리적이면 반영, 아니면 근거와 함께 거절 |
| `[question]` | 이해를 위한 질문 | 답변 |
| `[nit]` | 사소한 개선 (네이밍·포매팅 등) | 선택적 반영 |
| `[praise]` | 좋은 코드 인정 | 대응 불필요 |

### 좋은 코멘트 예시

```
[blocker] 여기서 `user.email`이 undefined일 수 있어요.
로그인 직후 `useQuery`가 resolve되기 전에 이 경로가 실행되면
런타임 에러가 납니다. `?.` 또는 로딩 가드가 필요해요.
```

```
[suggestion] 이 `useMemo`는 불필요해 보여요. 필터 로직이 단순해서
매번 계산해도 1ms 미만이고, 오히려 의존성 배열이 버그 원인이 되기 쉽습니다.
→ react-effects.md §2.1 참조
```

```
[question] 이 API 호출을 Server Action이 아닌 Route Handler로 한 이유가
궁금합니다. 다른 곳에서도 재사용해야 해서 그런가요?
```

### 피해야 할 코멘트

* ❌ **"이건 잘못됐어요"** — 근거 없는 단정. 무엇이 왜 잘못됐는지 설명
* ❌ **"왜 이렇게 했어요?"** — 공격적으로 들림. "이 선택의 의도가 궁금합니다"로 순화
* ❌ **"제 스타일이랑 달라요"** — 개인 취향은 리뷰 대상이 아님. 팀 컨벤션에 있으면 근거와 함께 지적, 없으면 제안에 그침
* ❌ **블로커 없이 승인 보류** — blocker가 없다면 approve하되 nit/suggestion을 남긴다

***

## 4. 리뷰 흐름

1. **작성자**: Self-review → CI 통과 → PR 생성 → 리뷰어 지정
2. **리뷰어**: 24시간 이내 1차 리뷰 (긴급 시 더 빠르게)
3. **작성자**: 코멘트 반영 → 재요청
4. **리뷰어**: Approve 또는 추가 코멘트
5. **작성자**: Approve 후 Squash merge ([git-workflow.md](git-workflow.md) §5 참조)

### 리뷰 시간 가이드

| PR 크기 | 기대 리뷰 시간 |
|---|---|
| < 100줄 | 즉시 (~30분) |
| 100-400줄 | 24시간 이내 |
| 400줄+ | 분할 요청 후 재리뷰 |

***

## 5. 안티패턴

* **LGTM만 찍기** — 실제로 읽지 않고 승인하는 관행. 리뷰의 가치를 파괴한다
* **개인 취향 강요** — 컨벤션에 없는 개인 스타일을 `[blocker]`로 거는 행위
* **너무 큰 PR 허용** — 1000줄+ PR은 리뷰가 불가능하다. 분할을 요구한다
* **리뷰 지연 방치** — 24시간+ 방치는 팀 전체의 배포 속도를 떨어뜨린다
* **작성자 방어 자세** — 리뷰 코멘트를 인신 공격으로 받아들이기. **코드 ≠ 나**
* **리뷰 없이 머지** — 긴급 핫픽스를 제외하고 리뷰 없는 머지는 금지

***

> 📎 관련: [code-quality.md](code-quality.md) · [architecture.md](architecture.md) · [git-workflow.md](git-workflow.md) · [testing.md](testing.md)
