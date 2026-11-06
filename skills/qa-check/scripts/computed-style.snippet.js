() => {
  // 구현 쪽 computed style 추출기. 자리표시자 두 개를 치환한 뒤 전체를 Playwright MCP browser_evaluate 의 function 인자로 넘긴다.
  //   selector 상수 자리 → JSON.stringify(selector)
  //   requested 상수 자리 → JSON.stringify(그 target 의 디자인 props 키 배열)
  // 결과가 모델 컨텍스트를 거치므로 디자인에 있는 속성만 읽는다(요청 ∩ PROPS). 빈 배열이면 아무것도 읽지 않는다.
  // PROPS 는 허용 목록이다. 브라우저 코드라 import 하지 않고 compare-styles.mjs 의 PROPS 를 복제하며, 테스트가 두 목록의 일치를 검사한다.
  const PROPS = [
    'background-color', 'color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'row-gap', 'column-gap',
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
    'box-shadow', 'text-shadow',
    'opacity',
  ];
  // 디자인의 line-height % 를 디자인 font-size 없이 풀 때 compare-styles.mjs 가 구현의 font-size 를 쓴다. 그래서 함께 읽는다.
  const NEEDS = new Map([['line-height', ['font-size']]]);
  const selector = __SELECTOR_JSON__;
  const requested = __PROPS_JSON__;
  if (!Array.isArray(requested)) throw new TypeError('requested props must be a JSON array of CSS property names');
  const wanted = new Set(requested);
  for (const p of requested) for (const dep of NEEDS.get(p) ?? []) wanted.add(dep);
  const read = PROPS.filter((p) => wanted.has(p));
  const unsupported = [...new Set(requested.filter((p) => !PROPS.includes(p)))];
  const els = Array.from(document.querySelectorAll(selector));
  const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const samples = els.map((el, index) => {
    const cs = getComputedStyle(el);
    const props = {};
    for (const p of read) props[p] = cs.getPropertyValue(p);
    return { index, props };
  });
  return { selector, count: els.length, rootFontSize, samples, unsupported };
}
