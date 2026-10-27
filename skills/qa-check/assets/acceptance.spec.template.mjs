// acceptance 배치 모드 임시 spec — report-dir에 acceptance-<sha7>.spec.mjs로 복사해 쓴다. 커밋하지 않는다.
// test() 하나 = 시나리오 하나. 제목은 시나리오 id로 시작한다. 셀렉터·대기 규칙은 ~/.claude/skills/qa/e2e-testing.md.
import { test, expect } from '__RUNNER__/node_modules/@playwright/test/index.mjs';

test('AC-1 <인수 조건 한 줄>', async ({ page }) => {
  // Given
  await page.goto('/');
  // When
  await page.getByRole('button', { name: '저장' }).click();
  // Then
  await expect(page.getByText('저장 완료')).toBeVisible();
});

test('AC-1-neg <부정 경로: 잘못된 입력 / 권한 없음 / 응답 실패>', async ({ page }) => {
  await page.route('**/api/save', (route) => route.fulfill({ status: 500, body: '{}' }));
  await page.goto('/');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.getByText('문제가 발생했습니다')).toBeVisible();
});
