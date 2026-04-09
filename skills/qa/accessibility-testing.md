# Accessibility Testing

## 왜 접근성이 중요한가

전 세계 인구의 15%가 장애를 가지고 있다. 접근성은 선택이 아니라 **사용자 기본 권리**다. 또한 많은 국가에서 법적 요구사항이기도 하다 (미국 ADA, 한국 장애인차별금지법).

## WCAG 2.1 핵심 원칙 (POUR)

| 원칙                      | 설명                  | 예시            |
| ----------------------- | ------------------- | ------------- |
| **Perceivable** (인지)    | 모든 콘텐츠를 인지할 수 있어야 함 | 이미지에 alt 텍스트  |
| **Operable** (조작)       | 모든 기능을 조작할 수 있어야 함  | 키보드로 모든 기능 사용 |
| **Understandable** (이해) | 콘텐츠를 이해할 수 있어야 함    | 명확한 에러 메시지    |
| **Robust** (견고)         | 다양한 기술로 접근 가능해야 함   | 시맨틱 HTML      |

## 자동 테스트 — axe-core

### Playwright + axe-core

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('접근성 테스트', () => {
  test('홈페이지가 접근성 기준을 충족한다', async ({ page }) => {
    await page.goto('/');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('로그인 폼이 접근성 기준을 충족한다', async ({ page }) => {
    await page.goto('/login');

    const results = await new AxeBuilder({ page })
      .include('#login-form')  // 특정 영역만
      .analyze();

    if (results.violations.length > 0) {
      console.log('접근성 위반:', JSON.stringify(results.violations, null, 2));
    }
    expect(results.violations).toEqual([]);
  });

  test('모달이 열린 상태의 접근성', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: '새 항목' }).click();

    // 모달이 열린 후 검사
    await expect(page.getByRole('dialog')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
```

### Vitest + axe-core (컴포넌트 테스트)

```typescript
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

test('Button 컴포넌트가 접근성 기준을 충족한다', async () => {
  const { container } = render(
    <Button variant="primary">제출하기</Button>
  );
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});

test('Form 컴포넌트가 접근성 기준을 충족한다', async () => {
  const { container } = render(
    <LoginForm onSubmit={vi.fn()} />
  );
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

## Pa11y — CLI 접근성 스캐너

```bash
# 단일 페이지 스캔
npx pa11y http://localhost:3000

# 여러 페이지 스캔
npx pa11y-ci
```

```json
// .pa11yci.json
{
  "defaults": {
    "standard": "WCAG2AA",
    "timeout": 10000,
    "wait": 1000
  },
  "urls": [
    "http://localhost:3000/",
    "http://localhost:3000/login",
    "http://localhost:3000/signup",
    "http://localhost:3000/dashboard",
    {
      "url": "http://localhost:3000/products",
      "actions": [
        "wait for element .product-list to be visible"
      ]
    }
  ]
}
```

## 키보드 네비게이션 테스트

```typescript
test('키보드만으로 로그인할 수 있다', async ({ page }) => {
  await page.goto('/login');

  // Tab으로 이메일 필드 포커스
  await page.keyboard.press('Tab');
  const emailFocused = await page.evaluate(() =>
    document.activeElement?.getAttribute('type') === 'email'
  );
  expect(emailFocused).toBe(true);

  // 이메일 입력
  await page.keyboard.type('test@test.com');

  // Tab으로 비밀번호 필드
  await page.keyboard.press('Tab');
  await page.keyboard.type('password123');

  // Tab으로 버튼 → Enter로 제출
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL('/dashboard');
});

test('모달에 포커스 트랩이 작동한다', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: '삭제' }).click();

  // 모달 안에서 Tab 순환
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // 모달 내 첫 번째 포커스 가능 요소에 자동 포커스
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(['BUTTON', 'INPUT']).toContain(focused);

  // Escape로 모달 닫기
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('스킵 네비게이션 링크가 있다', async ({ page }) => {
  await page.goto('/');

  // Tab으로 첫 번째 포커스 → 스킵 링크
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: /메인 콘텐츠로 이동|skip to/i });
  await expect(skipLink).toBeFocused();
});
```

## 색상 대비 테스트

```typescript
test('텍스트의 색상 대비가 충분하다', async ({ page }) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page })
    .withRules(['color-contrast'])
    .analyze();

  expect(results.violations).toEqual([]);
});
```

### 수동 체크 도구

* Chrome DevTools → Rendering → "Emulate vision deficiencies"
* Contrast Checker: WebAIM (webaim.org/resources/contrastchecker)
* 최소 대비비: 일반 텍스트 4.5:1, 큰 텍스트 3:1

## 시맨틱 HTML 검증

```typescript
test('페이지 구조가 시맨틱하다', async ({ page }) => {
  await page.goto('/');

  // <main> 요소 존재
  const main = page.locator('main');
  await expect(main).toHaveCount(1);

  // 헤딩 계층 구조 (h1 → h2 → h3, 건너뛰기 없음)
  const headings = await page.evaluate(() => {
    const hs = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    return Array.from(hs).map(h => parseInt(h.tagName[1]));
  });

  // h1이 하나만 존재
  expect(headings.filter(h => h === 1)).toHaveLength(1);

  // 헤딩 레벨이 2 이상 건너뛰지 않음
  for (let i = 1; i < headings.length; i++) {
    expect(headings[i] - headings[i - 1]).toBeLessThanOrEqual(1);
  }
});

test('이미지에 alt 텍스트가 있다', async ({ page }) => {
  await page.goto('/');

  const imagesWithoutAlt = await page.evaluate(() => {
    const images = document.querySelectorAll('img');
    return Array.from(images).filter(
      img => !img.alt && !img.getAttribute('role')?.includes('presentation')
    ).length;
  });

  expect(imagesWithoutAlt).toBe(0);
});

test('폼 요소에 레이블이 있다', async ({ page }) => {
  await page.goto('/signup');

  const results = await new AxeBuilder({ page })
    .withRules(['label'])
    .analyze();

  expect(results.violations).toEqual([]);
});
```

## 스크린리더 테스트 가이드

### 자동 테스트로 잡을 수 없는 것들 (수동 필요)

* aria-live 영역이 올바르게 읽히는가
* 포커스 이동 순서가 논리적인가
* 맥락 없이도 링크/버튼 텍스트가 이해되는가
* 복잡한 위젯(탭, 아코디언, 드래그앤드롭)의 사용성

### 스크린리더 테스트 순서

1. **VoiceOver** (macOS): Cmd + F5로 활성화
2. **NVDA** (Windows): 무료 다운로드
3. **TalkBack** (Android): 설정에서 활성화

### 체크 항목

* [ ] 페이지 제목이 의미 있게 읽히는가
* [ ] 헤딩으로 탐색 시 구조가 논리적인가
* [ ] 폼 필드에 레이블이 올바르게 연결되는가
* [ ] 에러 메시지가 자동으로 읽히는가 (aria-live)
* [ ] 동적 콘텐츠 변경이 알려지는가

## 접근성 테스트 체크리스트

* [ ] axe-core가 CI에서 자동 실행되는가
* [ ] 컴포넌트 테스트에 접근성 검사가 포함되는가
* [ ] 키보드만으로 모든 기능을 사용할 수 있는가
* [ ] 색상 대비가 WCAG AA 기준을 충족하는가
* [ ] 시맨틱 HTML이 사용되는가
* [ ] 이미지에 적절한 alt 텍스트가 있는가
* [ ] 폼 요소에 레이블이 연결되어 있는가
* [ ] 포커스 표시가 시각적으로 명확한가
* [ ] 스크린리더로 주요 플로우를 수동 테스트했는가