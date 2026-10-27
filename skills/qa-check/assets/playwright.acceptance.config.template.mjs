// acceptance 배치 모드 임시 config — report-dir에 복사해 __로 둘러싼 자리만 채운다. 커밋하지 않는다.
// 러너는 하네스 것(~/.claude/tools/playwright-runner)만 쓴다. 프로젝트의 @playwright/test는 import하지 않는다(인스턴스가 달라 test()가 실패한다).
import { defineConfig } from '__RUNNER__/node_modules/@playwright/test/index.mjs';
export default defineConfig({
  testDir: '__REPORT_DIR_ABS__',          // report-dir 절대 경로
  testMatch: /acceptance-.*\.spec\.mjs/,
  outputDir: '__REPORT_DIR_ABS__/test-results',
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: '__APP__',                   // app= 값
    screenshot: 'only-on-failure',
    headless: true,
    // storageState: '__REPORT_DIR_ABS__/auth-state.json',  // auth=로 한 번 로그인해 저장했을 때만
  },
});
