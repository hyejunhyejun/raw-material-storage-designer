const assert = require('assert');
const dsl = require('../js/rsd-draw2d-silo.js');

const O = {
  count: 14, rows: 1, perRow: 14, pitch: 51, innerDia: 41,
  footprintWidth: 61, corridorWidth: 5,
  bandLength: 724, bandWidth: 66, totalHeight: 57.6, color: '#2B2B33'
};

// ===== 평면도 =====
{
  const svg = dsl.drawSiloPlan(O);
  assert.ok(/^<svg/.test(svg.trim()));
  assert.strictEqual((svg.match(/class="silo"/g) || []).length, 14, 'Silo 14기가 그려진다');
  assert.strictEqual((svg.match(/class="silo-no"/g) || []).length, 14, '번호 14개');
  assert.ok(/class="silo-corridor"/.test(svg), 'corridor 띠');
  assert.ok(/51/.test(svg), '중심간격 51 m 치수');
  assert.ok(/724/.test(svg), '배치 길이 724 m 치수');
}

// ===== 기수·열수 변경이 반영된다 =====
{
  const svg = dsl.drawSiloPlan(Object.assign({}, O, { count: 8, rows: 2, perRow: 4 }));
  assert.strictEqual((svg.match(/class="silo"/g) || []).length, 8);
}

// ===== 마지막 열이 덜 찬 경우에도 기수만큼만 그린다 =====
{
  const svg = dsl.drawSiloPlan(Object.assign({}, O, { count: 7, rows: 2, perRow: 4 }));
  assert.strictEqual((svg.match(/class="silo"/g) || []).length, 7, '7기면 7개만');
}

// ===== 입면도 =====
{
  const svg = dsl.drawSiloElevation(O);
  assert.ok(/class="silo-body"/.test(svg), '원통 몸통');
  assert.ok(/class="silo-roof"/.test(svg), '원뿔 지붕');
  assert.ok(/class="silo-gallery"/.test(svg), '상부 B/C 갤러리');
  assert.ok(/57\.6/.test(svg), '전체 높이 치수');
  assert.ok(/41/.test(svg), '내부 직경 치수');
  assert.ok(/class="silo-rdm"/.test(svg), '하부 RDM 배출부');
}

console.log('OK: draw2d-silo');
