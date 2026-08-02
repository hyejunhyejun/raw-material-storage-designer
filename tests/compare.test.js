const assert = require('assert');
const cmp = require('../js/rsd-ui-compare.js');
const app = require('../js/rsd-app.js');

const state = app.initialState();

// ===== 세 타입 모두 계산된다 =====
{
  const r = cmp.compareTypes(state, 'coal');
  assert.ok(r.yard && r.shed && r.silo, '세 타입 결과가 있어야 한다');
  ['yard', 'shed', 'silo'].forEach(function (t) {
    assert.ok(r[t].area > 0, t + ' 면적이 계산되어야 한다');
    assert.strictEqual(r[t].feasible, true, '석탄은 세 타입 모두 가능');
  });
}

// ===== 철광석은 Silo 불가 =====
{
  const r = cmp.compareTypes(state, 'ironOre');
  assert.strictEqual(r.yard.feasible, true);
  assert.strictEqual(r.shed.feasible, true);
  assert.strictEqual(r.silo.feasible, false, '철광석은 Silo 적용 대상이 아니다');
  assert.ok(r.silo.note.length > 0, '불가 사유가 있어야 한다');
}

// ===== 같은 용량 기준으로 비교된다 =====
{
  const r = cmp.compareTypes(state, 'coal');
  assert.ok(Math.abs(r.yard.targetCapacity - r.shed.targetCapacity) < 1,
    '세 타입이 같은 대상 저장용량을 쓴다');
  assert.ok(Math.abs(r.yard.targetCapacity - r.silo.targetCapacity) < 1);
}

// ===== 타입별 운영효율이 서로 다르게 적용된다 =====
{
  const r = cmp.compareTypes(state, 'coal');
  // 야드·Shed 는 0.75, Silo 는 0.60 → Silo 의 설계 대상용량이 더 크다
  assert.ok(r.silo.designCapacity > r.yard.designCapacity,
    'Silo 는 운영효율이 낮아 설계 대상용량이 더 크다');
  assert.ok(Math.abs(r.yard.designCapacity - r.shed.designCapacity) < 1,
    '야드와 Shed 는 같은 운영효율');
}

// ===== 사용량을 늘리면 면적도 는다 =====
{
  const s2 = app.initialState();
  s2.materials.coal.annualUsage *= 2;
  const a = cmp.compareTypes(state, 'coal').yard.area;
  const b = cmp.compareTypes(s2, 'coal').yard.area;
  assert.ok(b > a, '사용량 2배면 야드 면적이 늘어야 한다');
}

// ===== 최소 면적 타입을 짚어준다 =====
{
  const r = cmp.compareTypes(state, 'coal');
  const feas = ['yard', 'shed', 'silo'].filter(function (t) { return r[t].feasible; });
  const min = feas.reduce(function (a, b) { return r[a].area <= r[b].area ? a : b; });
  assert.strictEqual(r.best, min, 'best 는 적용 가능한 타입 중 최소 면적');
}

// ===== 적용 불가 타입은 best 후보가 아니다 =====
{
  const r = cmp.compareTypes(state, 'ironOre');
  assert.notStrictEqual(r.best, 'silo', '불가 타입은 추천되지 않는다');
}

// ===== 사용량 0 이면 안전하게 처리 =====
{
  const s3 = app.initialState();
  s3.materials.flux.annualUsage = 0;
  const r = cmp.compareTypes(s3, 'flux');
  assert.ok(r.yard, '사용량 0이어도 결과 객체는 존재');
  assert.ok(r.yard.area >= 0);
}

// ===== 면적당 저장량(t/m²)과 부지 치수 =====
{
  const r = cmp.compareTypes(state, 'coal');
  ['yard', 'shed', 'silo'].forEach(function (t) {
    assert.ok(r[t].tPerM2 > 0, t + ' 면적당 저장량이 계산되어야 한다');
    // t/m² = 대상 저장용량 ÷ 면적
    const expect = r[t].targetCapacity / r[t].area;
    assert.ok(Math.abs(r[t].tPerM2 - expect) < 1e-9, t + ' t/m² 정의 일치');
    assert.ok(r[t].footprint, t + ' 부지 치수가 있어야 한다');
    assert.ok(r[t].footprint.L > 0 && r[t].footprint.W > 0 && r[t].footprint.H > 0);
  });
  // Silo 는 높이를 쓰므로 면적당 저장량이 야드보다 크다
  assert.ok(r.silo.tPerM2 > r.yard.tPerM2, 'Silo 가 야드보다 면적 효율이 높다');
}

// ===== 오픈야드 대비 면적 비율 =====
{
  const r = cmp.compareTypes(state, 'coal');
  assert.strictEqual(Math.round(r.yard.vsYardPct), 100, '기준은 오픈야드 100%');
  ['shed', 'silo'].forEach(function (t) {
    const expect = r[t].area / r.yard.area * 100;
    assert.ok(Math.abs(r[t].vsYardPct - expect) < 1e-9, t + ' 비율 정의 일치');
    assert.ok(r[t].vsYardPct < 100, t + ' 는 오픈야드보다 면적이 작다');
  });
}

console.log('OK: compare');
