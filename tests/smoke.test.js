const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('../js/rsd-core.js');
const app = require('../js/rsd-app.js');
const uiFac = require('../js/rsd-ui-facility.js');

const root = path.join(__dirname, '..');
const read = function (f) { return fs.readFileSync(path.join(root, f), 'utf8'); };

assert.strictEqual(typeof core.VERSION, 'string', 'VERSION은 문자열이어야 한다');
assert.ok(core.VERSION.length > 0, 'VERSION은 비어있지 않아야 한다');

// ===== 문서 골격 =====
// 링크로 공유하는 도구다. 언어·표시 정보가 없으면 번역기·스크린리더가 헤맨다.
{
  const tpl = read('html/template.html');
  assert.ok(/<!doctype html>/i.test(tpl), 'doctype 이 있어야 한다');
  assert.ok(/<html lang="ko">/.test(tpl), 'lang="ko" 가 있어야 한다');
  assert.ok(/name="viewport"/.test(tpl), 'viewport 메타');
  assert.ok(/name="color-scheme"/.test(tpl), '라이트/다크 선언');
}

// ===== 좁은 화면 =====
// 폰으로 여는 사람이 반드시 있다. 가로로 새면 좌우로 밀어야 읽힌다.
{
  const css = read('css/rsd.css');
  assert.ok(/@media \(max-width: 760px\)/.test(css), '좁은 화면 규칙이 있어야 한다');
  const narrow = css.slice(css.indexOf('@media (max-width: 760px)'));
  assert.ok(/\.tabs\s*\{[^}]*overflow-x:\s*auto/.test(narrow),
    '탭바가 가로로 굴러야 한다 (9개는 한 줄에 안 들어간다)');
  assert.ok(/table\s*\{[^}]*overflow-x:\s*auto/.test(narrow),
    '표가 스스로 굴러야 한다 — 안 그러면 페이지 전체가 밀린다');
}

// ===== 라이선스 =====
{
  const lic = read('LICENSE');
  assert.ok(/MIT License/.test(lic), 'LICENSE 파일이 있어야 한다 (공개 저장소)');
  assert.ok(/Three\.js/.test(lic), '동봉한 Three.js 의 출처도 밝혀야 한다');
}

// ===== 예시 시나리오 안내 =====
// 채워진 입력칸은 처음 보는 사람에게 '실제 검토 결과' 로 보인다.
{
  assert.strictEqual(app.isPristine(app.initialState()), true, '초기 상태는 예시로 판정');
  const s = app.initialState();
  s.materials.coal.annualUsage = 6000000;
  assert.strictEqual(app.isPristine(s), false, '값을 바꾸면 더 이상 예시가 아니다');
}

// ===== 기준 투자비 0 은 '싸다' 가 아니라 '안 넣었다' =====
{
  const s = app.initialState();
  const r = app.recompute(s);
  const zeroYard = uiFac.renderCompare(s, r, 'coal');
  assert.ok(/항상 최소 투자비로 표시/.test(zeroYard),
    '기준 투자비가 0 인 타입이 있으면 그 사실을 알려야 한다');

  const s2 = app.initialState();
  s2.cost.yard.baseCost = 50;
  const filled = uiFac.renderCompare(s2, app.recompute(s2), 'coal');
  assert.ok(!/항상 최소 투자비로 표시/.test(filled),
    '전부 채우면 경고가 사라져야 한다');
}

console.log('OK: smoke');
