# Error Handling

> 핵심 메시지: **"에러는 반드시 일어난다. 문제는 사용자가 그걸 어떻게 경험하느냐."**

에러 핸들링은 여러 맥락에 걸치는 횡단 관심사다. 에러 아키텍처와 Error Boundary는 [async-patterns.md](async-patterns.md)에서 다룬다. 이 문서는 **에러 타입 체계, 사용자 피드백 전략, 모니터링**에 집중한다.

| 주제 | 참조 |
|---|---|
| 3-Layer 에러 아키텍처, Error Boundary 세분화, Mutation 에러 | [async-patterns.md](async-patterns.md) §1~4 |
| 에러 UI — 스크린리더 공지, `role="alert"` 사용 기준 | [accessibility.md](accessibility.md) §2, §5 |
| Server Actions 에러 반환 패턴 | [security.md](security.md) §2 |
| 폼 검증 에러 (Zod + RHF) | [forms.md](forms.md) |

***

## 1. 에러 타입 체계

API 에러를 구조화해서 UI 레이어에서 적절한 메시지를 보여줄 수 있게 한다.

```tsx
class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400: return '요청이 올바르지 않습니다';
      case 401: return '로그인이 필요합니다';
      case 403: return '권한이 없습니다';
      case 404: return '찾을 수 없습니다';
      case 429: return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요';
      default: return '서버 오류가 발생했습니다';
    }
  }
  if (error instanceof Error) return error.message;
  return '알 수 없는 오류가 발생했습니다';
}
```

***

## 2. 사용자 피드백 — Toast vs 인라인 vs 배너

에러의 성격에 따라 적절한 UI를 선택한다. 잘못된 선택은 사용자를 혼란스럽게 하거나, 에러를 놓치게 한다.

| 상황 | UI | 이유 |
|---|---|---|
| 성공 (저장, 삭제) | Toast (2초) | 확인만 하면 됨 |
| 경고 (삭제 확인) | Dialog | 되돌릴 수 없는 액션 |
| 에러 (API 실패) | Toast (5초) + 재시도 | 사용자가 조치 가능 |
| 에러 (페이지 로드 실패) | 인라인 에러 UI | 전체 화면 필요 |
| 네트워크 오프라인 | 배너 (상단 고정) | 지속 상태 |

### 낙관적 업데이트 + 에러 롤백

```tsx
const mutation = useMutation({
  mutationFn: updateUser,
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey: ['user'] });
    const previous = queryClient.getQueryData(['user']);
    queryClient.setQueryData(['user'], newData);
    return { previous };
  },
  onError: (err, _, context) => {
    queryClient.setQueryData(['user'], context?.previous);
    toast.error('저장에 실패했습니다');
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['user'] });
  },
});
```

***

## 3. 에러 모니터링

```tsx
// Sentry 통합 (권장)
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,     // 프로덕션: 10% 샘플링
  replaysSessionSampleRate: 0.01,
});

// 커스텀 에러 리포팅
function reportError(error: Error, context?: Record<string, unknown>) {
  Sentry.captureException(error, { extra: context });
  console.error('[App Error]', error, context);
}
```

상세 설정과 Core Web Vitals 모니터링은 [monitoring.md](monitoring.md) 참조.

***

## ❌ 안티패턴

* **빈 catch 블록**: `catch (e) {}` → 최소한 로깅
* **"문제가 발생했습니다"만 표시**: 사용자가 뭘 해야 하는지 알려줘야 함 (재시도, 새로고침, 문의)
* **에러 시 빈 화면**: 반드시 폴백 UI 제공 — Error Boundary 세분화는 [async-patterns.md](async-patterns.md) §4 참조
* **모든 에러를 alert()로**: Toast 또는 인라인 메시지 사용
* **console.error만**: 프로덕션에서는 Sentry 등 모니터링 도구 필수

***

> 📎 관련: [async-patterns.md](async-patterns.md) · [monitoring.md](monitoring.md) · [accessibility.md](accessibility.md)
