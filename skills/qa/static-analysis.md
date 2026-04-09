# Static Analysis

## 정적 분석이란

코드를 **실행하지 않고** 분석하여 버그, 보안 취약점, 코드 스멜을 찾는 기법. 테스트 피라미드/트로피 아래 Static Analysis 레이어에 해당한다. 가장 빠르고 저렴한 품질 관리 수단.

## ESLint

### 핵심 규칙 설정

```javascript
// eslint.config.js (Flat Config, ESLint 9+)
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // 버그 방지
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],

      // 타입 안전성
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'error',

      // 코드 스타일
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'interface', format: ['PascalCase'] },
        { selector: 'typeAlias', format: ['PascalCase'] },
        { selector: 'enum', format: ['PascalCase'] },
      ],

      // Import 정리
      'import/order': ['error', {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc' },
      }],
      'import/no-duplicates': 'error',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // 테스트에서는 완화
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  }
);
```

### React 전용 규칙

```javascript
{
  plugins: { react, 'react-hooks': reactHooks },
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'react/jsx-no-leaked-render': 'error', // {count && <div>} 방지
    'react/no-array-index-key': 'warn',
    'react/no-unstable-nested-components': 'error',
    'react/hook-use-state': 'error', // useState 네이밍 강제
  },
}
```

### 커스텀 규칙 예시

```javascript
// no-hardcoded-secrets.js — 하드코딩된 시크릿 감지
module.exports = {
  meta: {
    type: 'problem',
    messages: {
      noHardcodedSecret: 'Hardcoded secret detected. Use environment variables.',
    },
  },
  create(context) {
    const patterns = [
      /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/i,
      /password\s*[:=]\s*['"][^'"]+['"]/i,
      /secret\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/i,
    ];

    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          for (const pattern of patterns) {
            if (pattern.test(`${node.parent?.type}=${node.value}`)) {
              context.report({ node, messageId: 'noHardcodedSecret' });
            }
          }
        }
      },
    };
  },
};
```

## TypeScript Strict Mode

### tsconfig.json 엄격 설정

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true
  }
}
```

### 각 옵션의 의미

| 옵션                           | 역할                            | 잡아내는 버그                                          |
| ---------------------------- | ----------------------------- | ------------------------------------------------ |
| `strict`                     | 모든 strict 옵션 활성화              | null 참조, 암시적 any                                 |
| `noUncheckedIndexedAccess`   | 배열/객체 인덱스 접근 시 `undefined` 포함 | 배열 범위 초과                                         |
| `exactOptionalPropertyTypes` | optional과 undefined 구분        | `{ x?: string }` vs `{ x: string \| undefined }` |
| `noImplicitReturns`          | 모든 경로에서 return 필수             | 누락된 return                                       |

## SonarQube / SonarCloud

### 핵심 메트릭

| 메트릭                  | 기준       | 설명          |
| -------------------- | -------- | ----------- |
| Bugs                 | 0 (A등급)  | 잠재적 버그      |
| Vulnerabilities      | 0 (A등급)  | 보안 취약점      |
| Code Smells          | 적을수록 좋음  | 유지보수성 저하 코드 |
| Coverage             | ≥ 80%    | 테스트 커버리지    |
| Duplications         | < 3%     | 코드 중복률      |
| Cognitive Complexity | 함수당 ≤ 15 | 인지 복잡도      |

### Quality Gate 설정

```yaml
# sonar-project.properties
sonar.projectKey=my-project
sonar.sources=src
sonar.tests=test
sonar.typescript.lcov.reportPaths=coverage/lcov.info

# Quality Gate 기준
sonar.qualitygate.conditions=
  new_bugs=0
  new_vulnerabilities=0
  new_code_smells_ratio<=5
  new_coverage>=80
  new_duplicated_lines_density<=3
```

## 코드 복잡도 측정

### Cyclomatic Complexity (순환 복잡도)

코드의 분기 수. if, switch, for, while, catch 등이 하나씩 복잡도를 증가.

```typescript
// 복잡도 = 1 (분기 없음) ✅
function add(a: number, b: number): number {
  return a + b;
}

// 복잡도 = 6 (if × 5 + else × 1) ❌ 리팩토링 필요
function calculateShipping(order: Order): number {
  if (order.total > 100000) {
    if (order.isVip) { return 0; }
    else { return 3000; }
  } else if (order.total > 50000) {
    if (order.isVip) { return 0; }
    else { return 5000; }
  } else {
    return 10000;
  }
}

// 복잡도 = 1 (전략 패턴) ✅
const shippingRules = [
  { match: (o: Order) => o.isVip, cost: 0 },
  { match: (o: Order) => o.total > 100000, cost: 3000 },
  { match: (o: Order) => o.total > 50000, cost: 5000 },
];
const DEFAULT_SHIPPING = 10000;

function calculateShipping(order: Order): number {
  const rule = shippingRules.find(r => r.match(order));
  return rule?.cost ?? DEFAULT_SHIPPING;
}
```

### 복잡도 기준

| 복잡도   | 등급 | 조치       |
| ----- | -- | -------- |
| 1-5   | 좋음 | 유지       |
| 6-10  | 보통 | 모니터링     |
| 11-20 | 높음 | 리팩토링 권장  |
| 21+   | 위험 | 반드시 리팩토링 |

## Prettier + ESLint 통합

```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "printWidth": 100
}
```

**원칙: 포매팅은 Prettier, 로직은 ESLint.** 겹치는 규칙은 `eslint-config-prettier`로 ESLint 쪽을 끈다.

## Husky + lint-staged (커밋 전 검증)

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

```bash
# .husky/pre-commit
npx lint-staged
```

## 정적 분석 체크리스트

* [ ] ESLint strict 규칙이 프로젝트에 적용되어 있는가
* [ ] TypeScript strict mode가 활성화되어 있는가
* [ ] Prettier로 포매팅이 자동화되어 있는가
* [ ] pre-commit hook이 설정되어 있는가
* [ ] CI에서 lint 검사가 실행되는가
* [ ] SonarQube/SonarCloud Quality Gate가 설정되어 있는가
* [ ] 코드 복잡도 임계값이 설정되어 있는가
* [ ] `any` 타입 사용이 금지/제한되어 있는가