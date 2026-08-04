const assert = require('assert');
const app = require('../js/rsd-app.js');
const shed = require('../js/rsd-engine-shed.js');
const data = require('../js/rsd-data.js');
const B = require('../js/rsd-bands.js');
const ui = require('../js/rsd-ui-facility.js');

function sharedState() {
  const s = app.initialState();
  Object.keys(s.materials).forEach(function (k) { s.materials[k].storageType = 'shed'; });
  s.shed.buildingMode = 'shared';
  return s;
}

// ===== 같은 크기 셀이라도 원료마다 담기는 양이 다르다 =====
// 안식각이 크면 더 높이 쌓이고, 비중이 크면 같은 부피에 더 많은 톤이 들어간다.
// 이걸 무시하고 한 가지 t/m 으로 배분하면 셀 개수가 통째로 틀린다.
{
  const mats = {
    coal:    { label: '석탄',   density: 0.8, repose: 36, color: '#2B2B33' },
    ironOre: { label: '철광석', density: 2.3, repose: 33, color: '#8C4A38' }
  };
  const D = data.getDefaults();
  const r = shed.computeShed(Object.assign({}, D.shed, {
    density: 0.8, repose: 36, materialsByKey: mats,
    cellsPerBay: [[{ length: 37, key: 'coal' }], [{ length: 37, key: 'ironOre' }]]
  }));

  const coalCell = r.cells.filter(function (c) { return c.key === 'coal'; })[0];
  const oreCell = r.cells.filter(function (c) { return c.key === 'ironOre'; })[0];
  assert.ok(oreCell.capacity.value > coalCell.capacity.value * 2,
    '철광석(2.3)은 같은 셀에 석탄(0.8)의 2배 넘게 담겨야 한다 (' +
    Math.round(coalCell.capacity.value) + ' vs ' + Math.round(oreCell.capacity.value) + ')');

  // 안식각이 클수록 더 높이 쌓여 단면적이 크다
  assert.ok(r.sections.coal.sectionArea.value > r.sections.ironOre.sectionArea.value,
    '안식각 36° 가 33° 보다 단면적이 커야 한다');
  // t/m = 단면적 × 비중 — 비중 차이가 더 크므로 철광석이 이긴다
  assert.ok(r.sections.ironOre.tPerM.value > r.sections.coal.tPerM.value);

  assert.strictEqual(r.byMaterial.coal.cellCount, 1);
  assert.strictEqual(r.byMaterial.ironOre.cellCount, 1);
  assert.strictEqual(r.shared, true, '두 종류 이상이면 공용으로 표시');
}

// ===== 원료를 지정하지 않은 셀은 예전처럼 동작한다 (하위 호환) =====
{
  const D = data.getDefaults();
  const plain = shed.computeShed(Object.assign({}, D.shed, {
    density: 0.8, repose: 36, cellsPerBay: [[37, 37], [37, 37]]
  }));
  assert.strictEqual(plain.cells.length, 4);
  assert.strictEqual(plain.shared, false);
  assert.strictEqual(plain.cells[0].key, null);

  // 숫자로 주나 { length } 객체로 주나 결과가 같아야 한다
  const obj = shed.computeShed(Object.assign({}, D.shed, {
    density: 0.8, repose: 36,
    cellsPerBay: [[{ length: 37 }, { length: 37 }], [{ length: 37 }, { length: 37 }]]
  }));
  assert.strictEqual(obj.totalCapacity.value, plain.totalCapacity.value);
}

// ===== 공용 Shed 는 건물을 하나만 세운다 =====
{
  const s = sharedState();
  const r = app.recompute(s);
  assert.ok(r.sharedShed, '공용 모드면 sharedShed 가 있어야 한다');
  assert.strictEqual(r.sharedShed.keys.length, 3, '원료 3종이 한 동에');

  const bands = B.buildBands(s, r);
  const shedBands = bands.filter(function (b) { return b.kind === 'shed'; });
  assert.strictEqual(shedBands.length, 1,
    '건물이 하나면 띠도 하나 — 원료마다 띠를 내면 같은 건물이 3개로 그려진다');
  assert.ok(/공용 Shed/.test(shedBands[0].label));
  assert.strictEqual(shedBands[0].sharedKeys.length, 3);

  // 면적 일관성: ① 총면적 = 띠 실면적
  const facility = bands.filter(function (b) { return b.kind !== 'road'; })
    .reduce(function (t, b) { return t + b.width * b.length; }, 0);
  assert.ok(Math.abs(r.totals.area - facility) < 1e-6,
    '공용 Shed 에서도 ① 총면적과 배치도가 맞아야 한다 (' +
    Math.round(r.totals.area) + ' vs ' + Math.round(facility) + ')');

  // 원료별 배분 면적의 합 = 건물 면적
  const sum = r.sharedShed.keys.reduce(function (t, k) { return t + r.materials[k].area; }, 0);
  assert.ok(Math.abs(sum - r.sharedShed.sizing.area.value) < 1e-6);
}

