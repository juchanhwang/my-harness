# Code Review

> 참조: [Google Engineering Practices — Code Review Developer Guide](https://google.github.io/eng-practices/review/) · [SmartBear — Best Kept Secrets of Peer Code Review](https://smartbear.com/resources/ebooks/best-kept-secrets-of-peer-code-review/) (Jason Cohen, Cisco 실험 — "200-400 LOC를 넘으면 결함 감지율 급락") · [Microsoft — Code With Engineering Playbook: Code Reviews](https://microsoft.github.io/code-with-engineering-playbook/code-reviews/) · [Conventional Comments](https://conventionalcomments.org/) (리뷰 코멘트 접두사 컨벤션 원전)

> 📎 QA는 "이 코드가 잘 작동하는가"를 넘어 "어떻게 실패할 수 있는가"를 본다. 구조·가독성 같은 FE 엔지니어 관점은 `fe` 스킬 소관이다. 리뷰 관점 7가지(`agents/qa.md`)별로 어디를 보는지는 아래 표가 정한다.

| 관점 | 확인할 곳 |
|---|---|
| 보안 | `security-testing.md` |
| 성능 | 이 파일 「성능」 |
| 가독성 | `~/.claude/skills/fe/code-review.md` §1.1·§1.2. 네이밍·중첩·매직 넘버는 `~/.claude/skills/fe/code-quality.md` §1.4·§1.5·§3.2 |
| 테스트 | 이 파일 「테스트」 |
| 엣지 케이스 | 이 파일 「엣지 케이스」 |
| 접근성 | `~/.claude/skills/fe/accessibility.md` 「Frequent Violations」·「Layer 1: Verification Checklist」. 검증 방법은 `accessibility-testing.md` |
| 타입 안전성 | `type-safety.md` |

## 성능

* [ ] **쿼리** — 루프 안에 DB·API 호출(N+1)이 없는가. 있으면 조인이나 `inArray` 배치로 바꾼다 (`~/.claude/skills/be/performance.md` 「N+1 쿼리 탐지 & 해결」). 목록 조회에 `limit`이 있는가. 기본은 cursor 기반이다 (`~/.claude/skills/be/api-design.md` §5)
* [ ] **누수·반복 생성** — 반복 호출되는 함수(render, 이벤트 핸들러, 요청 처리) 안에서 리스너·타이머·구독·커넥션을 만들고 해제하지 않으면 호출마다 쌓인다. DB·HTTP 클라이언트 같은 무거운 객체를 호출마다 새로 만들고 있지 않은가
* [ ] **캐시** — 새로 넣은 캐시에 무효화 경로와 TTL이 있는가. 사용자별 응답이면 키에 사용자가 들어 있는가 (`~/.claude/skills/be/caching.md` 「Cache Invalidation 전략」·「주의사항」)
* [ ] **프론트엔드** — 수동 `useMemo`·`useCallback`·`memo`에 근거가 있는가. `memo`가 아닌 자식에게 넘기는 `useCallback`은 효과가 없다 (`~/.claude/skills/fe/performance-react-rendering.md` §4·§6). 큰 라이브러리를 추가했다면 번들 기준을 확인한다 (`~/.claude/skills/fe/build-optimization.md` §4·§5)

## 엣지 케이스

* [ ] **null·빈 값·경계값** — 외부 값(API 응답, DB 조회, `find`·`Map.get`·`querySelector`)을 검사 없이 접근하지 않는가. 조회 결과 없음(404), 빈 배열·빈 문자열·공백만 있는 문자열, 0 나눗셈(NaN), 0·-1·최대 길이·날짜 경계에서 깨지지 않는가. 요구사항의 숫자와 코드 상수가 같은가
* [ ] **손상된 저장 데이터** — `localStorage`·쿠키·DB에서 읽은 JSON을 `JSON.parse`하는 곳에 예외 처리나 스키마 검증이 있는가. 깨진 값 한 건으로 앱 초기화가 실패한다
* [ ] **동시성** — 조회 후 조건을 검사하고 따로 쓰는 코드(check-then-act), 읽고-수정하고-쓰기, 버튼 연타로 인한 이중 제출, 응답 순서 역전. 수정 방향은 단순 증감이면 atomic SQL update, 충돌이 잦은 잔액·재고면 `SELECT FOR UPDATE`다 (`~/.claude/skills/be/concurrency.md` 「Race Condition 패턴 & 방지」·「실무 가이드라인」)
* [ ] **외부 실패** — 타임아웃 없는 `fetch`(무한 대기), `Promise.all`의 부분 실패, 재시도 시 중복 부작용(멱등성)

## 테스트

* [ ] 변경한 동작(새 기능·버그 수정)에 대응하는 테스트가 있는가. 없으면 테스트 누락이다
* [ ] 정상 경로만 있지 않은가. 에러·빈 값·경계값 케이스가 있고, 인가·검증을 바꿨다면 거부 케이스(비로그인·타인·잘못된 입력)가 있는가
* [ ] 구현 세부사항(state 변수명, 내부 함수 호출 횟수)이 아니라 사용자에게 보이는 결과를 검증하는가. 테스트끼리 상태를 공유하거나 실행 순서에 의존하지 않는가
* [ ] 모킹이 경계에 머무는가. FE는 네트워크·브라우저 API, BE는 외부 서비스(결제·이메일 등)만 모킹하고 통합 테스트는 실제 DB를 쓴다. 자식 컴포넌트나 테스트 대상 모듈 자체를 모킹하면 통과해도 증명하는 것이 없다
* [ ] 실패하던 테스트를 삭제·`skip`·`only`·기대값 완화로 통과시키지 않았는가

기준은 `~/.claude/skills/fe/testing.md` §1·§8, `~/.claude/skills/be/testing.md` §3·§4다. 리뷰 코멘트 접두사(`[blocker]` 등)와 리뷰 흐름은 `~/.claude/skills/fe/code-review.md` §3·§4를 따른다.
