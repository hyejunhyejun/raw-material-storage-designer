const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = require('../js/rsd-app.js');

// 화면이 내보내는 조작 훅(data-*)마다 boot() 에 처리기가 있어야 한다.
//
// 이 둘은 파일이 달라서 한쪽만 고쳐도 아무 오류가 안 난다 —
// 버튼이 그냥 먹통이 될 뿐이다. 실제로 예전에 마스터플랜 띠 드래그가
// 이런 식으로 조용히 죽어 있었다 (버튼은 그려지는데 핸들러가 옛 이름을 봄).
// 원인이 눈에 안 띄므로 자동으로 대조한다.

const bootSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'rsd-app.js'), 'utf8');

// 모든 탭을 그려 실제로 나오는 훅을 모은다
function allMarkup() {
  const s = app.initialState();
  s.materials.flux.storageType = 'shed';
  s.shed.sizingMode = 'manual';
  s.shed.cellsPerBay = [[17.5, 37, 37], [17.5, 35, 35]];
  const r = app.recompute(s);
  return app.TABS.map(function (t) {
    s.activeTab = t.id;
    return app.renderBody(s, r);
  }).join('') + app.renderTabs('material');
}

const markup = allMarkup();

// data-무엇 이 쓰이고 있는가
const attrs = {};
const re = /\sdata-([a-z0-9-]+)=/g;
let m;
while ((m = re.exec(markup)) !== null) attrs[m[1]] = (attrs[m[1]] || 0) + 1;

// 훅을 **읽는** 코드. 내보내는 코드(`data-x="`)와 구분해야 한다 —
// 안 그러면 화면이 내보내기만 하고 아무도 안 읽는 먹통 훅을 잡지 못한다.
//   읽기: querySelector('[data-x]') · closest('[data-x]') · getAttribute('data-x')
const JS_DIR = path.join(__dirname, '..', 'js');
const allSrc = fs.readdirSync(JS_DIR)
  .filter(function (f) { return /^rsd-.+[.]js$/.test(f); })
  .map(function (f) { return fs.readFileSync(path.join(JS_DIR, f), 'utf8'); })
  .join('\n');

function isRead(attr) {
  return allSrc.indexOf('[data-' + attr + ']') >= 0 ||
         allSrc.indexOf("getAttribute('data-" + attr + "')") >= 0 ||
         allSrc.indexOf('[data-' + attr + '="') >= 0;
}
const handled = {};
Object.keys(attrs).forEach(function (a) { if (isRead(a)) handled[a] = true; });

// 조작 훅이 아니라 '표시'용 속성 — 처리기가 없어도 정상이다
const MARKERS = [
  'material',    // 원료 식별 (시험·CSS 선택용)
  'restore'      // 시나리오 되돌리기 — rsd-ui-sensitivity 가 읽는다
];

Object.keys(attrs).forEach(function (a) {
  if (MARKERS.indexOf(a) >= 0) return;
  assert.ok(handled[a],
    '화면은 data-' + a + ' 를 ' + attrs[a] + '번 내보내는데 rsd-app.js 에 처리기가 없다 — 먹통 버튼');
});

// 표시용 속성이라도 어딘가는 읽어야 의미가 있다
{
  const sensSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'rsd-ui-sensitivity.js'), 'utf8');
  const all = bootSrc + sensSrc;
  MARKERS.forEach(function (a) {
    if (!attrs[a]) return;
    assert.ok(all.indexOf('data-' + a) >= 0 || a === 'material',
      'data-' + a + ' 를 아무도 읽지 않는다');
  });
}

const tpl = fs.readFileSync(path.join(__dirname, '..', 'html', 'template.html'), 'utf8');

// 머리말 도구 버튼의 id 가 boot() 과 맞는가 (template.html ↔ rsd-app.js)
['save-json', 'load-json', 'load-file', 'csv-btn', 'print-btn', 'reset-btn'].forEach(function (id) {
  assert.ok(tpl.indexOf('id="' + id + '"') >= 0, 'template.html 에 #' + id + ' 이 있어야 한다');
  assert.ok(bootSrc.indexOf("'" + id + "'") >= 0, 'rsd-app.js 가 #' + id + ' 을 연결해야 한다');
});

// 3D·도면 컨테이너 id
assert.ok(bootSrc.indexOf("'stage3d'") >= 0 && markup.indexOf('id="stage3d"') >= 0,
  '3D 캔버스 자리 id 가 맞아야 한다');

// 모든 탭이 실제로 무언가를 그리는가 (빈 탭은 배선이 끊긴 것)
{
  const s = app.initialState();
  s.materials.flux.storageType = 'shed';
  const r = app.recompute(s);
  app.TABS.forEach(function (t) {
    s.activeTab = t.id;
    const html = app.renderBody(s, r);
    assert.ok(html && html.length > 200,
      t.id + ' 탭이 비어 있다 (' + (html ? html.length : 0) + ' chars)');
  });
}

// 저장타입을 바꾸면 그 탭에 내용이 생긴다 — 탭 ↔ 저장타입 배선
{
  const cases = [['yard', 'yard'], ['shed', 'shed'], ['silo', 'silo']];
  cases.forEach(function (c) {
    const s = app.initialState();
    Object.keys(s.materials).forEach(function (k) {
      if (s.materials[k].types.indexOf(c[1]) >= 0) s.materials[k].storageType = c[1];
    });
    s.activeTab = c[0];
    const html = app.renderBody(s, app.recompute(s));
    assert.ok(html.indexOf('지정된 원료가 없습니다') < 0,
      c[0] + ' 탭: 해당 타입 원료가 있는데 "없습니다" 가 나온다');
  });
}

console.log('OK: wiring');
