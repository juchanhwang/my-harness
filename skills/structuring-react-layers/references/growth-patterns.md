# 프로젝트 성장 시 확장 패턴

> 프론트엔드의 핵심 사이클은 **데이터 → 화면 → 행동 → 데이터 → …** 이며, 각 축의 복잡도가 임계점을 넘을 때 해당 패턴을 적용한다.

## 목차

1. [위젯 분해 (화면 축)](#1-위젯-분해-화면-축)
2. [엔티티 레이어 (데이터 축)](#2-엔티티-레이어-데이터-축)
3. [기능 중심 응집 (행동 축)](#3-기능-중심-응집-행동-축)
4. [확장 패턴 요약](#확장-패턴-요약)

---

## 1. 위젯 분해 (화면 축)

**적용 시점**: Page의 Feature 컴포넌트가 많아 return문이 한 화면에 안 들어오거나, 하나의 Feature가 여러 하위 관심사를 포함할 때.

위젯은 **화면의 독립적 구획**이다. Page는 위젯을 조립하고, 위젯은 내부에서 자체 데이터·상태·UI를 관리한다.

```
기존: Page → Feature Components
확장: Page → Widgets → Feature Components
```

```tsx
// ❌ Page가 너무 많은 구획을 직접 관리
function ProductDetailPage({ params }) {
  return (
    <>
      <ProductImageGallery productId={params.id} />
      <ProductInfo productId={params.id} />
      <ProductDescription productId={params.id} />
      <ReviewList productId={params.id} />
      <RelatedProducts productId={params.id} />
      <RecentlyViewed />
    </>
  );
}
```

```tsx
// ✅ 위젯 단위로 묶어서 관심사를 그룹화
function ProductDetailPage({ params }) {
  return (
    <>
      <ProductOverviewWidget productId={params.id} />
      <ReviewWidget productId={params.id} />
      <RecommendationWidget productId={params.id} />
    </>
  );
}

// 위젯 내부에서 하위 Feature 컴포넌트를 조합
function ReviewWidget({ productId }) {
  return (
    <section>
      <ReviewSummary productId={productId} />
      <ReviewList productId={productId} />
      <ReviewWriteButton productId={productId} />
    </section>
  );
}
```

> 판단 기준: 화면을 봤을 때 시각적·기능적으로 구분되는 구획이 명확하면 위젯으로 분리한다. 위젯은 다른 페이지에서도 재사용 가능하다.

계층 관계: **Page(배치) → Widget(구획 조합) → Feature Component(자기 완결 단위) → UI Component(순수 표현)**

---

## 2. 엔티티 레이어 (데이터 축)

**적용 시점**: 동일한 서버 데이터가 여러 화면에서 서로 다른 형태로 사용되거나, DTO → 화면 데이터 변환 로직이 반복될 때. 같은 DTO 변환을 수정할 때 다른 파일도 함께 수정해야 하면 도입 시점이다.

엔티티는 **원천 데이터(DTO)에서 화면 데이터까지의 변환 파이프라인**을 응집한다.

```
서버 DTO → Entity 변환 → 비즈니스 계산 → 화면용 ViewModel
```

```tsx
// ❌ 변환 로직이 여러 컴포넌트에 분산
function ProductCard({ dto }) {
  const price = dto.price * (1 - dto.discount_rate);
  const displayPrice = `${price.toLocaleString()}원`;
  // ...
}

function CartItem({ dto }) {
  const price = dto.price * (1 - dto.discount_rate); // 동일한 계산 반복
  // ...
}
```

```tsx
// ✅ 엔티티 레이어에서 변환을 응집
// entities/product/model.ts
interface Product {
  id: string;
  name: string;
  originalPrice: number;
  discountedPrice: number;
  displayPrice: string;
}

function toProduct(dto: ProductDTO): Product {
  const discountedPrice = dto.price * (1 - dto.discount_rate);
  return {
    id: dto.id,
    name: dto.name,
    originalPrice: dto.price,
    discountedPrice,
    displayPrice: `${discountedPrice.toLocaleString()}원`,
  };
}
```

엔티티 레이어를 도입할 경우 라우트 내 구조 예시:

```
<route>/
  entities/        # 데이터 모델, 변환 함수
  hooks/           # 기존과 동일
  components/      # 기존과 동일
  page.tsx
```

> 판단 기준: 같은 DTO 변환 로직이 2곳 이상에서 반복되면 엔티티 레이어 도입을 검토한다. 모든 도메인에 적용할 필요 없이, **데이터 흐름이 복잡한 핵심 도메인에만** 선택적으로 적용한다.

---

## 3. 기능 중심 응집 (행동 축)

**적용 시점**: 하나의 사용자 행동(검색, 주문, 결제 등)에 관련된 코드가 여러 디렉토리에 파편화되어 전체 흐름을 추적하기 어려울 때. 하나의 행동을 수정하려면 여러 폴더를 오가야 하면 도입 시점이다.

기능 단위는 **사용자의 하나의 행동에서 시작되어 완료까지의 전체 데이터 흐름**을 한곳에 응집한다.

```
사용자 입력 → 행동 해석 → API 호출 → 데이터 가공 → 화면 표시
```

```
<route>/
  features/
    product-search/      # "제품 검색" 기능의 전체 흐름
      SearchInput.tsx     # 입력 UI
      useSearchAction.ts  # 검색 행동 (API 호출 + 데이터 가공)
      SearchResults.tsx   # 결과 표시
      index.ts            # 외부 공개 인터페이스
```

> 판단 기준: 하나의 행동을 수정하기 위해 **3개 이상의 폴더**를 오가야 하면 기능 중심 응집을 검토한다. 모든 기능에 적용할 필요 없이, **복합적인 흐름을 가진 핵심 기능에만** 선택적으로 적용한다.

---

## 확장 패턴 요약

| 복잡도 축 | 패턴 | 적용 시점 | 핵심 질문 |
|-----------|------|-----------|-----------|
| **화면** | 위젯 분해 | Page return문이 한 화면에 안 들어올 때 | "**어디에** 배치할 것인가?" |
| **데이터** | 엔티티 레이어 | DTO 변환 수정 시 다른 파일도 수정해야 할 때 | "**무엇을** 표시할 것인가?" |
| **행동** | 기능 중심 응집 | 행동 수정 시 3+ 폴더를 오가야 할 때 | "**왜/어떤 맥락에서** 다룰 것인가?" |

> 이 패턴들은 동시에 전부 도입하는 것이 아니라, 해당 축의 복잡도가 임계점을 넘을 때 점진적으로 도입한다.
