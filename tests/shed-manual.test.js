const assert = require('assert');
const app = require('../js/rsd-app.js');
const ui = require('../js/rsd-ui-facility.js');

// ===== 배열 크기 맞추기 =====
{
  // 빈 상태에서 2 bay × 3 셀 -> 기본 길이로 채운다
  assert.deepStrictEqual(app.resizeCells(null, 2, 3, 37),
    [[37, 37, 37], [37, 37, 37]]);

  // 손으로 넣은 값은 살리고 모자란 칸만 채운다
  assert.deepStrictEqual(app.resizeCells([[17.5, 40]], 2, 3, 37),
    [[17.5, 40, 37], [37, 37, 37]]);

  // 줄일 때는 뒤에서 잘라낸다
  assert.deepStrictEqual(app.resizeCells([[17.5, 40, 45, 50]], 1, 2, 37),
    [[17.5, 40]]);

  // 이상한 값(0·음수·문자)은 기본 길이로 되돌린다
  assert.deepStrictEqual(app.resizeCells([[0, -5, 'x']], 1, 3, 37),
    [[37, 37, 37]]);
}

// ===== manual 모드에서만 사용자 배열을 쓴다 =====
{
  const s = app.initialState();
  s.materials.flux.storageType = 'shed';
  s.shed.sizingMode = 'manual';
  s.shed.bays = 2;
  s.shed.cellsPerBay = [[17.5, 37, 37], [17.5, 35, 35]];
  const r = app.recompute(s);
  const cells = r.materials.flux.sizing.cells;
  assert.strictEqual(cells.length, 6, '입력한 셀 6개가 그대로 쓰인다');
  assert.strictEqual(cells[0].length.value, 17.5, '첫 셀은 짧게 간 그대로');
  assert.strictEqual(cells[3].length.value, 17.5, 'bay 2 첫 셀도 그대로');

  // grow 모드로 돌리면 배열이 남아 있어도 자동 산정이 이긴다
  const s2 = app.initialState();
  s2.materials.flux.storageType = 'shed';
  s2.shed.sizingMode = 'grow';
  s2.shed.cellsPerBay = [[17.5, 37, 37], [17.5, 35, 35]];
  const r2 = app.recompute(s2);
  const lens = r2.materials.flux.sizing.cells.map(function (x) { return x.length.value; });
  assert.ok(lens.every(function (v) { return v === lens[0]; }),
    'grow 모드는 균등 길이로 자동 산정한다');
}

// ===== bay 수와 배열 길이가 어긋나면 자동 산정으로 돌아간다 =====
// (어긋난 배열을 그대로 쓰면 한쪽 bay 가 비어 도면과 계산이 어긋난다)
{
  const s = app.initialState();
  s.materials.flux.storageType = 'shed';
  s.shed.sizingMode = 'manual';
  s.shed.bays = 2;
  s.shed.cellsPerBay = [[17.5, 37]];      // bay 는 2인데 행은 1개
  const r = app.recompute(s);
  assert.ok(r.materials.flux.sizing.cells.length > 2, '자동 산정으로 되돌아간다');
}

// ===== 화면: manual 일 때만 셀별 입력칸이 나온다 =====
{
  const s = app.initialState();
  s.materials.flux.storageType = 'shed';
  s.shed.sizingMode = 'manual';
  s.shed.bays = 2;
  s.shed.cellsPerBay = [[17.5, 37, 37], [17.5, 35, 35]];
  const r = app.recompute(s);
  const h = ui.renderShedInputs(s, r);
  assert.ok(h.indexOf('data-path="shed.cellsPerBay.0.0"') >= 0, 'bay1 셀1 입력칸');
  assert.ok(h.indexOf('data-path="shed.cellsPerBay.1.2"') >= 0, 'bay2 셀3 입력칸');
  assert.ok(/설계 대상용량/.test(h), '목표 대비 충족 여부를 보여준다');

  const s3 = app.initialState();
  s3.materials.flux.storageType = 'shed';
  const h3 = ui.renderShedInputs(s3, app.recompute(s3));
  // 'shed.cellsPerBayCount' 가 부분문자열로 잡히므로 셀 인덱스까지 붙여 확인한다
  assert.ok(!/shed\.cellsPerBay\.\d/.test(h3), 'grow 모드에는 셀별 입력칸이 없다');
}

console.log('OK: shed-manual');
