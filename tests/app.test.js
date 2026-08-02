const assert = require('assert');
const app = require('../js/rsd-app.js');

function near(actual, expected, tolPct, label) {
  const diff = Math.abs(actual - expected);
  const tol = Math.abs(expected) * tolPct / 100;
  assert.ok(diff <= tol,
    `${label}: 계산 ${actual} vs 기대 ${expected} — 오차 ${(diff / Math.abs(expected) * 100).toFixed(4)}% > 허용 ${tolPct}%`);
}

// ===== 상태 저장소 =====
{
  const store = app.createStore({ a: 1, nested: { b: 2 } });
  assert.strictEqual(store.get().a, 1);
  assert.strictEqual(store.get().nested.b, 2);

  store.set('a', 10);
  assert.strictEqual(store.get().a, 10);

  store.set('nested.b', 20);
  assert.strictEqual(store.get().nested.b, 20);
}

// ===== 구독 알림 =====
{
  const store = app.createStore({ x: 1 });
  let calls = 0, lastState = null;
  store.subscribe(s => { calls++; lastState = s; });
  store.set('x', 2);
  assert.strictEqual(calls, 1, '변경 시 구독자가 1회 호출되어야 한다');
  assert.strictEqual(lastState.x, 2, '구독자는 갱신된 상태를 받아야 한다');
  store.set('x', 3);
  assert.strictEqual(calls, 2);
}

// ===== reset =====
{
  const store = app.createStore({ x: 1 });
  store.set('x', 99);
  store.reset();
  assert.strictEqual(store.get().x, 1, 'reset은 초기값으로 되돌린다');
}

// ===== 초기 상태 =====
{
  const s = app.initialState();
  assert.strictEqual(s.operatingDays, 365);
  assert.strictEqual(s.materials.ironOre.annualUsage, 15000000);
  assert.strictEqual(s.materials.ironOre.stockDays, 15);
  assert.strictEqual(s.materials.ironOre.storageType, 'yard');
  assert.strictEqual(s.materials.coal.annualUsage, 5000000);
  assert.strictEqual(s.materials.coal.stockDays, 30);
  assert.strictEqual(s.materials.coal.storageType, 'silo');
  assert.strictEqual(s.materials.flux.annualUsage, 1500000);
  assert.strictEqual(s.materials.flux.storageType, 'yard');
  assert.ok(s.yard && s.shed && s.silo, '설비 파라미터가 들어 있어야 한다');
}

// ===== 오케스트레이션: 석탄 Silo 14기 =====
{
  const r = app.recompute(app.initialState());
  const coal = r.materials.coal;
  assert.strictEqual(coal.type, 'silo');
  near(coal.demand.daily.value, 13698.6, 0.1, '석탄 일일 사용량');
  near(coal.demand.targetCapacity.value, 410958.9, 0.1, '석탄 대상 저장용량');
  near(coal.demand.designCapacity.value, 684931.5, 0.1, '석탄 설계 대상용량');
  assert.strictEqual(coal.sizing.count.value, 14, '기본 시나리오에서 석탄 Silo 는 14기');
}

// ===== 오케스트레이션: 운영효율이 타입별로 올바르게 적용되는가 =====
{
  const s = app.initialState();
  const r = app.recompute(s);
  // 석탄은 Silo → 효율 0.60 / 철광석은 야드 → 효율 0.75
  near(r.materials.coal.demand.designCapacity.value,
    r.materials.coal.demand.targetCapacity.value / 0.60, 0.01, 'Silo 효율 0.60 적용');
  near(r.materials.ironOre.demand.designCapacity.value,
    r.materials.ironOre.demand.targetCapacity.value / 0.75, 0.01, '야드 효율 0.75 적용');
}

// ===== 오케스트레이션: 야드 원료는 열 수가 나오는가 =====
{
  const r = app.recompute(app.initialState());
  const ore = r.materials.ironOre;
  assert.strictEqual(ore.type, 'yard');
  assert.ok(ore.sizing.rows.value >= 1, '열 수가 1 이상이어야 한다');
  assert.ok(ore.sizing.footprintArea.value > 0, '점유면적이 계산되어야 한다');
  // 효율 이중적용이 있으면 열 수가 실제보다 크게 나온다 — 상한으로 감시
  const O = ore.sizing.maxCapacity.value;
  const expectedRows = Math.ceil(ore.demand.designCapacity.value / O);
  assert.strictEqual(ore.sizing.rows.value, expectedRows,
    '열 수 = ceil(설계 대상용량 ÷ 최대 적치량)');
}

