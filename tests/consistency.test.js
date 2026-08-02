const assert = require('assert');
const app = require('../js/rsd-app.js');
const B = require('../js/rsd-bands.js');
const cmp = require('../js/rsd-ui-compare.js');
const sens = require('../js/rsd-ui-sensitivity.js');

// 같은 것을 가리키는 숫자가 화면 어디서나 같아야 한다.
// 보고 자리에서 "아까는 21만이라더니?" 한마디면 신뢰를 잃는다.

const CASES = {
  '기본': function (s) {},
  '전부 야드': function (s) { s.materials.coal.storageType = 'yard'; },
  '전부 Shed': function (s) { Object.keys(s.materials).forEach(function (k) { s.materials[k].storageType = 'shed'; }); },
  '야드 1열만': function (s) {
    s.materials.ironOre.enabled = false; s.materials.coal.enabled = false;
    s.materials.flux.storageType = 'yard';
  },
  '야드 2원료': function (s) { s.materials.coal.storageType = 'yard'; s.materials.coal.annualUsage = 500000; },
  '초대형': function (s) { s.materials.ironOre.annualUsage = 45000000; },
  'Silo 3열': function (s) { s.silo.rows = 3; }
};

Object.keys(CASES).forEach(function (name) {
  const s = app.initialState();
  CASES[name](s);
  const r = app.recompute(s);
  const bands = B.buildBands(s, r);

  // ===== 1. 이동기기 띠 개수 — ① 탭 산정 ↔ ⑥ 배치 =====
  // 예전에는 ① 이 원료별로 (열수−1) 을 세는 바람에 여러 원료가 야드를 쓰면
  // 실제 배치보다 띠를 적게 세어 부지가 작게 나왔다.
  const drawn = bands.filter(function (b) { return b.kind === 'sr'; }).length;
  assert.strictEqual(r.totals.srBands, drawn,
    name + ': ① 탭이 센 이동기기 띠 ' + r.totals.srBands + '개 ≠ 배치도 ' + drawn + '개');

  // ===== 2. ① 총 점유면적 = 설비띠 실면적의 합 =====
  // 두 값이 어긋나면 어느 쪽이 맞는지 아무도 모른다.
  const facility = bands.filter(function (b) { return b.kind !== 'road'; })
    .reduce(function (t, b) { return t + b.width * b.length; }, 0);
  assert.ok(Math.abs(r.totals.area - facility) < 1e-6,
    name + ': ① 총면적 ' + Math.round(r.totals.area) +
    ' ≠ 설비띠 실면적 ' + Math.round(facility));

  // ===== 3. 총면적 = 설비 + 이동기기 =====
  assert.ok(Math.abs(r.totals.area - (r.totals.facilityArea + r.totals.srArea)) < 1e-6,
    name + ': 총면적 분해가 맞지 않는다');

  // ===== 4. 부지면적 ≥ 총 점유면적 =====
  // 부지는 도로·여유를 포함하므로 설비면적보다 작을 수 없다.
  const site = B.totalWidth(bands) * B.totalLength(bands);
  assert.ok(site >= r.totals.area - 1e-6,
    name + ': 부지면적 ' + Math.round(site) + ' 가 점유면적 ' + Math.round(r.totals.area) + ' 보다 작다');

  // ===== 5. ⑧ 민감도 기준점 = ① 탭 값 =====
  Object.keys(r.materials).forEach(function (k) {
    const sw = sens.sweep(s, k, 'stockDays');
    const base = sw.points.filter(function (p) { return p.isBase; })[0];
    assert.ok(base, name + '/' + k + ': 민감도에 기준점이 있어야 한다');
    assert.ok(Math.abs(base.area - r.materials[k].area) < 1e-6,
      name + '/' + k + ': 민감도 기준 면적 ' + Math.round(base.area) +
      ' ≠ ① 탭 ' + Math.round(r.materials[k].area));
    assert.ok(Math.abs(base.totalArea - r.totals.area) < 1e-6,
      name + '/' + k + ': 민감도 총면적이 ① 탭과 다르다');
  });

  // ===== 6. ⑤ 타입비교의 '현재 타입' 면적 = 해당 탭 면적 =====
  // 야드는 이동기기 띠 규칙이 얽혀 있어 특히 어긋나기 쉽다.
  Object.keys(r.materials).forEach(function (k) {
    const e = r.materials[k];
    const c = cmp.compareTypes(s, k)[e.type];
    if (e.type === 'yard') {
      // 비교탭은 '이 원료만 야드로 놓았을 때' 를 보므로 띠가 포함된다.
      // 설비면적 부분은 같아야 한다.
      const bandsOnly = B.srBandCount(e.sizing.rows.value) * s.yard.srBandWidth * s.yard.yardLength;
      assert.ok(Math.abs((c.area - bandsOnly) - e.area) < 1e-6,
        name + '/' + k + ': 비교탭 야드 설비면적이 ② 탭과 다르다');
    } else {
      assert.ok(Math.abs(c.area - e.area) < 1e-6,
        name + '/' + k + ': 비교탭 면적 ' + Math.round(c.area) +
        ' ≠ 해당 탭 ' + Math.round(e.area));
    }
  });

  // ===== 7. 도면에 그린 파일 수 = 계산에 쓴 파일 수 =====
  bands.filter(function (b) { return b.kind === 'yard'; }).forEach(function (b) {
    assert.strictEqual(b.pileCount, b.sizing.pileCount.value,
      name + ': 배치도의 파일 수가 계산값과 다르다');
  });

  // ===== 8. Silo 기수 = 열별 분배의 합 =====
  Object.keys(r.materials).forEach(function (k) {
    const e = r.materials[k];
    if (e.type !== 'silo') return;
    const sum = e.sizing.split.reduce(function (t, v) { return t + v; }, 0);
    assert.strictEqual(sum, e.sizing.count.value,
      name + ': Silo 열별 분배 합 ' + sum + ' ≠ 총 기수 ' + e.sizing.count.value);
  });

  // ===== 9. Shed 셀 수 = bay별 셀의 합 =====
  Object.keys(r.materials).forEach(function (k) {
    const e = r.materials[k];
    if (e.type !== 'shed') return;
    const byBay = {};
    e.sizing.cells.forEach(function (cell) { byBay[cell.bay] = (byBay[cell.bay] || 0) + 1; });
    const sum = Object.keys(byBay).reduce(function (t, b) { return t + byBay[b]; }, 0);
    assert.strictEqual(sum, e.sizing.cells.length, name + ': Shed 셀 수 불일치');
  });
});

