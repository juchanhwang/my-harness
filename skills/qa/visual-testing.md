# Visual Testing

## 왜 필요한가

기능 테스트는 "이 버튼이 존재하는가"를 확인하지만, "이 버튼이 올바른 위치에 올바른 색상으로 보이는가"는 확인하지 않는다. CSS 한 줄 변경이 전혀 관계없는 페이지의 레이아웃을 깨뜨릴 수 있다.

## 작동 원리

1. **기준선(Baseline) 캡처**: 올바른 상태의 스크린샷 저장
2. **비교 캡처**: 변경 후 같은 조건에서 스크린샷 촬영
3. **픽셀 비교**: 두 스크린샷의 차이를 감지
4. **리뷰**: 의도된 변경인지 회귀 버그인지 판단

## Playwright 내장 스크린샷 비교

```typescript
import { test, expect } from '@playwright/test';

test('홈페이지 시각적 회귀 테스트', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('homepage.png', {
    maxDiffPixelRatio: 0.01, // 1% 픽셀 차이 허용
    fullPage: true,
  });
});

test('컴포넌트 시각적 테스트', async ({ page }) => {
  await page.goto('/components/button');

  // 특정 요소만 캡처
  const button = page.getByRole('button', { name: '제출' });
  await expect(button).toHaveScreenshot('submit-button.png');
});

test('다크 모드 시각적 테스트', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page).toHaveScreenshot('homepage-dark.png');
});

test('모바일 시각적 테스트', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await expect(page).toHaveScreenshot('homepage-mobile.png');
});
```

### 동적 콘텐츠 처리

```typescript
test('동적 요소를 마스킹한다', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveScreenshot('dashboard.png', {
    mask: [
      page.getByTestId('timestamp'),   // 시간 표시
      page.getByTestId('avatar'),      // 프로필 이미지
      page.getByTestId('chart'),       // 실시간 차트
    ],
  });
});

// 애니메이션 비활성화
test('애니메이션 없이 캡처', async ({ page }) => {
  await page.goto('/');
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  });
  await expect(page).toHaveScreenshot();
});
```

## 전문 도구

### Chromatic (Storybook 통합)

Storybook 컴포넌트를 클라우드에서 자동 시각적 테스트.

```bash
# 설치 및 실행
npm install -D chromatic
npx chromatic --project-token=<token>
```

**장점:**

* Storybook 스토리를 자동으로 시각적 테스트
* 클라우드 기반 — 브라우저 차이 걱정 없음
* PR에 시각적 변경 리뷰 통합
* 컴포넌트 수준의 세밀한 테스트

**설정:**

```json
// package.json
{
  "scripts": {
    "chromatic": "chromatic --exit-zero-on-changes"
  }
}
```

### Percy (BrowserStack 제품)

```typescript
// Playwright와 Percy 통합
import percySnapshot from '@percy/playwright';

test('홈페이지 Percy 스냅샷', async ({ page }) => {
  await page.goto('/');
  await percySnapshot(page, 'Homepage');
});

test('반응형 Percy 스냅샷', async ({ page }) => {
  await page.goto('/');
  await percySnapshot(page, 'Homepage', {
    widths: [375, 768, 1280, 1920],
  });
});
```

## Storybook + 시각적 테스트 조합

```typescript
// Button.stories.ts
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  component: Button,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: { variant: 'primary', children: '버튼' },
};

export const Secondary: Story = {
  args: { variant: 'secondary', children: '버튼' },
};

export const Disabled: Story = {
  args: { variant: 'primary', children: '비활성', disabled: true },
};

export const Loading: Story = {
  args: { variant: 'primary', children: '로딩 중...', loading: true },
};

// 각 스토리가 자동으로 Chromatic에서 시각적 테스트됨
```

## 시각적 테스트 전략

### 무엇을 시각적으로 테스트할까?

| 대상           | 우선순위   | 이유                   |
| ------------ | ------ | -------------------- |
| 디자인 시스템 컴포넌트 | **높음** | 한 컴포넌트 깨지면 전체 앱 영향   |
| 랜딩 페이지       | 높음     | 첫인상, 마케팅 영향          |
| 폼/입력 상태      | 중간     | 에러, 포커스, disabled 상태 |
| 반응형 레이아웃     | 중간     | 브레이크포인트별 확인          |
| 다크 모드        | 중간     | 색상, 대비               |
| 이메일 템플릿      | 낮음     | 클라이언트별 렌더링 차이가 너무 큼  |

### 시각적 테스트 피라미드

```
         /\         Full Page Screenshots (소수)
        /  \
       /----\       Component Screenshots (핵심)
      /      \
     /--------\     Storybook + Chromatic (다수)
    /____________\
```

## 시각적 테스트 체크리스트

* [ ] 기준선 이미지가 코드 리뷰되는가
* [ ] 동적 콘텐츠가 마스킹되는가 (날짜, 랜덤 데이터)
* [ ] 다양한 뷰포트 크기가 커버되는가
* [ ] 다크/라이트 모드가 테스트되는가
* [ ] 애니메이션이 비활성화되는가
* [ ] CI에서 일관된 렌더링 환경이 보장되는가
* [ ] 허용 오차(threshold)가 적절히 설정되는가
* [ ] 변경이 의도적인지 리뷰 프로세스가 있는가

## 주의사항

### 폰트 렌더링 차이

OS마다 폰트 렌더링이 다르다. CI에서 Docker 컨테이너로 일관된 환경을 보장하라.

```dockerfile
# Playwright Docker (일관된 렌더링)
# Playwright 1.47+ 기본 베이스가 Ubuntu 24.04 Noble로 변경됨.
# Noble(기본) 사용을 권장하며, Ubuntu 22.04 호환이 필요한 경우에만 -jammy suffix 유지.
FROM mcr.microsoft.com/playwright:v1.59.1-noble
```

### 임계값 설정

너무 엄격하면 false positive, 너무 관대하면 실제 버그를 놓친다.

* 전체 페이지: `maxDiffPixelRatio: 0.01` (1%)
* 컴포넌트: `maxDiffPixels: 100` (100 픽셀)
* 텍스트 많은 영역: 조금 더 관대하게

### 비용

Chromatic, Percy는 스냅샷 수 기반 과금. 무제한으로 쓰면 비용 폭발. 핵심 컴포넌트와 페이지에만 집중.