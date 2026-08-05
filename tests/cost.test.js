const assert = require('assert');
const cost = require('../js/rsd-cost.js');
const app = require('../js/rsd-app.js');
const cmp = require('../js/rsd-ui-compare.js');

function near(actual, expected, tol, label) {
  assert.ok(Math.abs(actual - expected) <= tol,
    `${label}: ${actual} vs ${expected} (허용 ±${tol})`);
}

// ===== 0.6승법 자체 =====
{
  near(cost.scaleFactor(50000, 50000, 0.6), 1, 1e-12, '기준 용량이면 지수 1');
  // 용량 2배 → 2^0.6 = 1.5157
  near(cost.scaleFactor(100000, 50000, 0.6), Math.pow(2, 0.6), 1e-12, '용량 2배');
  near(cost.scaleFactor(100000, 50000, 0.6), 1.5157, 0.0001, '2^0.6 = 1.5157');
  // 용량 8배 → 8^0.6 = 3.482 (선형이면 8배였을 것)
  near(cost.scaleFactor(400000, 50000, 0.6), 3.4822, 0.0001, '용량 8배 → 3.48배');
  // 기준이 0이면 나눗셈이 깨지므로 1 로 방어
  near(cost.scaleFactor(50000, 0, 0.6), 1, 1e-12, '기준 0 방어');
  near(cost.scaleFactor(0, 50000, 0.6), 1, 1e-12, '실제 0 방어');
  // 지수 1 이면 정비례 (사용자가 규모의 경제를 끄고 싶을 때)
  near(cost.scaleFactor(100000, 50000, 1), 2, 1e-12, '지수 1 = 정비례');
}

// ===== 지수는 '설비 1기 크기' 에만 붙는다 =====
// 기수에까지 먹이면 "많이 지을수록 싸진다" 는 잘못된 결론이 나온다.
{
  const one = cost.computeCost({
    type: 'silo', config: { basisCapacity: 50000, baseCost: 80 },
    exponent: 0.6, unitCapacity: 50000, unitCount: 1
  });
  near(one.total.value, 80, 1e-9, '기준 크기 1기 = 기준 투자비');

  const ten = cost.computeCost({
    type: 'silo', config: { basisCapacity: 50000, baseCost: 80 },
    exponent: 0.6, unitCapacity: 50000, unitCount: 10
  });
  near(ten.total.value, 800, 1e-9, '같은 크기 10기 = 정확히 10배 (기수는 선형)');
  near(ten.perTon.value, one.perTon.value, 1e-6, '기수만 늘면 톤당 투자비는 그대로');

  // 같은 총용량 50만톤을 '크게 1기' 로 지으면 싸다 — 이게 규모의 경제다
  const big = cost.computeCost({
    type: 'silo', config: { basisCapacity: 50000, baseCost: 80 },
    exponent: 0.6, unitCapacity: 500000, unitCount: 1
  });
  assert.ok(big.total.value < ten.total.value,
    '같은 총용량이면 큰 설비 1기가 작은 설비 10기보다 싸야 한다: ' +
    big.total.value.toFixed(1) + ' vs ' + ten.total.value.toFixed(1));
  near(big.total.value, 80 * Math.pow(10, 0.6), 1e-9, '10배 크기 1기 = 80 × 10^0.6');
}

// ===== 톤당 투자비 =====
{
  const c = cost.computeCost({
    type: 'shed', config: { basisCapacity: 250000, baseCost: 1000 },
    exponent: 0.6, unitCapacity: 250000, unitCount: 1
  });
  // 1000 억원 ÷ 25만톤 = 40만 원/t
  near(c.perTon.value, 400000, 1, '톤당 = 총투자비 ÷ 총용량');
  // 저장량이 0이면 0으로 나누지 않는다
  const zero = cost.computeCost({
    type: 'shed', config: { basisCapacity: 250000, baseCost: 1000 },
    exponent: 0.6, unitCapacity: 0, unitCount: 0
  });
  near(zero.total.value, 0, 1e-12, '설비가 없으면 투자비 0');
  near(zero.perTon.value, 0, 1e-12, '0 나눗셈 방어');
}

