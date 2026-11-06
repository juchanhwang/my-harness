() => {
  // 구현 쪽 레이아웃 박스 추출기(style.md 5단계). computed-style.snippet.js 와 같은 방식으로 자리표시자 두 개를 치환한 뒤
  // 전체를 Playwright browser_evaluate 의 function 인자로 넘긴다.
  //   rootSelector 상수 자리 → JSON.stringify(그 target 의 selector) — 속성 추출과 같은 selector, 여러 개와 일치하면 첫 요소가 루트다
  //   nodes 상수 자리 → JSON.stringify({ key: 루트 기준 selector }) — style-design 의 layout.nodes 에서 key 와 selector 만 뽑는다. '' 은 루트 자신
  // 결과: { rootFound: true, boxes: { key: [x, y, w, h] | null } }. 좌표는 루트 박스 왼쪽 위 기준 px 이고, 못 찾은 key 는 null 이다.
  // 루트가 없으면 { rootFound: false } 다. boxes 를 그 뷰포트의 actual 항목에 그대로 넣으면 compare-styles.mjs 가 비교한다.
  // 반올림하지 않는다. Chromium 이 이미 1/64px 단위로 반올림한 값을 그대로 돌려준다.
  const rootSelector = __SELECTOR_JSON__;
  const nodes = __NODES_JSON__;
  if (typeof rootSelector !== 'string') throw new TypeError('root selector must be a JSON string');
  if (typeof nodes !== 'object' || nodes === null || Array.isArray(nodes)) throw new TypeError('nodes must be a JSON object of key → selector');
  const root = document.querySelector(rootSelector);
  if (!root) return { rootFound: false };
  const base = root.getBoundingClientRect();
  const boxes = {};
  for (const [key, selector] of Object.entries(nodes)) {
    if (typeof selector !== 'string') throw new TypeError(`selector for '${key}' must be a string`);
    const el = selector === '' ? root : root.querySelector(selector);
    if (!el) {
      boxes[key] = null;
      continue;
    }
    const r = el.getBoundingClientRect();
    boxes[key] = [r.x - base.x, r.y - base.y, r.width, r.height];
  }
  return { rootFound: true, boxes };
}
