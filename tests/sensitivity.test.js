const assert = require('assert');
const sens = require('../js/rsd-ui-sensitivity.js');
const app = require('../js/rsd-app.js');

const state = app.initialState();

// ===== 훑기는 원본 상태를 건드리지 않는다 =====
{
  const before = JSON.stringify(state);
  sens.sweep(state, 'ironOre', 'stockDays');
  assert.strictEqual(JSON.stringify(state), before, '민감도 분석이 입력값을 바꾸면 안 된다');
}

// ===== 재고일수를 늘리면 면적은 줄지 않는다 (단조 증가) =====
{
  const sw = sens.sweep(state, 'ironOre', 'stockDays');
  assert.strictEqual(sw.points.length,
    sens.VARS.stockDays.range(state.materials.ironOre.stockDays).length);
  // 슬라이더로 훑으려면 눈금이 촘촘해야 한다 — 성기면 계단이 눈금 사이에 숨는다
  assert.ok(sw.points.length >= 20, '눈금이 20개는 넘어야 한다 (현재 ' + sw.points.length + ')');
  for (let i = 1; i < sw.points.length; i++) {
    assert.ok(sw.points[i].area >= sw.points[i - 1].area,
      '재고일수 ' + sw.points[i].input + '일에서 면적이 줄었다 (' +
      sw.points[i - 1].area + ' → ' + sw.points[i].area + ')');
  }
  // 배율 1.0 지점이 기준으로 표시된다
  const base = sw.points.filter(function (p) { return p.isBase; });
  assert.strictEqual(base.length, 1, '기준점은 하나');
  assert.strictEqual(base[0].input, state.materials.ironOre.stockDays);
}

// ===== 운영효율을 올리면 면적은 늘지 않는다 =====
{
  const sw = sens.sweep(state, 'ironOre', 'operatingEff');
  for (let i = 1; i < sw.points.length; i++) {
    assert.ok(sw.points[i].area <= sw.points[i - 1].area,
      '운영효율 ' + sw.points[i].input + '에서 면적이 늘었다');
  }
  // 효율은 저장타입의 설정이므로 절대값으로 훑는다
  assert.strictEqual(sw.points[0].input, 0.40);
  assert.ok(sw.points[sw.points.length - 1].input >= 0.95 - 1e-9);
}

// ===== 면적은 계단형이다 — 열 수가 정수로 올림되기 때문 =====
{
  const sw = sens.sweep(state, 'ironOre', 'annualUsage');
  const jumps = sens.steps(sw);
  jumps.forEach(function (j) {
    assert.ok(j.units > 0, '계단 지점의 설비 수량이 잡혀야 한다');
  });
  // 같은 열 수 구간에서는 면적이 정확히 같다 (면적 = 열수 × 단위면적)
  for (let i = 1; i < sw.points.length; i++) {
    if (sw.points[i].units === sw.points[i - 1].units) {
      assert.strictEqual(sw.points[i].area, sw.points[i - 1].area,
        '열 수가 같으면 면적도 같아야 한다');
    }
  }
}

// ===== 저장타입별 설비 단위가 맞는가 =====
{
  const r = app.recompute(state);
  assert.strictEqual(sens.unitLabelOf(r.materials.ironOre), '열');   // 야드
  assert.strictEqual(sens.unitLabelOf(r.materials.coal), '기');      // Silo
  assert.strictEqual(sens.unitsOf(r.materials.coal), r.materials.coal.sizing.count.value);
}

// ===== 시나리오 요약 =====
{
  const S = sens.scenarioSummary(state);
  assert.strictEqual(S.rows.length, Object.keys(state.materials).length);
  // 총면적 = 원료별 설비 면적 + 이동기기 및 B/C 띠.
  // 띠는 야드 전체 기준으로 한 번에 잡히므로 원료별 면적에는 들어 있지 않다.
  const sum = S.rows.reduce(function (t, r) { return t + r.area; }, 0);
  assert.ok(S.srArea > 0, '야드가 있으면 이동기기 면적이 잡혀야 한다');
  assert.ok(Math.abs(S.totalArea - (sum + S.srArea)) < 1e-6,
    '합계 = 원료별 면적의 합 + 이동기기 면적');
}

// ===== A/B 비교 =====
{
  const A = app.initialState();
  const B = app.initialState();
  B.materials.ironOre.stockDays = A.materials.ironOre.stockDays * 2;

  const d = sens.compareScenarios(A, B);
  const ore = d.rows.filter(function (r) { return r.key === 'ironOre'; })[0];
  assert.ok(ore.area.b > ore.area.a, '재고일수를 2배로 하면 면적이 늘어야 한다');
  assert.ok(ore.area.delta > 0);
  assert.ok(ore.area.pct > 0);
  assert.ok(d.total.b > d.total.a, '합계도 늘어야 한다');

  // 같은 시나리오끼리는 차이가 0
  const same = sens.compareScenarios(A, A);
  assert.strictEqual(same.total.delta, 0);
  assert.strictEqual(same.total.pct, 0);
}

// ===== 0 나눗셈 방어 =====
{
  assert.strictEqual(sens.diff(0, 5).pct, null, '기준이 0이면 비율을 낼 수 없다');
  assert.strictEqual(sens.diff(0, 5).delta, 5);
}

