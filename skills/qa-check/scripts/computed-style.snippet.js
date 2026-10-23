() => {
  // 구현 쪽 computed style 추출기. 아래 selector 상수 자리의 자리표시자를 JSON.stringify(selector) 문자열로 치환한 뒤
  // 전체를 Playwright MCP browser_evaluate 의 function 인자로 넘긴다. 브라우저 코드라 import 하지 않고 속성 목록을 복제한다.
  // 이 목록은 compare-styles.mjs 의 PROPS 와 같아야 하며 테스트가 일치를 검사한다.
  const PROPS = [
    'background-color', 'color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'row-gap', 'column-gap',
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  ];
  const selector = __SELECTOR_JSON__;
  const els = Array.from(document.querySelectorAll(selector));
  const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const samples = els.map((el, index) => {
    const cs = getComputedStyle(el);
    const props = {};
    for (const p of PROPS) props[p] = cs.getPropertyValue(p);
    return { index, props };
  });
  return { selector, count: els.length, rootFontSize, samples };
}