// ===== 한 동에 모으면 따로 짓는 것보다 면적이 준다 =====
// 정비존·양단벽을 공유하기 때문. 이게 이 검토의 핵심 논거다.
{
  const sep = app.initialState();
  Object.keys(sep.materials).forEach(function (k) { sep.materials[k].storageType = 'shed'; });
  const aSep = app.recompute(sep).totals.area;
  const aShr = app.recompute(sharedState()).totals.area;
  assert.ok(aShr < aSep,
    '공용이 개별보다 면적이 작아야 한다 (개별 ' + Math.round(aSep) +
    ' vs 공용 ' + Math.round(aShr) + ')');
}

// ===== 각 원료가 필요한 만큼 확보되는가 =====
{
  const s = sharedState();
  const r = app.recompute(s);
  const bm = r.sharedShed.sizing.byMaterial;
  r.sharedShed.keys.forEach(function (k) {
    const need = r.materials[k].demand.designCapacity.value;
    assert.ok(bm[k].capacity >= need - 1e-6,
      k + ': 확보 ' + Math.round(bm[k].capacity) + ' t 가 필요 ' + Math.round(need) + ' t 에 못 미친다');
    // 셀 하나를 빼면 모자라야 한다 (과다 배분이 아님을 보인다)
    if (bm[k].cellCount > 1) {
      const oneLess = bm[k].capacity / bm[k].cellCount * (bm[k].cellCount - 1);
      assert.ok(oneLess < need, k + ': 셀이 하나 남는다 (과다 배분)');
    }
  });
}

// ===== bay 길이가 한쪽에 몰리지 않는다 =====
// 건물 길이는 긴 bay 가 결정하므로, 몰아 넣으면 건물이 길어진다.
{
  const s = sharedState();
  const r = app.recompute(s);
  const byBay = {};
  r.sharedShed.sizing.cells.forEach(function (c) {
    byBay[c.bay] = (byBay[c.bay] || 0) + c.length.value;
  });
  const lens = Object.keys(byBay).map(function (b) { return byBay[b]; });
  const spread = Math.max.apply(null, lens) - Math.min.apply(null, lens);
  assert.ok(spread <= s.shed.cellLength + 1e-6,
    'bay 길이 차이가 셀 하나를 넘으면 안 된다 (현재 ' + spread + ' m)');
}

// ===== 원료별로 뭉쳐 놓는가 =====
// 섞어 놓으면 Tripper 주행·불출 동선이 엉킨다.
{
  const s = sharedState();
  const r = app.recompute(s);
  const byBay = {};
  r.sharedShed.sizing.cells.forEach(function (c) {
    if (!byBay[c.bay]) byBay[c.bay] = [];
    byBay[c.bay].push(c.key);
  });
  Object.keys(byBay).forEach(function (b) {
    const seq = byBay[b];
    const seen = [];
    let last = null;
    seq.forEach(function (k) {
      if (k === last) return;
      assert.ok(seen.indexOf(k) < 0,
        'bay ' + b + ': ' + k + ' 구역이 두 군데로 쪼개졌다 (' + seq.join(',') + ')');
      seen.push(k);
      last = k;
    });
  });
}

// ===== 모드 값은 이름 있는 문자열이다 =====
// <select> 는 문자열을 돌려주므로 불리언을 쓰면 "false" 가 truthy 라 반드시 샌다.
{
  const s = sharedState();
  s.shed.buildingMode = 'separate';
  assert.ok(!app.recompute(s).sharedShed, 'separate 면 개별');
  s.shed.buildingMode = 'shared';
  assert.ok(app.recompute(s).sharedShed, 'shared 면 공용');
  delete s.shed.buildingMode;
  assert.ok(!app.recompute(s).sharedShed, '값이 없으면 개별 (안전한 기본)');
}

// ===== 화면 =====
{
  const s = sharedState();
  const r = app.recompute(s);
  const h = ui.renderShedResult(s, r);
  assert.ok(/공용 Shed/.test(h), '공용 카드가 나와야 한다');
  assert.ok(/원료별 셀 배분/.test(h), '배분표가 있어야 한다');
  ['석탄', '철광석', '석회석'].forEach(function (t) {
    assert.ok(h.indexOf(t) >= 0, t + ' 이 표에 있어야 한다');
  });
  // 건물이 하나면 카드도 한 장
  assert.strictEqual((h.match(/class="card material-block"/g) || []).length, 1);

  const inp = ui.renderShedInputs(s, r);
  assert.ok(inp.indexOf('data-path="shed.buildingMode"') >= 0, '건물 구성 선택이 있어야 한다');
}

