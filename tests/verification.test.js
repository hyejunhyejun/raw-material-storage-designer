const assert = require('assert');
const ui = require('../js/rsd-ui.js');

const rows = ui.buildVerification();

// 검증 항목이 사양서 §8.1의 기준을 모두 덮는가
assert.ok(rows.length >= 9, `검증 행이 9개 이상이어야 한다 (현재 ${rows.length})`);

// 각 행의 형태
for (const r of rows) {
  assert.ok(typeof r.case === 'string' && r.case.length > 0, '케이스명 필요');
  assert.ok(typeof r.item === 'string' && r.item.length > 0, '항목명 필요');
  assert.strictEqual(typeof r.calculated, 'number', '계산값은 숫자');
  assert.strictEqual(typeof r.actual, 'number', '실적값은 숫자');
  assert.strictEqual(typeof r.errorPct, 'number', '오차율은 숫자');
  assert.strictEqual(typeof r.pass, 'boolean', '합격여부는 불리언');
}

// 필수 케이스가 포함되어 있는가
const cases = rows.map(r => r.case);
for (const c of ['예시 A · 석탄야드', '예시 B · 석탄야드', 'Shed 예시', 'Silo 예시', '마스터플랜']) {
  assert.ok(cases.some(x => x.indexOf(c) >= 0), `'${c}' 검증 행이 있어야 한다`);
}

// 전 항목이 허용오차 내에 있는가 — 이 툴의 신뢰도 그 자체
const failures = rows.filter(r => !r.pass);
assert.strictEqual(failures.length, 0,
  '검증 실패 항목:\n' + failures.map(f =>
    `  ${f.case} · ${f.item}: 계산 ${f.calculated} vs 실적 ${f.actual} (오차 ${f.errorPct.toFixed(3)}%)`
  ).join('\n'));

console.log(`OK: verification (${rows.length}개 항목 전부 허용오차 내)`);