// ===== 그래프는 좌표계 폭이 고정이고 글씨는 1/46 =====
{
  const sw = sens.sweep(state, 'ironOre', 'stockDays');
  const svg = sens.chart(sw, '철광석');
  assert.ok(/^<svg/.test(svg.trim()));
  assert.ok(svg.indexOf('viewBox="0 0 ' + sens.CW) === svg.search(/viewBox/),
    '그래프 viewBox 는 고정 폭');
  const sizes = (svg.match(/font-size="([\d.]+)"/g) || [])
    .map(function (t) { return Number(t.match(/[\d.]+/)[0]); })
    .filter(function (v, i, a) { return a.indexOf(v) === i; });
  assert.strictEqual(sizes.length, 1, '그래프 글씨는 한 가지');
  assert.ok(Math.abs(sizes[0] - sens.CW / 46) < 0.01, '도면과 같은 1/46 규칙');
}

// ===== 저장타입에 의미 있는 변수만 나온다 =====
// 파일 수는 야드에만, 1기 용량은 Silo 에만 의미가 있다.
// 안 맞는 변수를 보여주면 흔들어도 선이 평평해 "고장 났나" 싶어진다.
{
  assert.ok(sens.varsFor('yard').indexOf('pileCount') >= 0, '야드에 파일 수');
  assert.ok(sens.varsFor('silo').indexOf('pileCount') < 0, 'Silo 에 파일 수는 없다');
  assert.ok(sens.varsFor('silo').indexOf('siloCapacity') >= 0, 'Silo 에 1기 용량');
  assert.ok(sens.varsFor('shed').indexOf('siloCapacity') < 0, 'Shed 에 Silo 용량은 없다');
  assert.ok(sens.varsFor('shed').indexOf('shedLa') >= 0, 'Shed 에 적치거리');
  // 세 타입 공통 인자
  ['stockDays', 'annualUsage', 'operatingEff'].forEach(function (v) {
    ['yard', 'shed', 'silo'].forEach(function (t) {
      assert.ok(sens.varsFor(t).indexOf(v) >= 0, t + ' 에 ' + v + ' 가 있어야 한다');
    });
  });
  // 규모지수는 뺐다 — 면적이 전혀 안 움직여 민감도로서 의미가 없다
  assert.ok(!sens.VARS.costExponent, '규모지수는 민감도 변수에서 빠져야 한다');
}

// ===== 새 변수들도 실제로 규모를 움직이는가 =====
// 흔들어도 아무것도 안 변하는 변수는 민감도에 있을 이유가 없다.
{
  const cases = [
    ['ironOre', 'pileCount'], ['ironOre', 'yardLength'],
    ['coal', 'siloCapacity']
  ];
  cases.forEach(function (cse) {
    const sw = sens.sweep(state, cse[0], cse[1]);
    const areas = sw.points.map(function (p) { return p.area; });
    const spread = Math.max.apply(null, areas) - Math.min.apply(null, areas);
    assert.ok(spread > 0, cse[1] + ' 을 흔들었는데 면적이 전혀 안 움직인다');
  });
  // Shed 는 기본 시나리오에 없으므로 원료 하나를 Shed 로 돌려 본다
  const st = app.initialState();
  st.materials.flux.storageType = 'shed';
  const sw = sens.sweep(st, 'flux', 'shedLa');
  const areas = sw.points.map(function (p) { return p.area; });
  assert.ok(Math.max.apply(null, areas) - Math.min.apply(null, areas) > 0,
    'La 를 흔들었는데 Shed 면적이 안 움직인다');
}

// ===== 슬라이더가 가리키는 지점 =====
{
  const sw = sens.sweep(state, 'ironOre', 'stockDays');
  // 기준 눈금이 반드시 있어야 슬라이더가 지금 상태에서 출발한다
  assert.strictEqual(sw.points[sw.baseIndex].isBase, true, '기준 인덱스가 기준점을 가리켜야 한다');

  const mk = sens.markerAt(sw, 0);
  assert.strictEqual(mk.index, 0);
  const mkEnd = sens.markerAt(sw, sw.points.length - 1);
  assert.ok(mkEnd.area.x > mk.area.x, '오른쪽으로 갈수록 마커 x 가 커져야 한다');
  // 범위를 벗어나도 잘라서 받는다 (슬라이더 값이 어긋나도 터지지 않게)
  assert.strictEqual(sens.markerAt(sw, 9999).index, sw.points.length - 1);
  assert.strictEqual(sens.markerAt(sw, -5).index, 0);

  // 마커는 선 위에 붙어야 한다 — 그래프가 그리는 좌표와 같은 식을 써야 한다
  const svg = sens.chart(sw, '철광석', 'area', 3);
  const m3 = sens.markerAt(sw, 3);
  assert.ok(svg.indexOf('id="sens-mark-area" cx="' + m3.area.x + '" cy="' + m3.area.y + '"') >= 0,
    '그래프의 마커 좌표가 markerAt 와 같아야 한다');
}

// ===== 슬라이더 요약 =====
{
  const sw = sens.sweep(state, 'ironOre', 'stockDays');
  const html = sens.readout(sw, sw.baseIndex);
  assert.ok(/기준/.test(html), '기준 지점에는 기준 표시');
  assert.ok(/열</.test(html), '설비 수량 단위');
  const other = sens.readout(sw, sw.points.length - 1);
  assert.ok(/기준 대비/.test(other), '기준 대비 증감이 있어야 한다');
}

console.log('OK: sensitivity');
