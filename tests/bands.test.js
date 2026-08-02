const assert = require('assert');
const bands = require('../js/rsd-bands.js');
const app = require('../js/rsd-app.js');

function yardIdx(a) {
  return a.map(function (b, i) { return b.kind === 'yard' ? i : -1; })
          .filter(function (i) { return i >= 0; });
}

// ===== 인접한 모든 야드 쌍 사이에 S/R 띠가 있다 =====
{
  const s = app.initialState();
  const r = app.recompute(s);
  const a = bands.buildBands(s, r);

  const yi = yardIdx(a);
  assert.ok(yi.length >= 2, '기본 시나리오는 야드가 2열 이상');

  for (let k = 0; k < yi.length - 1; k++) {
    const gap = a.slice(yi[k] + 1, yi[k + 1]);
    assert.ok(gap.some(function (b) { return b.kind === 'sr'; }),
      '야드 ' + k + '와 ' + (k + 1) + ' 사이에 S/R 띠가 있어야 한다');
  }
}

// ===== 원료가 달라도 야드 사이에는 S/R 이 들어간다 (기존 버그) =====
{
  const s = app.initialState();
  s.materials.coal.storageType = 'yard';   // 세 원료 모두 야드
  const r = app.recompute(s);
  const a = bands.buildBands(s, r);
  const cov = bands.srCoverage(a);
  assert.strictEqual(cov.covered, true,
    '모든 야드가 S/R 띠와 맞닿아야 한다. 미충족: ' + cov.uncovered.join(', '));
}

// ===== 야드 1열이면 한쪽에 띠를 붙인다 =====
{
  const s = app.initialState();
  s.materials.coal.enabled = false;
  s.materials.ironOre.enabled = false;
  s.materials.flux.storageType = 'yard';
  s.yard.yardLength = 4000;                // 1열로 충분하게
  const r = app.recompute(s);
  const a = bands.buildBands(s, r);
  assert.strictEqual(yardIdx(a).length, 1, '야드 1열');
  assert.strictEqual(a.filter(function (b) { return b.kind === 'sr'; }).length, 1,
    '야드 1열이어도 S/R 띠 1개는 있어야 한다');
  assert.strictEqual(bands.srCoverage(a).covered, true);
}

// ===== 야드 n열이면 S/R 띠는 n−1개 (2열 이상) =====
{
  const s = app.initialState();
  s.materials.coal.storageType = 'yard';
  const r = app.recompute(s);
  const a = bands.buildBands(s, r);
  const n = yardIdx(a).length;
  const srCount = a.filter(function (b) { return b.kind === 'sr'; }).length;
  assert.strictEqual(srCount, n - 1, 'S/R 띠는 야드 수 − 1 (띠 하나가 좌우를 모두 담당)');
}

// ===== 야드가 없으면 S/R 띠도 없다 =====
{
  const s = app.initialState();
  s.materials.ironOre.storageType = 'shed';
  s.materials.flux.storageType = 'shed';
  s.materials.coal.storageType = 'silo';
  const r = app.recompute(s);
  const a = bands.buildBands(s, r);
  assert.strictEqual(a.filter(function (b) { return b.kind === 'sr'; }).length, 0);
  assert.strictEqual(bands.srCoverage(a).covered, true, '야드가 없으면 미충족도 없다');
}

// ===== 총 폭은 띠 폭의 합 =====
{
  const s = app.initialState();
  const r = app.recompute(s);
  const a = bands.buildBands(s, r);
  const w = a.reduce(function (t, b) { return t + b.width; }, 0);
  assert.ok(w > 0);
  assert.strictEqual(bands.totalWidth(a), w);
}

// ===== 띠 재배열이 rsd-bands 결과 위에서 동작하는가 =====
// 드래그 핸들러가 buildBands 를 어디서 가져오는지 틀리면 조용히 죽는다.
// (예전에 uiFacility.buildBands 를 부르다가 모듈 이동 후 undefined 가 되어 드래그가 먹통이었다)
{
  const dm = require('../js/rsd-draw2d-master.js');
  const s = app.initialState();
  const r = app.recompute(s);
  const a = bands.buildBands(s, r);
  assert.ok(a.length > 3, '띠가 충분히 있어야 한다');

  const idx = a.map(function (_, i) { return i; });
  const moved = dm.reorderBands(idx, 1, a.length - 2);
  assert.notDeepStrictEqual(moved, idx, '순서가 실제로 바뀌어야 한다');

  // 순서를 적용해도 띠 집합은 그대로 (총폭 불변)
  const reordered = moved.map(function (i) { return a[i]; });
  assert.strictEqual(bands.totalWidth(reordered), bands.totalWidth(a));
}

// ===== 마스터플랜 UI 모듈은 buildBands 를 더 이상 노출하지 않는다 =====
{
  const uiFac = require('../js/rsd-ui-facility.js');
  assert.strictEqual(typeof uiFac.buildBands, 'undefined',
    '띠 구성은 rsd-bands 단독 책임 — 중복 노출하면 호출부가 엇갈린다');
}

console.log('OK: bands');