// ===== 10. 2D 마스터플랜과 3D 부지가 같은 자리에 띠를 놓는가 =====
// 두 곳에 좌표 계산을 따로 적어 두면 한쪽만 고쳤을 때 조용히 어긋난다.
{
  const dm = require('../js/rsd-draw2d-master.js');
  Object.keys(CASES).forEach(function (name) {
    const s = app.initialState();
    CASES[name](s);
    const bands = B.buildBands(s, app.recompute(s));
    const layout = B.bandLayout(bands);
    const offs = dm.bandOffsets(bands);          // 2D 가 실제로 쓰는 값

    assert.strictEqual(layout.length, bands.length, name + ': 띠마다 좌표가 있어야 한다');
    layout.forEach(function (l, i) {
      assert.ok(Math.abs(l.y0 - offs[i]) < 1e-9,
        name + ': 띠 ' + i + ' 의 2D 위치가 다르다 (' + l.y0 + ' vs ' + offs[i] + ')');
      // 3D 는 부지 중심이 원점 — 2D 중심에서 총폭 절반만큼 옮긴 값
      assert.ok(Math.abs(l.zc - (l.yc - B.totalWidth(bands) / 2)) < 1e-9,
        name + ': 띠 ' + i + ' 의 3D Z 가 2D 와 어긋난다');
      // 길이방향은 항상 중앙 정렬
      assert.ok(Math.abs(l.x0 + l.length / 2) < 1e-9, name + ': 띠가 길이방향 중앙에 없다');
    });
    // 띠가 빈틈·겹침 없이 이어지는가
    for (let i = 1; i < layout.length; i++) {
      assert.ok(Math.abs(layout[i].y0 - (layout[i - 1].y0 + layout[i - 1].width)) < 1e-9,
        name + ': 띠 ' + i + ' 와 앞 띠 사이에 빈틈/겹침');
    }
    // 마지막 띠 끝 = 총 폭
    const last = layout[layout.length - 1];
    assert.ok(Math.abs(last.y0 + last.width - B.totalWidth(bands)) < 1e-9,
      name + ': 띠 합이 총 폭과 다르다');
  });
}

// ===== 이동기기 띠 규칙 자체 =====
// 야드 1열이어도 띠가 하나 붙어야 적치·불출이 가능하다.
{
  assert.strictEqual(B.srBandCount(0), 0, '야드가 없으면 띠도 없다');
  assert.strictEqual(B.srBandCount(1), 1, '1열이어도 띠 하나는 반드시 필요하다');
  assert.strictEqual(B.srBandCount(2), 1, '2열이면 사이에 하나');
  assert.strictEqual(B.srBandCount(5), 4, 'n열이면 n−1개');
}

console.log('OK: consistency');
