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
  assert.strictEqual(sw.points.length, sens.VARS.stockDays.steps.length);
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
  assert.strictEqual(sw.points[0].input, 0.50);
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

console.log('OK: sensitivity');
