const assert = require('assert');
const shed = require('../js/rsd-engine-shed.js');
const data = require('../js/rsd-data.js');

function near(actual, expected, tolPct, label) {
  const diff = Math.abs(actual - expected);
  const tol = Math.abs(expected) * tolPct / 100;
  assert.ok(diff <= tol,
    `${label}: 계산 ${actual} vs 실적 ${expected} — 오차 ${(diff / Math.abs(expected) * 100).toFixed(4)}% > 허용 ${tolPct}%`);
}

// ===== 회귀: 단면 3영역 =====
{
  const IN = data.PRESETS.exampleShed.input;
  const s = shed.computeSection(IN);
  near(s.h1.value, 22.41, 0.2, 'h1 = La × tan(안식각)');
  near(s.A1.value, 358.51, 0.1, '① 단면적 = ½ × La × h1');
  near(s.wallHeight.value, 14.70, 0.2, '옹벽측 높이 = h1 − Lb × tan(안식각)');
  near(s.A2.value, 204.11, 0.1, '② 단면적 = Lb × (h1 + 옹벽측높이)/2');
  near(s.h3.value, 6.43, 0.5, 'h3 = (La+Lb) × tan(하부경사각)');
  near(s.A3.value, 138.17, 0.1, '③ 단면적 = ½ × (La+Lb) × h3');
  near(s.sectionArea.value, data.PRESETS.exampleShed.expected.sectionArea, 0.1, '총 단면적');
  near(s.tPerM.value, data.PRESETS.exampleShed.expected.tPerM, 0.1, '단위길이 용량 = 단면적 × 비중');
}

// ===== 회귀: Shed 예시 전체 =====
{
  const p = data.PRESETS.exampleShed;
  const r = shed.computeShed(p.input);

  // 셀 12개 (2 bay × 6셀)
  assert.strictEqual(r.cells.length, 12, '셀 개수 = 2 bay × 6셀');

  // bay당 적치길이 = 그 bay 셀 길이의 합
  near(r.stackLengthPerBay.value, data.PRESETS.exampleShed.expected.stackLengthPerBay, 0.01, 'bay당 적치길이');

  // 총 저장용량 267,659 t
  near(r.totalCapacity.value, p.expected.totalCapacity, 0.1, '총 저장용량');

  const E = data.PRESETS.exampleShed.expected;
  near(r.length.value, E.length, 0.1, 'Shed 길이');
  near(r.width.value, E.width, 0.1, 'Shed 폭');
  near(r.area.value, E.length * E.width, 0.2, 'Shed 면적');

  // 개별 셀 용량 = 셀 길이 × 단위길이 용량 (t/m)
  // 길이에 정비례해야 한다 — 그래야 셀을 늘리고 줄이는 계산이 맞는다
  const tPerM = r.section.tPerM.value;
  const c36 = r.cells.find(c => Math.abs(c.length.value - 36) < 0.01);
  near(c36.capacity.value, 36 * tPerM, 0.01, '36 m 셀 용량 = 36 × t/m');

  const c18 = r.cells.find(c => Math.abs(c.length.value - 18) < 0.01);
  near(c18.capacity.value, 18 * tPerM, 0.01, '18 m 셀 용량 = 18 × t/m');
  near(c36.capacity.value, c18.capacity.value * 2, 0.01, '길이 2배면 용량도 2배');

}

// ===== 1 bay 구성 =====
{
  const input = Object.assign({}, data.PRESETS.exampleShed.input, {
    bays: 1, cellsPerBay: [[18, 36, 36, 36, 36, 36]]
  });
  const r = shed.computeShed(input);
  assert.strictEqual(r.cells.length, 6);
  near(r.width.value, data.PRESETS.exampleShed.expected.width / 2, 0.1, '1 bay 폭 = 총폭의 절반');
  near(r.length.value, data.PRESETS.exampleShed.expected.length, 0.1, '길이는 bay 수와 무관');
}

// ===== 셀별 개별 길이 수정이 총용량에 반영되는가 =====
{
  const base = data.PRESETS.exampleShed.input;
  const modified = Object.assign({}, base, {
    cellsPerBay: [
      [18, 36, 36, 36, 36, 49],   // 마지막 셀을 36 → 49
      [18, 36, 36, 36, 36, 36]
    ]
  });
  const r0 = shed.computeShed(base);
  const r1 = shed.computeShed(modified);
  assert.ok(r1.totalCapacity.value > r0.totalCapacity.value, '셀을 늘리면 총용량이 늘어야 한다');
  assert.ok(r1.length.value > r0.length.value, '셀을 늘리면 건물 길이도 늘어야 한다');
  near(r1.totalCapacity.value - r0.totalCapacity.value,
    13 * r0.section.tPerM.value, 0.1, '증가분 = 13 m × t/m');
}

// ===== 경고: bay별 셀 배열 개수가 bays와 불일치 =====
{
  const input = Object.assign({}, data.PRESETS.exampleShed.input, {
    bays: 2, cellsPerBay: [[18, 36]]
  });
  const r = shed.computeShed(input);
  assert.ok(r.warnings.length > 0, 'bay 수와 셀 배열 개수가 다르면 경고해야 한다');
}

// ===== 추적 정보 =====
{
  const s = shed.computeSection({ La: 35, Lb: 10.5, repose: 36, bottomSlope: 8.47, density: 0.8 });
  assert.ok(s.sectionArea.formula.length > 0);
  assert.ok(s.sectionArea.substitution.length > 0);
  assert.strictEqual(s.sectionArea.unit, 'm²');
}

console.log('OK: engine-shed');
