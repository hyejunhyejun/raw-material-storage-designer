const assert = require('assert');
const core = require('../js/rsd-core.js');

// --- res() 추적 객체 ---
const r = core.res(90000, 't', '유효적치량 = 최대적치량 × 적치효율', '= 120,000 × 0.75', '예시 야드 A 설계자료');
assert.strictEqual(r.value, 90000);
assert.strictEqual(r.unit, 't');
assert.strictEqual(r.formula, '유효적치량 = 최대적치량 × 적치효율');
assert.strictEqual(r.substitution, '= 120,000 × 0.75');
assert.strictEqual(r.source, '예시 야드 A 설계자료');

// --- computeDemand() 정방향 파이프라인 ---
// 연간 365만톤, 가동 365일, 재고 30일, 운영효율 75%
// 일일 = 10,000 t/day / 대상용량 = 300,000 t / 설계용량 = 400,000 t
const d = core.computeDemand({
  annualUsage: 3650000, operatingDays: 365, stockDays: 30, operatingEff: 0.75, label: '석탄'
});
assert.strictEqual(d.daily.value, 10000);
assert.strictEqual(d.targetCapacity.value, 300000);
assert.strictEqual(d.designCapacity.value, 400000);
assert.strictEqual(d.daily.unit, 't/day');
assert.ok(d.targetCapacity.formula.length > 0, '식이 채워져 있어야 한다');

// --- 운영효율 0 방어 ---
assert.throws(
  () => core.computeDemand({ annualUsage: 100, operatingDays: 365, stockDays: 1, operatingEff: 0 }),
  /운영효율/,
  '운영효율 0이면 오류를 던져야 한다'
);

// --- 가동일수 0 방어 ---
assert.throws(
  () => core.computeDemand({ annualUsage: 100, operatingDays: 0, stockDays: 1, operatingEff: 0.75 }),
  /가동일수/,
  '가동일수 0이면 오류를 던져야 한다'
);

console.log('OK: core');
