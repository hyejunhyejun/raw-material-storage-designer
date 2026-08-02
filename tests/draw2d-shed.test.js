const assert = require('assert');
const ds = require('../js/rsd-draw2d-shed.js');
const shed = require('../js/rsd-engine-shed.js');
const data = require('../js/rsd-data.js');

const IN = data.PRESETS.exampleShed.input;
const R = shed.computeShed(IN);

// ===== 단면도 =====
{
  const svg = ds.drawShedSection({
    La: 32, Lb: 11, repose: 35, bottomSlope: 8.5, bays: 2,
    centerWall: 2.0, openClear: 13.5, slopeClear: 0, totalHeight: 60.5,
    color: '#2B2B33', section: R.section
  });
  assert.ok(/^<svg/.test(svg.trim()), 'svg 로 시작');
  // ①②③ 영역이 각각 그려지는가 (2 bay 이므로 좌우 대칭 2벌)
  assert.strictEqual((svg.match(/class="shed-a1"/g) || []).length, 2, '① 영역 2개 (2 bay)');
  assert.strictEqual((svg.match(/class="shed-a2"/g) || []).length, 2, '② 영역 2개');
  assert.strictEqual((svg.match(/class="shed-a3"/g) || []).length, 2, '③ 영역 2개');
  // 면적 라벨
  assert.ok(/358/.test(svg), '① 면적이 표기되어야 한다');
  assert.ok(/204/.test(svg), '② 면적이 표기되어야 한다');
  assert.ok(/138/.test(svg), '③ 면적이 표기되어야 한다');
  // 구조물
  assert.ok(/class="shed-roof"/.test(svg), '박공지붕');
  assert.ok(/class="shed-cwall"/.test(svg), '중앙 옹벽');
  assert.ok(/class="shed-tripper"/.test(svg), 'Tripper');
  assert.ok(/class="shed-spr"/.test(svg), 'SPR');
  // 치수
  assert.ok(/115/.test(svg), '총 폭 115 m');

  // ===== 처음 보는 사람도 읽히도록: 부재명 · 각도 · 흐름 · 범례 =====
  ['PEB 박공지붕', '외벽', '중앙 옹벽', 'GL ±0'].forEach(function (t) {
    assert.ok(svg.indexOf(t) >= 0, '부재명 "' + t + '" 표기 필요');
  });
  // 각도 값은 호 옆에 짧게, 무엇을 뜻하는지는 범례가 설명한다
  assert.ok((svg.match(/class="ang-arc"/g) || []).length === 4, '각도 호 4개 (2 bay × 안식각·하부)');
  assert.ok(/안식각 35° · 하부 경사각 8\.5°/.test(svg), '범례에 두 각도의 뜻이 있어야 한다');
  assert.ok(svg.indexOf('>적치<') >= 0 && svg.indexOf('>불출<') >= 0,
    '원료 흐름(적치·불출)이 표기되어야 한다');
  assert.ok((svg.match(/class="flow"/g) || []).length >= 3, '흐름 화살표가 그려져야 한다');
  ['La 개방측 32 m', 'Lb 옹벽측 11 m', '개방측 여유 13.5 m'].forEach(function (t) {
    assert.ok(svg.indexOf(t) >= 0, '입력값 "' + t + '" 구간이 단면에 표기되어야 한다');
  });
  // 범례 — ①②③ 이 무엇인지 도면 안에서 읽혀야 한다
  assert.ok(/단면적 구성/.test(svg), '범례 제목');
  assert.ok(/개방측 삼각형/.test(svg) && /옹벽측 사다리꼴/.test(svg) && /하부 쐐기/.test(svg),
    '범례에 ①②③ 의미가 있어야 한다');
  assert.ok(/합계 700\./.test(svg), '범례에 단면적 합계');

  // 글씨 크기는 치수용 · 주기용 두 가지뿐 (제각각이면 도면이 지저분해진다)
  const sizes = (svg.match(/font-size="([\d.]+)"/g) || [])
    .map(function (t) { return t.match(/[\d.]+/)[0]; })
    .filter(function (v, i, a) { return a.indexOf(v) === i; });
  assert.ok(sizes.length <= 2, 'Shed 단면 글씨 크기는 2종 이하 (현재 ' + sizes.join(', ') + ')');
}

// ===== 1 bay 는 절반 =====
{
  const svg = ds.drawShedSection({
    La: 32, Lb: 11, repose: 35, bottomSlope: 8.5, bays: 1,
    centerWall: 2.0, openClear: 13.5, slopeClear: 0, totalHeight: 60.5,
    color: '#2B2B33', section: R.section
  });
  assert.strictEqual((svg.match(/class="shed-a1"/g) || []).length, 1, '1 bay 는 ① 1개');
}

// ===== 평면도: 셀이 입력대로 그려지는가 =====
{
  const svg = ds.drawShedPlan({
    cells: R.cells, bays: 2, bayWidth: 60,
    wallThickness: 2, endWall: 2, maintZone: 15.25,
    length: R.length.value, width: R.width.value, color: '#2B2B33'
  });
  assert.strictEqual((svg.match(/class="cell"/g) || []).length, 12, '셀 12개 (2 bay × 6)');
  assert.ok(/21,444|21444/.test(svg), '36 m 셀 용량이 표기되어야 한다');
  assert.ok(/class="shed-gallery"/.test(svg), '중앙 갤러리');
  assert.ok(/class="maint-zone"/.test(svg), '정비존');
  assert.ok(/242/.test(svg), '총 길이 242.5 m');
}

// ===== 셀 길이를 바꾸면 도면이 따라간다 =====
{
  const mod = Object.assign({}, IN, {
    cellsPerBay: [[18, 36, 36], [18, 36, 36]]
  });
  const R2 = shed.computeShed(mod);
  const svg = ds.drawShedPlan({
    cells: R2.cells, bays: 2, bayWidth: 60,
    wallThickness: 2, endWall: 2, maintZone: 15.25,
    length: R2.length.value, width: R2.width.value, color: '#2B2B33'
  });
  assert.strictEqual((svg.match(/class="cell"/g) || []).length, 6, '셀 6개로 줄어든다');
}

// ===== 격벽은 셀 양쪽에 모두 있다 =====
// 맨 끝 셀도 양쪽이 막혀야 원료가 흘러나오지 않는다. 셀 n 개 -> 격벽 n+1 개.
{
  const svg = ds.drawShedPlan({
    cells: R.cells, bays: 2, bayWidth: 60,
    wallThickness: 2, endWall: 2, maintZone: 15.25,
    length: R.length.value, width: R.width.value, color: '#2B2B33'
  });
  const cells = (svg.match(/class="cell"/g) || []).length;      // 12 (2 bay x 6)
  const walls = (svg.match(/class="partition"/g) || []).length;
  assert.strictEqual(cells, 12);
  assert.strictEqual(walls, 14, 'bay 당 셀 6개 -> 격벽 7개, 2 bay 면 14개');
}

console.log('OK: draw2d-shed');
