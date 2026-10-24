# Test Environments

> 참조: [Next.js — Environment Variables](https://nextjs.org/docs/app/guides/environment-variables)

QA가 검증 환경을 받을 때 확인할 것만 둔다. 구성 방법은 `~/.claude/skills/be/deployment.md`(Docker Multi-Stage Build), `~/.claude/skills/fe/ci-cd.md`(Preview Deploy, 환경별 `.env`), `~/.claude/skills/be/nestjs/testing.md`(compose DB 통합 테스트)를, 테스트 코드의 격리·시딩 패턴은 `integration-testing.md`·`e2e-testing.md`를 따른다.

## 격리

- [ ] DB·캐시·큐·외부 연동의 주소와 키가 운영을 가리키지 않는다(환경 변수 값을 열어 확인). Preview도 같다 — PR별 환경이 운영 DB나 시크릿을 쓰면 안 된다.
- [ ] 병렬 실행(워커·샤드)이 같은 DB·계정·데이터를 공유해 서로 깨뜨리지 않는다.
- [ ] 테스트 간 격리 방식을 알고 한계를 본다.
  - 트랜잭션 롤백(빠름·격리 높음): 테스트와 앱이 같은 트랜잭션을 공유할 때만 성립한다. 별도 서버 프로세스를 거치는 E2E에서는 쓸 수 없고, 앱이 자체 트랜잭션을 열면 SAVEPOINT가 필요하다.
  - TRUNCATE + 재시딩(보통·높음): 같은 DB를 병렬로 쓰면 서로 지운다. 테스트별 DB(느림·최고)는 마이그레이션 비용이 든다.
  - 고유 데이터(UUID, 빠름·중간): 데이터가 쌓여 목록·집계 테스트가 영향을 받는다.

## 시드 데이터

- [ ] 시드를 다시 실행할 수 있고(기존 데이터 정리 후 삽입) 결과가 결정적이다(고정 ID·이메일).
- [ ] 시드·정리용 테스트 전용 엔드포인트(`/api/test/seed`, `/api/test/cleanup`)가 운영과 외부에 열린 환경(Staging, Preview)에서 닫혀 있다. 환경 변수 가드만 믿지 말고 실제로 요청해 404나 차단을 확인한다.
- [ ] 시드의 종류·규모가 검증 목적에 맞다. 목록·페이지네이션·성능은 몇 건으로 검증할 수 없다.
- [ ] Staging의 "프로덕션 유사" 데이터는 개인정보가 익명화돼 있다.

## 운영과의 차이

차이를 목록으로 받아, 검증하지 못한 범위로 리포트에 적는다.

- [ ] DB·Redis·Node의 엔진과 버전이 운영과 같다. In-memory DB 대체는 운영과 같은 종류의 DB가 아니다(`~/.claude/skills/be/testing.md`의 Integration Testing 전략).
- [ ] 테스트에서만 끈 기능을 파악한다 — 레이트 리밋(`ENABLE_RATE_LIMIT=false`), 인증, 캐시, 로그 수준. 꺼진 기능은 이 환경에서 검증되지 않은 것이다.
- [ ] 외부 서비스가 모킹·샌드박스·실제 중 무엇인지 알고, 모킹이 실제의 오류·지연·페이지네이션을 재현하는지 본다.
- [ ] 인프라 차이를 안다: tmpfs DB(디스크 I/O 없음), 단일 인스턴스(분산 환경 문제가 안 드러남), 시간대, 데이터 규모.

## 환경 변수 누락으로 인한 조용한 실패

변수가 없어도 앱이 기본값이나 비활성 상태로 떠서 테스트가 통과한다. 이때의 통과는 검증이 아니다.

- [ ] 필요한 변수 목록(`.env.example`)과 환경에 주입된 값을 대조한다. 이름만 있고 값이 빈 것도 누락이다.
- [ ] 앱이 시작할 때 환경 변수를 검증하고 누락되면 바로 종료한다(`~/.claude/skills/be/security.md`의 Secrets 관리). 그렇지 않으면 누락이 기본값 동작에 숨는다.
- [ ] 빌드 시점 변수: Next.js `NEXT_PUBLIC_*`는 빌드할 때 번들에 박힌다. 빌드 뒤 값을 바꿔도 반영되지 않으므로 빌드 환경에 변수가 있었는지 본다.
- [ ] Turborepo에서 `tasks.build.env`에 필수 변수를 빼먹으면 Vercel이 조용히 잘못된 캐시를 가져온다(`~/.claude/skills/fe/architecture.md`의 함정).
- [ ] CI 결과가 로컬과 같고 Docker 이미지·의존 버전이 고정돼 환경이 재현된다. 다르면 변수·버전·이미지 차이를 먼저 찾는다.
