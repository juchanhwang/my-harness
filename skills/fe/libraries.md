# Libraries

> 핵심 메시지: **"토스 오픈소스를 적극 활용한다. 검증된 도구가 직접 만든 것보다 낫다."**

***

## 1. es-toolkit — Lodash 대체

> "최대 97% 작은" 번들 크기, 2-3x 빠른 런타임 성능. TypeScript 내장, 완벽한 트리셰이킹.

```tsx
// ❌ Lodash
import _ from 'lodash';
_.debounce(fn, 300);
_.groupBy(items, 'category');

// ✅ es-toolkit
import { debounce, groupBy } from 'es-toolkit';
debounce(fn, 300);
groupBy(items, (item) => item.category);
```

### 마이그레이션

```tsx
// lodash-es → es-toolkit 변경만으로 마이그레이션
// import { debounce } from 'lodash-es';
import { debounce } from 'es-toolkit';
```

### 주요 기능

| 카테고리 | 함수 |
|----------|------|
| 배열 | `chunk`, `uniq`, `groupBy`, `difference`, `intersection` |
| 객체 | `pick`, `omit`, `merge`, `cloneDeep` |
| 함수 | `debounce`, `throttle`, `once`, `memoize` |
| 타입 가드 | `isNil`, `isString`, `isNumber` |

***

## 2. overlay-kit — 선언적 오버레이 관리

모달, 바텀시트, 다이얼로그를 `useState` 보일러플레이트 없이 관리한다.

```tsx
// ❌ 기존 방식 — useState 보일러플레이트
function Component() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>열기</button>
      <Dialog open={isOpen} onClose={() => setIsOpen(false)}>
        {/* ... */}
      </Dialog>
    </>
  );
}

// ✅ overlay-kit
import { overlay } from 'overlay-kit';

function Component() {
  const handleClick = () => {
    overlay.open(({ isOpen, close }) => (
      <Dialog open={isOpen} onClose={close}>
        {/* ... */}
      </Dialog>
    ));
  };

  return <button onClick={handleClick}>열기</button>;
}
```

### Promise 기반 패턴

```tsx
// 확인 다이얼로그
const confirmed = await overlay.open<boolean>(({ isOpen, close }) => (
  <ConfirmDialog
    open={isOpen}
    onConfirm={() => close(true)}
    onCancel={() => close(false)}
  />
));

if (confirmed) {
  await deleteItem(id);
}
```

***

## 3. SLASH 라이브러리

토스 내부 코드의 공개 버전. 일부 패키지는 유지보수가 제한적일 수 있다.

```tsx
// @toss/react — 쿼리 파라미터, 퍼널 관리
import { useQueryParam } from '@toss/react';

// @toss/utils — 숫자 포맷, 요청 재시도
import { formatNumber, retryRequestsOf } from '@toss/utils';
formatNumber(1234567); // "1,234,567"

// @toss/validators — 한국 특화 검증
import { isEmail, isPhoneNumber } from '@toss/validators';
isPhoneNumber('010-1234-5678'); // true
```

### 주요 패키지

| 패키지 | 용도 |
|--------|------|
| `@toss/react` | 쿼리 파라미터, 퍼널 관리 |
| `@toss/utils` | 숫자 포맷, 요청 재시도 |
| `@toss/validators` | 한국 특화 검증 (전화번호, 이메일) |

***

## 4. es-hangul — 한글 처리

한글 초성 검색, 조사 처리 등 한글 특화 기능. ESM 기반, TypeScript 내장.

```tsx
import { chosungIncludes, disassemble, josa } from 'es-hangul';

// 초성 검색
chosungIncludes('프론트엔드', 'ㅍㄹㅌ'); // true

// 한글 분해
disassemble('토스'); // ['ㅌ', 'ㅗ', 'ㅅ', 'ㅡ']

// 조사 처리
josa('토스', '이/가'); // '토스가'
josa('서울', '이/가'); // '서울이'
```

***

## ❌ 안티패턴

* **Lodash 전체 import**: `import _ from 'lodash'` → es-toolkit 사용
* **모달 상태를 수동 관리**: overlay-kit 사용
* **한글 처리 직접 구현**: es-hangul 사용
* **검증되지 않은 라이브러리**: 번들 크기, 유지보수 상태, 타입 지원 확인

***

> 📎 관련: [build-optimization.md](build-optimization.md) · [performance-react-rendering.md](performance-react-rendering.md)
