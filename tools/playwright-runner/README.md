# playwright-runner

QA acceptance **배치 모드**용 하네스 Playwright 러너. 프로젝트에 아무것도 설치하지 않고 `report-dir`(`.orchestrator/qa/`)의 임시 spec을 돌린다.

- 설치: `npm install` (이 디렉터리에서) → `npx playwright install chromium`
- 실행: `node_modules/.bin/playwright test --config <report-dir>/playwright.acceptance.config.mjs`
- config·spec 템플릿: `~/.claude/skills/qa-check/assets/playwright.acceptance.config.template.mjs`, `acceptance.spec.template.mjs`
- spec과 config는 **이 디렉터리의 `@playwright/test`를 절대 경로로 import**한다. 프로젝트의 Playwright와 섞으면 인스턴스가 달라 `test()`가 실패한다.
- 브라우저는 `~/Library/Caches/ms-playwright/`를 Playwright MCP와 공유한다.
- 갱신: `npm update @playwright/test && npx playwright install chromium`
