# Mobile Testing

## 모바일 테스트 전략

모바일 사용자가 전체 트래픽의 60%+ 를 차지하는 시대. 데스크탑에서만 테스트하면 대다수 사용자의 경험을 무시하는 것이다.

## 반응형 테스트

### Playwright 뷰포트 테스트

```typescript
import { test, expect, devices } from '@playwright/test';

// 디바이스 프로필 활용
const mobileDevices = [
  devices['iPhone 13'],
  devices['iPhone SE'],
  devices['Pixel 5'],
  devices['Galaxy S9+'],
];

for (const device of mobileDevices) {
  test(`반응형 레이아웃 — ${device.defaultBrowserType} ${device.viewport.width}x${device.viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({ ...device });
    const page = await context.newPage();
    await page.goto('/');

    // 모바일 네비게이션 존재 확인
    await expect(page.getByRole('button', { name: '메뉴' })).toBeVisible();

    // 데스크탑 사이드바 숨겨짐
    await expect(page.getByTestId('desktop-sidebar')).not.toBeVisible();

    await context.close();
  });
}
```

### 브레이크포인트 테스트

```typescript
const breakpoints = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'wide', width: 1920, height: 1080 },
];

for (const bp of breakpoints) {
  test(`${bp.name} (${bp.width}px) 레이아웃`, async ({ page }) => {
    await page.setViewportSize({ width: bp.width, height: bp.height });
    await page.goto('/products');

    if (bp.width < 768) {
      // 모바일: 1열 그리드
      const grid = page.getByTestId('product-grid');
      await expect(grid).toHaveCSS('grid-template-columns', expect.stringMatching(/^[^,]+$/));
    } else if (bp.width < 1280) {
      // 태블릿: 2열
    } else {
      // 데스크탑: 3-4열
    }
  });
}
```

## 터치 인터랙션 테스트

### 탭, 스와이프, 핀치

```typescript
test('터치 스크롤이 부드럽게 동작한다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/products');

  // 터치 스크롤 시뮬레이션
  await page.touchscreen.tap(187, 500); // 화면 중앙
  await page.evaluate(() => window.scrollBy(0, 500));

  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBeGreaterThan(0);
});

test('모바일 메뉴 토글', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');

  const menuButton = page.getByRole('button', { name: '메뉴' });
  const nav = page.getByRole('navigation');

  // 메뉴 열기
  await menuButton.tap();
  await expect(nav).toBeVisible();

  // 메뉴 닫기 (배경 탭)
  await page.locator('.overlay').tap();
  await expect(nav).not.toBeVisible();
});

test('캐러셀 스와이프', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');

  const carousel = page.getByTestId('hero-carousel');
  const box = await carousel.boundingBox();

  if (box) {
    // 왼쪽 스와이프
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    // 두 번째 슬라이드 활성화 확인
    await expect(page.getByTestId('slide-2')).toBeVisible();
  }
});
```

## 모바일 특유의 테스트 항목

### 터치 타겟 크기

```typescript
test('터치 타겟이 최소 44x44px이다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');

  const buttons = page.getByRole('button');
  const count = await buttons.count();

  for (let i = 0; i < count; i++) {
    const box = await buttons.nth(i).boundingBox();
    if (box) {
      expect(box.width, `Button ${i} width`).toBeGreaterThanOrEqual(44);
      expect(box.height, `Button ${i} height`).toBeGreaterThanOrEqual(44);
    }
  }
});
```

### 소프트 키보드 대응

```typescript
test('소프트 키보드가 입력 필드를 가리지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/login');

  const emailInput = page.getByLabel('이메일');
  await emailInput.tap();
  await emailInput.focus();

  // 키보드가 올라온 상태에서 입력 필드가 보이는지 확인
  await expect(emailInput).toBeVisible();
  await expect(emailInput).toBeInViewport();
});
```

### 가로 모드 (Landscape)

```typescript
test('가로 모드에서 레이아웃이 깨지지 않는다', async ({ page }) => {
  // 가로 모드 시뮬레이션
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('/');

  // 콘텐츠가 잘리지 않는지 확인
  const overflow = await page.evaluate(() => {
    const body = document.body;
    return body.scrollWidth > window.innerWidth;
  });
  expect(overflow).toBe(false);
});
```

## 네트워크 조건 테스트

```typescript
test('느린 네트워크에서도 사용 가능하다', async ({ page, context }) => {
  // 3G 시뮬레이션
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (1.5 * 1024 * 1024) / 8, // 1.5 Mbps
    uploadThroughput: (750 * 1024) / 8,             // 750 Kbps
    latency: 100,                                    // 100ms
  });

  await page.goto('/');

  // 로딩 인디케이터 표시 후 콘텐츠 로드
  await expect(page.getByText('로딩')).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible({ timeout: 10000 });
});

test('오프라인 상태 처리', async ({ page, context }) => {
  await page.goto('/');

  // 오프라인 전환
  await context.setOffline(true);

  await page.getByRole('link', { name: '상품' }).click();

  // 오프라인 메시지 표시
  await expect(page.getByText(/오프라인|연결 없음|네트워크/i)).toBeVisible();
});
```

## 모바일 디바이스 테스트 도구

| 도구                          | 유형          | 비용 | 장점        |
| --------------------------- | ----------- | -- | --------- |
| Playwright device emulation | 에뮬레이션       | 무료 | 빠름, CI 통합 |
| Chrome DevTools             | 에뮬레이션       | 무료 | 디버깅 편리    |
| BrowserStack                | 실 디바이스 클라우드 | 유료 | 실제 디바이스   |
| Sauce Labs                  | 실 디바이스 클라우드 | 유료 | 넓은 커버리지   |

### 에뮬레이션 vs 실 디바이스

* **에뮬레이션**: 빠르고 CI 친화적. 80%의 문제를 잡음
* **실 디바이스**: 느리고 비쌈. 터치 반응, 메모리, 성능 등 에뮬레이션으로 못 잡는 20%

**추천**: CI에서 에뮬레이션으로 기본 커버, 릴리스 전 BrowserStack으로 실 디바이스 스팟 체크.

## 모바일 테스트 체크리스트

* [ ] 주요 뷰포트(375, 768, 1280)에서 레이아웃 확인
* [ ] 터치 타겟 크기 ≥ 44x44px
* [ ] 소프트 키보드가 입력 필드를 가리지 않음
* [ ] 가로/세로 모드 전환 시 정상 동작
* [ ] 느린 네트워크(3G)에서 사용 가능
* [ ] 오프라인 상태 처리
* [ ] 이미지가 뷰포트에 맞게 반응형
* [ ] 폰트 크기가 가독성 있음 (최소 16px)
* [ ] 수평 스크롤이 없음
* [ ] 모바일 네비게이션(햄버거 메뉴) 정상 동작