// ===== 저장타입을 Shed로 바꾸면 셀이 자동 생성되는가 =====
{
  const s = app.initialState();
  s.materials.ironOre.storageType = 'shed';
  const r = app.recompute(s);
  const sh = r.materials.ironOre.sizing;
  assert.strictEqual(r.materials.ironOre.type, 'shed');
  assert.ok(sh.section, 'Shed 결과에는 단면 정보가 있어야 한다');

  // 셀은 설계 대상용량을 담을 만큼 자동 생성되어야 한다
  assert.ok(sh.cells.length > 0, '셀이 자동 생성되어야 한다');
  assert.ok(sh.totalCapacity.value >= r.materials.ironOre.demand.designCapacity.value,
    '자동 생성된 셀의 총 용량이 설계 대상용량 이상이어야 한다');
  assert.strictEqual(sh.warnings.length, 0,
    '자동 생성했으므로 bay/셀 불일치 경고가 없어야 한다');
  assert.ok(sh.length.value > 0 && sh.width.value > 0, '건물 치수가 계산되어야 한다');

  // bay 수만큼 균등 분배되었는가
  const bays = s.shed.bays;
  const perBay = {};
  for (const c of sh.cells) perBay[c.bay] = (perBay[c.bay] || 0) + 1;
  assert.strictEqual(Object.keys(perBay).length, bays, 'bay 수만큼 배분되어야 한다');
}

// ===== Shed bay 폭은 기준 도면과 같은 60 m/bay 여야 한다 =====
{
  const s = app.initialState();
  s.materials.ironOre.storageType = 'shed';
  const r = app.recompute(s);
  near(r.materials.ironOre.sizing.width.value, 120, 0.1, '2 bay 폭 = 120 m');
}

// ===== 연간 사용량 0이면 안전하게 처리 =====
{
  const s = app.initialState();
  s.materials.flux.annualUsage = 0;
  const r = app.recompute(s);
  assert.strictEqual(r.materials.flux.demand.targetCapacity.value, 0);
  assert.ok(r.materials.flux.sizing, '사용량 0이어도 결과 객체는 존재해야 한다');
}

// ===== 총 점유면적 집계 =====
{
  const r = app.recompute(app.initialState());
  assert.ok(r.totals.area > 0, '총 점유면적이 집계되어야 한다');
}

// ===== 검토 대상 원료 선택 =====
{
  const s = app.initialState();
  assert.strictEqual(s.materials.coal.enabled, true, '기본은 전부 검토 대상');
  assert.deepStrictEqual(app.enabledKeys(s).sort(), ['coal', 'flux', 'ironOre']);

  s.materials.flux.enabled = false;
  assert.deepStrictEqual(app.enabledKeys(s).sort(), ['coal', 'ironOre']);

  const r = app.recompute(s);
  assert.ok(!r.materials.flux, '제외한 원료는 결과에 없어야 한다');
  assert.ok(r.materials.coal && r.materials.ironOre);

  const rAll = app.recompute(app.initialState());
  assert.ok(r.totals.area < rAll.totals.area, '제외하면 총 면적이 줄어야 한다');
}

// ===== 전부 제외해도 안전 =====
{
  const s = app.initialState();
  Object.keys(s.materials).forEach(function (k) { s.materials[k].enabled = false; });
  const r = app.recompute(s);
  assert.deepStrictEqual(Object.keys(r.materials), []);
  assert.strictEqual(r.totals.area, 0);
}

// ===== Shed 셀 구성: grow 모드 = 셀 개수 고정, 길이를 늘린다 =====
{
  const s = app.initialState();
  s.materials.ironOre.storageType = 'shed';
  s.shed.sizingMode = 'grow';
  s.shed.cellsPerBayCount = 6;
  const r = app.recompute(s);
  const sh = r.materials.ironOre.sizing;
  assert.strictEqual(sh.cells.length, 6 * s.shed.bays, 'grow 모드는 셀 개수가 고정된다');
  assert.ok(sh.totalCapacity.value >= r.materials.ironOre.demand.designCapacity.value,
    '늘어난 셀 길이로 설계 대상용량을 담아야 한다');
  const lens = sh.cells.map(function (c) { return c.length.value; });
  assert.ok(lens.every(function (v) { return Math.abs(v - lens[0]) < 0.001; }), '균등 길이');
}

// ===== add 모드 = 셀 길이 고정, 개수를 늘린다 =====
{
  const s = app.initialState();
  s.materials.ironOre.storageType = 'shed';
  s.shed.sizingMode = 'add';
  s.shed.cellLength = 37;
  const r = app.recompute(s);
  const sh = r.materials.ironOre.sizing;
  const lens = sh.cells.map(function (c) { return c.length.value; });
  assert.ok(lens.every(function (v) { return Math.abs(v - 37) < 0.001; }), 'add 모드는 셀 길이가 고정');
  assert.ok(sh.totalCapacity.value >= r.materials.ironOre.demand.designCapacity.value);
}

// ===== 기본값은 bay 당 6셀  =====
{
  const D = require('../js/rsd-data.js').getDefaults();
  assert.strictEqual(D.shed.cellsPerBayCount, 6);
  assert.strictEqual(D.shed.sizingMode, 'grow');
}

console.log('OK: app');
