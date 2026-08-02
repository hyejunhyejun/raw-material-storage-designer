const assert = require('assert');
const app = require('../js/rsd-app.js');
const yardE = require('../js/rsd-engine-yard.js');

// ===== 파일 수를 늘리면 용량은 줄고 열 수는 늘어야 한다 =====
// 파일 1개는 최소 원뿔 2개(지름 F)를 차지한다. 들어가지 못하는 파일을 그대로 세면
// 원뿔 체적이 파일 수에 비례해 커져 "파일을 늘릴수록 면적이 줄어드는" 거꾸로 된
// 결과가 나온다 (실제로 I=14 → 4열, I=30 → 2열 이었다).
{
  const runs = [1, 2, 4, 8, 10, 12, 14, 20, 30, 100].map(function (n) {
    const s = app.initialState();
    s.materials.ironOre.pileCount = n;
    const r = app.recompute(s);
    return { n: n, sz: r.materials.ironOre.sizing, area: r.materials.ironOre.area };
  });

  for (let i = 1; i < runs.length; i++) {
    assert.ok(runs[i].sz.maxCapacity.value <= runs[i - 1].sz.maxCapacity.value + 1e-6,
      '파일 ' + runs[i].n + '개에서 최대 적치량이 늘었다 (' +
      runs[i - 1].sz.maxCapacity.value.toFixed(0) + ' → ' + runs[i].sz.maxCapacity.value.toFixed(0) + ')');
    assert.ok(runs[i].area >= runs[i - 1].area - 1e-6,
      '파일 ' + runs[i].n + '개에서 면적이 줄었다');
  }

  // 들어가지 않는 파일은 잘라내고 경고한다
  const big = runs[runs.length - 1];
  assert.ok(big.sz.pileCount.value < 100, '100개는 750 m 야드에 들어가지 않는다');
  assert.ok(big.sz.warnings.some(function (w) { return /들어가지 않습니다/.test(w); }),
    '잘라냈으면 왜 잘랐는지 알려야 한다');
  // 삼각파일 길이는 음수가 될 수 없다
  runs.forEach(function (r) {
    assert.ok(r.sz.prismLength.value >= 0, '삼각파일 길이 음수 (I=' + r.n + ')');
  });
}

// ===== 최대 배치 개수 = ⌊(C+J)/(F+J)⌋ =====
{
  // C = 800−40 = 760, F = 45−4 = 41, J = 5  →  ⌊765/46⌋ = 16
  const z = yardE.computeYard({
    yardLength: 800, maintLength: 40, yardWidth: 45, roadWidth: 4,
    pileCount: 99, pileGap: 5, density: 0.85, repose: 35, operatingEff: 0.75
  });
  assert.strictEqual(z.pileCount.value, 16, '760 m 적치길이에는 41+5 m 파일이 16개');
  // 16개는 딱 맞고 17개는 안 들어간다
  const ok16 = yardE.computeYard({
    yardLength: 800, maintLength: 40, yardWidth: 45, roadWidth: 4,
    pileCount: 16, pileGap: 5, density: 0.85, repose: 35, operatingEff: 0.75
  });
  assert.strictEqual(ok16.pileCount.value, 16);
  assert.strictEqual(ok16.warnings.length, 0, '딱 맞으면 경고 없음');
}

// ===== 담을 것이 없으면 부지도 없다 =====
// 사용량 0 인 원료가 최소 1열·1기·1셀을 차지하면 총 면적이 거짓말이 된다.
{
  ['annualUsage', 'stockDays'].forEach(function (field) {
    const s = app.initialState();
    s.materials.flux.storageType = 'shed';           // 세 타입을 모두 걸친다
    Object.keys(s.materials).forEach(function (k) { s.materials[k][field] = 0; });
    const r = app.recompute(s);
    Object.keys(r.materials).forEach(function (k) {
      assert.strictEqual(r.materials[k].area, 0,
        field + '=0 인데 ' + k + '(' + r.materials[k].type + ')가 면적을 차지한다');
    });
    assert.strictEqual(r.totals.area, 0, field + '=0 이면 총면적도 0');
  });
}

// ===== 부지 길이는 실제 설비 길이를 따른다 =====
// 외곽도로를 야드 길이로 고정하면 오픈야드를 안 쓰는 구성에서도 부지가 늘어난다.
{
  const B = require('../js/rsd-bands.js');
  const s = app.initialState();
  Object.keys(s.materials).forEach(function (k) { s.materials[k].storageType = 'shed'; });
  const r = app.recompute(s);
  const bands = B.buildBands(s, r);
  const site = B.totalLength(bands);
  assert.ok(site < s.yard.yardLength,
    '오픈야드가 없으면 부지 길이가 야드 길이(' + s.yard.yardLength + ')에 묶이면 안 된다 (현재 ' + site + ')');
  bands.filter(function (b) { return b.kind === 'road'; }).forEach(function (b) {
    assert.strictEqual(b.length, site, '외곽도로는 부지 길이만큼만');
  });
}

// ===== 어떤 입력에도 계산이 깨지지 않는다 =====
{
  const tweaks = [
    ['통행로 0', function (s) { s.yard.roadWidth = 0; }],
    ['통행로가 야드폭보다 큼', function (s) { s.yard.roadWidth = 60; }],
    ['정비공간이 야드길이보다 큼', function (s) { s.yard.maintLength = 900; }],
    ['파일간격 0', function (s) { s.materials.ironOre.pileGap = 0; }],
    ['운영효율 0.01', function (s) { s.yard.operatingEff = 0.01; }],
    ['가동일수 1일', function (s) { s.operatingDays = 1; }],
    ['Silo 5열', function (s) { s.silo.rows = 5; }],
    ['Shed 1 bay', function (s) { s.materials.flux.storageType = 'shed'; s.shed.bays = 1; }],
    ['전 원료 끔', function (s) { Object.keys(s.materials).forEach(function (k) { s.materials[k].enabled = false; }); }]
  ];
  tweaks.forEach(function (t) {
    const s = app.initialState();
    t[1](s);
    let r;
    assert.doesNotThrow(function () { r = app.recompute(s); }, t[0] + ' 에서 계산이 죽는다');
    assert.ok(isFinite(r.totals.area) && r.totals.area >= 0,
      t[0] + ' 에서 총면적이 비정상 (' + r.totals.area + ')');
    Object.keys(r.materials).forEach(function (k) {
      const sz = r.materials[k].sizing || {};
      Object.keys(sz).forEach(function (key) {
        const v = sz[key];
        if (v && typeof v === 'object' && typeof v.value === 'number') {
          assert.ok(isFinite(v.value), t[0] + ' → ' + k + '.' + key + ' 가 ' + v.value);
        }
      });
    });
  });
}

console.log('OK: edge-cases');