// ===== 원료가 하나뿐이어도 깨지지 않는다 =====
{
  const s = app.initialState();
  Object.keys(s.materials).forEach(function (k) { s.materials[k].enabled = false; });
  s.materials.coal.enabled = true;
  s.materials.coal.storageType = 'shed';
  s.shed.buildingMode = 'shared';
  const r = app.recompute(s);
  assert.ok(r.sharedShed, '한 종류여도 공용 경로를 탄다');
  assert.strictEqual(r.sharedShed.sizing.shared, false, '한 종류면 shared 표시는 false');
  assert.ok(isFinite(r.totals.area) && r.totals.area > 0);
}

// ===== Shed 를 쓰는 원료가 없으면 =====
{
  const s = app.initialState();
  s.shed.buildingMode = 'shared';
  const r = app.recompute(s);
  assert.ok(!r.sharedShed, 'Shed 원료가 없으면 건물도 없다');
  assert.ok(isFinite(r.totals.area));
}

// ===== 3D Shed 내부 배치 좌표 =====
// 압출 방향 부호를 그리는 코드 안에서 잡다가 더미가 중앙 옹벽을 뚫은 적이 있다.
// 좌표를 떼어냈으니 불변식을 걸어 둔다.
{
  const eq = require('../js/rsd-equip.js');
  const s = sharedState();
  const r = app.recompute(s);
  const sz = r.sharedShed.sizing;
  const L = eq.shedLayout({
    bays: s.shed.bays, length: sz.length.value, width: sz.width.value,
    centerWall: s.shed.centerWallThickness, maintZone: s.shed.maintZone,
    wallThickness: s.shed.wallThickness,
    Lb: s.shed.Lb, La: s.shed.La, openSideClear: s.shed.openSideClear,
    cells: sz.cells
  });

  assert.strictEqual(L.piles.length, sz.cells.length, '셀마다 더미 하나');
  assert.strictEqual(L.outBelts.length, s.shed.bays, 'bay 마다 불출 B/C 하나');

  L.piles.forEach(function (p, i) {
    // 1) 옹벽면에서 시작해 개방측으로 뻗는다
    assert.ok(Math.abs(Math.abs(p.z) - s.shed.centerWallThickness / 2) < 1e-9,
      '더미 ' + i + ' 가 옹벽면에서 시작하지 않는다 (z=' + p.z + ')');
    // 2) 중앙 옹벽을 뚫지 않는다 — 시작점과 끝점이 같은 쪽에 있어야 한다
    assert.ok(p.z * p.zFar > 0, '더미 ' + i + ' 가 중앙 옹벽을 관통한다');
    assert.strictEqual(Math.sign(p.zFar), p.dir, '더미가 개방측 반대로 뻗는다');
    // 3) 건물 폭 안에 들어간다
    assert.ok(Math.abs(p.zFar) <= L.halfWidth + 1e-9,
      '더미 ' + i + ' 가 건물 밖으로 나간다 (' + p.zFar + ' > ' + L.halfWidth + ')');
    // 4) 건물 길이 안에 들어간다
    assert.ok(p.x >= -L.halfLength - 1e-9 && p.x + p.len <= L.halfLength + 1e-9,
      '더미 ' + i + ' 가 건물 길이를 넘는다');
  });

  // 5) 2 bay 면 중앙 옹벽 양쪽으로 갈린다
  if (s.shed.bays === 2) {
    const dirs = [...new Set(L.piles.map(function (p) { return p.dir; }))].sort();
    assert.deepStrictEqual(dirs, [-1, 1], '2 bay 는 옹벽 양쪽에 놓인다');
  }

  // 6) 불출 B/C 는 개방측 **바깥** — 더미와 겹치면 안 된다
  L.outBelts.forEach(function (ob) {
    const same = L.piles.filter(function (p) { return Math.sign(p.zFar) === Math.sign(ob.z); });
    same.forEach(function (p) {
      assert.ok(Math.abs(ob.z) > Math.abs(p.zFar) - 1e-9,
        '불출 B/C 가 원료 더미 안에 있다 (' + ob.z + ' vs 더미 끝 ' + p.zFar + ')');
    });
    assert.ok(Math.abs(ob.z) <= L.halfWidth + 1e-9, '불출 B/C 가 건물 밖으로 나간다');
  });

  // 7) 격벽은 셀 n 개에 n+1 개 (양 끝 포함)
  const perBay = {};
  L.piles.forEach(function (p) { perBay[p.bay] = (perBay[p.bay] || 0) + 1; });
  const expectParts = Object.keys(perBay).reduce(function (t, b) { return t + perBay[b] + 1; }, 0);
  assert.strictEqual(L.partitions.length, expectParts,
    '격벽은 bay 마다 셀 수 + 1 개 (양 끝이 막혀야 원료가 흘러나오지 않는다)');
}