// ===== 근거가 붙어 있는가 (res 규약) =====
{
  const c = cost.computeCost({
    type: 'silo', config: { basisCapacity: 50000, baseCost: 80 },
    exponent: 0.6, unitCapacity: 100000, unitCount: 3
  });
  ['basisCapacity', 'baseCost', 'scaleFactor', 'unitCost', 'unitCount', 'total', 'perTon']
    .forEach(function (k) {
      assert.ok(c[k] && c[k].formula && c[k].source, k + ' 에 식·출처가 있어야 한다');
    });
  assert.strictEqual(c.unitCount.unit, '기', 'Silo 의 단위는 기');
  assert.strictEqual(cost.UNIT_LABEL.yard, '열');
  assert.strictEqual(cost.UNIT_LABEL.shed, '동');
}

// ===== 상태 기본값이 실제로 흘러 들어가는가 =====
// initialState 가 cost 를 빠뜨리면 모든 투자비가 0 으로 나온다.
{
  const s = app.initialState();
  assert.ok(s.cost, 'initialState 에 cost 가 있어야 한다');
  near(s.cost.exponent, 0.6, 1e-12, '기본 규모지수 0.6');

  const r = cmp.compareTypes(s, 'coal');
  assert.ok(r.silo.cost.total.value > 0, 'Silo 투자비가 0 이면 안 된다');
  assert.ok(r.shed.cost.total.value > 0, 'Shed 투자비가 0 이면 안 된다');
  near(r.yard.cost.total.value, 0, 1e-12, '오픈야드는 0원 가정');
  assert.strictEqual(r.cheapest, 'yard', '0원인 오픈야드가 최소 투자비');
}

// ===== 면적 최소 ≠ 투자비 최소 (트레이드오프가 실제로 드러나는가) =====
{
  const s = app.initialState();
  const r = cmp.compareTypes(s, 'coal');
  assert.strictEqual(r.best, 'silo', 'Silo 가 면적은 가장 작다');
  assert.notStrictEqual(r.best, r.cheapest,
    '면적 최소와 투자비 최소가 갈려야 비교의 의미가 있다');
  assert.ok(r.silo.cost.perTon.value > r.yard.cost.perTon.value,
    'Silo 는 톤당 투자비가 오픈야드보다 비싸다');
}

// ===== 사용자가 기준값을 바꾸면 결과가 따라가는가 =====
{
  const s = app.initialState();
  const base = cmp.compareTypes(s, 'coal').silo.cost.total.value;

  s.cost.silo.baseCost = 160;                       // 기준 투자비 2배
  near(cmp.compareTypes(s, 'coal').silo.cost.total.value, base * 2, 1e-6,
    '기준 투자비 2배 → 총 투자비 2배');

  s.cost.silo.baseCost = 80;
  s.cost.exponent = 1;                              // 규모지수 1 = 정비례
  const lin = cmp.compareTypes(s, 'coal').silo.cost;
  near(lin.scaleFactor.value,
    s.silo.capacity / s.cost.silo.basisCapacity, 1e-9, '지수 1 이면 용량비 그대로');
}

// ===== 설비 1기 용량이 타입마다 맞게 잡히는가 =====
{
  const s = app.initialState();
  const r = cmp.compareTypes(s, 'coal');
  near(r.silo.cost.unitCapacity, s.silo.capacity, 1e-9, 'Silo 1기 = 설정 용량');
  assert.strictEqual(r.silo.cost.unitCount.value, r.silo.sizing.count.value, 'Silo 수량 = 기수');
  assert.strictEqual(r.yard.cost.unitCount.value, r.yard.sizing.rows.value, '야드 수량 = 열 수');
  assert.strictEqual(r.shed.cost.unitCount.value, 1, 'Shed 는 건물 1동');
  near(r.shed.cost.unitCapacity, r.shed.sizing.totalCapacity.value, 1e-6,
    'Shed 1동 용량 = 건물 전량');
}

// ===== 기준 투자비 0 × 극단 규모지수 → NaN 이 나오면 안 된다 =====
// 오픈야드는 기준 투자비가 0 이다. 0 × Infinity = NaN 이라 화면에 NaN 이 뜬다.
{
  const c = cost.computeCost({
    type: 'yard', config: { basisCapacity: 100000, baseCost: 0 },
    exponent: 1e12, unitCapacity: 137088, unitCount: 4
  });
  assert.ok(Number.isFinite(c.total.value), '총 투자비가 NaN 이면 안 된다: ' + c.total.value);
  assert.ok(Number.isFinite(c.perTon.value), '톤당 투자비가 NaN 이면 안 된다');
  near(c.total.value, 0, 1e-12, '기준 투자비 0 이면 지수와 무관하게 0');
}

console.log('OK: cost');
