const assert = require('assert');
const yard = require('../js/rsd-engine-yard.js');
const data = require('../js/rsd-data.js');

function near(actual, expected, tolPct, label) {
  const diff = Math.abs(actual - expected);
  const tol = Math.abs(expected) * tolPct / 100;
  assert.ok(diff <= tol,
    `${label}: 계산 ${actual} vs 실적 ${expected} — 오차 ${(diff / Math.abs(expected) * 100).toFixed(4)}% > 허용 ${tolPct}%`);
}

// ===== 회귀: 예시 야드 A =====
{
  const p = data.PRESETS.exampleYardA;
  const r = yard.computeYard(p.input);
  // 매직넘버 대신 관계식으로 — 프리셋이 바뀌어도 검사 의미가 유지된다
  assert.strictEqual(r.stackLength.value, p.input.yardLength - p.input.maintLength, '적치길이 C = A − B');
  assert.strictEqual(r.stackWidth.value, p.input.yardWidth - p.input.roadWidth, '적치폭 F = D − E');
  near(r.pileHeight.value, p.expected.pileHeight, 0.2, '파일높이 G');
  assert.strictEqual(r.prismLength.value, p.expected.prismLength, '삼각파일길이 L');
  near(r.volume.value, p.expected.volume, 0.1, '체적 N');
  near(r.maxCapacity.value, p.expected.maxCapacity, 0.1, '최대적치량 O');
  near(r.effectiveCapacity.value, p.expected.effectiveCapacity, 0.1, '유효적치량 Q');
  assert.strictEqual(r.stackArea.value, p.expected.stackArea, '적치면적 R = C × D');
  assert.strictEqual(r.footprintArea.value, p.input.yardLength * p.input.yardWidth, '점유면적 = A × D');
}

// ===== 회귀: 예시 야드 B =====
{
  const p = data.PRESETS.exampleYardB;
  const r = yard.computeYard(p.input);
  assert.strictEqual(r.stackLength.value, p.input.yardLength - p.input.maintLength);
  assert.strictEqual(r.prismLength.value, p.expected.prismLength, '삼각파일길이 L');
  near(r.volume.value, p.expected.volume, 0.1, '체적 N');
  near(r.effectiveCapacity.value, p.expected.effectiveCapacity, 0.1, '유효적치량 Q');
  assert.strictEqual(r.stackArea.value, p.expected.stackArea);
}

// ===== 열 수 산정 (정방향) =====
// 운영효율 이중적용 방지 회귀:
//   설계 대상용량 = 대상용량 ÷ 운영효율  (효율 미반영, 최대적치 기준)
//   따라서 최대 적치량 O 와 비교해야 한다. 유효 적치량 Q 와 비교하면 효율이 두 번 들어간다.
//
//   예시 야드 A 의 최대적치량 O 와 유효적치량 Q(= O × 0.75) 를 놓고,
//   설계 대상용량을 O 의 2.5배쯤 주면
//   정답 : ceil(2.5) = 3열   /   오답(Q 기준) : ceil(3.33) = 4열  ← 면적 33% 과다
{
  const base0 = data.PRESETS.exampleYardA.input;
  const O0 = yard.computeYard(base0).maxCapacity.value;
  const Q0 = yard.computeYard(base0).effectiveCapacity.value;
  const input = Object.assign({}, base0, { designCapacity: O0 * 2.5 });
  const r = yard.computeYard(input);
  assert.strictEqual(r.rows.value, 3,
    '열 수는 설계 대상용량 ÷ 최대 적치량 O 로 산정해야 한다 (효율 이중적용 금지)');
  near(r.totalCapacity.value, Q0 * 3, 0.1, '최종 적치가능 용량 = 1열 유효적치량 × 열수');
}

// 경계값은 엔진이 실제로 계산한 O 를 기준으로 잡는다.
// 반올림된 표값을 쓰면 부동소수점 경계에 걸린다.
{
  const base = data.PRESETS.exampleYardA.input;
  const O = yard.computeYard(base).maxCapacity.value;

  // 설계 대상용량이 최대 적치량과 정확히 같으면 1열
  const eq = yard.computeYard(Object.assign({}, base, { designCapacity: O }));
  assert.strictEqual(eq.rows.value, 1, '설계용량 = 1열 최대적치량이면 1열');

  // 조금이라도 넘으면 2열
  const over = yard.computeYard(Object.assign({}, base, { designCapacity: O + 1 }));
  assert.strictEqual(over.rows.value, 2, '설계용량이 1열 최대적치량을 넘으면 2열');

  // 최대 적치량의 2배까지는 2열
  const two = yard.computeYard(Object.assign({}, base, { designCapacity: O * 2 }));
  assert.strictEqual(two.rows.value, 2, '최대적치량 2배면 2열');
}

// ===== 재고일수 역산 =====
{
  const b = data.PRESETS.exampleYardA.input;
  const Q = yard.computeYard(b).effectiveCapacity.value;
  const O2 = yard.computeYard(b).maxCapacity.value;
  const input = Object.assign({}, b, { designCapacity: O2 * 2.5, daily: 10000 });
  const r = yard.computeYard(input);
  // 3열 × 1열 유효적치량 ÷ 일일 사용량
  near(r.achievedStockDays.value, Q * 3 / 10000, 1, '최종 적치가능 재고일수');
}

// ===== 경고: 파일이 적치길이를 초과하는 경우 =====
{
  // 야드를 200 m 로 줄이면 파일이 적치길이에 들어가지 못한다
  const input = Object.assign({}, data.PRESETS.exampleYardA.input, { yardLength: 200 });
  const r = yard.computeYard(input);
  assert.ok(r.warnings.length > 0, '삼각파일 길이가 음수면 경고해야 한다');
  assert.ok(/파일/.test(r.warnings[0]), '경고 문구에 원인이 담겨야 한다');
  assert.ok(r.prismLength.value >= 0, '삼각파일 길이는 음수로 반환되지 않아야 한다');
  assert.ok(r.effectiveCapacity.value >= 0, '용량은 음수가 되지 않아야 한다');
}

// ===== 추적 정보가 채워져 있는가 =====
{
  const r = yard.computeYard(data.PRESETS.exampleYardA.input);
  assert.ok(r.effectiveCapacity.formula.length > 0, '식이 있어야 한다');
  assert.ok(r.effectiveCapacity.substitution.length > 0, '대입값이 있어야 한다');
  assert.ok(r.effectiveCapacity.source.length > 0, '근거가 있어야 한다');
  assert.strictEqual(r.effectiveCapacity.unit, 't');
}

console.log('OK: engine-yard');