// ===== 1 bay 도 좌표가 성립한다 =====
{
  const eq = require('../js/rsd-equip.js');
  const s = sharedState();
  s.shed.bays = 1;
  const r = app.recompute(s);
  const sz = r.sharedShed.sizing;
  const L = eq.shedLayout({
    bays: 1, length: sz.length.value, width: sz.width.value,
    centerWall: s.shed.centerWallThickness, maintZone: s.shed.maintZone,
    wallThickness: s.shed.wallThickness,
    Lb: s.shed.Lb, La: s.shed.La, openSideClear: s.shed.openSideClear,
    cells: sz.cells
  });
  assert.ok(L.piles.length > 0);
  assert.ok(L.piles.every(function (p) { return p.dir === 1; }), '1 bay 는 한쪽으로만');
  L.piles.forEach(function (p) {
    assert.ok(Math.abs(p.zFar) <= L.halfWidth + 1e-9, '1 bay 더미가 건물 밖으로 나간다');
  });
}

// ===== 셀이 실무에 없는 길이로 쪼그라들지 않는다 =====
// 셀 수를 고정하면 수요가 적은 원료(부원료 등)에서 셀이 5 m 까지 줄어든다.
// 격벽이 2 m 인데 셀이 5.5 m 면 격벽이 셀 길이의 40 % — SPR 이 들어갈 수도 없다.
{
  const MIN = 15;
  [200000, 500000, 1500000, 5000000, 15000000].forEach(function (usage) {
    const s = app.initialState();
    s.materials.flux.storageType = 'shed';
    s.materials.flux.annualUsage = usage;
    const r = app.recompute(s);
    const z = r.materials.flux.sizing;
    if (!z.cells.length) return;
    const len = z.cells[0].length.value;
    assert.ok(len >= MIN,
      usage / 10000 + '만t/년: 셀이 ' + len + ' m 로 쪼그라들었다 (최소 ' + MIN + ' m)');
    // 격벽이 셀 길이의 20 % 를 넘으면 형상이 성립하지 않는다
    assert.ok(s.shed.wallThickness <= len * 0.2,
      usage / 10000 + '만t/년: 격벽(' + s.shed.wallThickness + ' m)이 셀(' + len + ' m)에 비해 두껍다');
  });
}

// ===== 셀 수를 줄여도 필요 용량은 확보한다 =====
{
  const s = app.initialState();
  s.materials.flux.storageType = 'shed';
  const r = app.recompute(s);
  const e = r.materials.flux;
  assert.ok(e.sizing.totalCapacity.value >= e.demand.designCapacity.value - 1e-6,
    '셀을 줄였다고 용량이 모자라면 안 된다');
  // 셀 하나를 빼면 모자라야 한다 (과다 배분이 아님)
  const per = e.sizing.totalCapacity.value / e.sizing.cells.length;
  assert.ok(e.sizing.totalCapacity.value - per < e.demand.designCapacity.value,
    '셀이 하나 남는다 (과다 배분)');
}

// ===== 폭이 길이보다 크면 경고한다 =====
// 담을 양에 비해 bay 나 La 가 크다는 신호다 — 그 자체로 구성이 잘못됐다.
{
  const s = app.initialState();
  s.materials.flux.storageType = 'shed';
  s.shed.bays = 2;
  const z = app.recompute(s).materials.flux.sizing;
  assert.ok(z.width.value > z.length.value, '이 조건은 폭이 길이보다 크다');
  assert.ok(z.warnings.some(function (w) { return /폭/.test(w) && /길이/.test(w); }),
    '폭 > 길이면 경고해야 한다');

  // bay 를 1열로 줄이면 정상 비례가 된다
  const s1 = app.initialState();
  s1.materials.flux.storageType = 'shed';
  s1.shed.bays = 1;
  const z1 = app.recompute(s1).materials.flux.sizing;
  assert.ok(z1.length.value > z1.width.value, '1 bay 로 줄이면 길이가 폭보다 커야 한다');
  assert.strictEqual(z1.warnings.filter(function (w) { return /폭/.test(w); }).length, 0,
    '정상 비례면 경고가 없어야 한다');
}

console.log('OK: shed-shared');
