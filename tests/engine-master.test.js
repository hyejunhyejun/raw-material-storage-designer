const assert = require('assert');
const master = require('../js/rsd-engine-master.js');
const data = require('../js/rsd-data.js');

// ===== 회귀: 예시 배치 =====
{
  const p = data.PRESETS.exampleMaster;
  const r = master.computeMaster(p.input);

  const E = data.PRESETS.exampleMaster.expected;
  assert.strictEqual(r.totalWidth.value, E.totalWidth, '총 폭 = Σ 띠 폭');
  assert.strictEqual(r.totalLength.value, E.totalLength, '총 길이 = max(띠 길이)');
  assert.strictEqual(r.totalArea.value, E.totalWidth * E.totalLength, '총 면적');

  // 도면 표기값 — 툴 산출값과의 차이는 도면의 길이 표기 반올림에서 온다
  assert.strictEqual(p.expected.drawingLength, 800);
  assert.strictEqual(p.expected.drawingArea, 188000);
}

// ===== 띠 누적 y좌표 (묘화용) =====
{
  const r = master.computeMaster({
    bands: [
      { label: 'A', width: 10, length: 100 },
      { label: 'B', width: 50, length: 100 },
      { label: 'C', width: 5,  length: 100 }
    ]
  });
  assert.strictEqual(r.bands[0].offsetY, 0);
  assert.strictEqual(r.bands[1].offsetY, 10);
  assert.strictEqual(r.bands[2].offsetY, 60);
  assert.strictEqual(r.totalWidth.value, 65);
}

// ===== 총 길이는 최장 띠 =====
{
  const r = master.computeMaster({
    bands: [
      { label: 'A', width: 10, length: 300 },
      { label: 'B', width: 10, length: 724 },
      { label: 'C', width: 10, length: 500 }
    ]
  });
  assert.strictEqual(r.totalLength.value, 724);
}

// ===== buildYardBands: 1열 → 야드 1 + S/R 1 =====
{
  const b = master.buildYardBands({
    label: 'Coal Yard', rows: 1, yardWidth: 50, yardLength: 720,
    srBandWidth: 10, srPerBand: 2
  });
  assert.strictEqual(b.length, 2, '1열이면 야드 1 + S/R 띠 1');
  assert.strictEqual(b[0].kind, 'yard');
  assert.strictEqual(b[0].width, 50);
  assert.strictEqual(b[1].kind, 'sr');
  assert.strictEqual(b[1].width, 10);
}

// ===== buildYardBands: 2열 → 야드/SR/야드 (사이 공유) =====
{
  const b = master.buildYardBands({
    label: 'Iron Ore Yard', rows: 2, yardWidth: 50, yardLength: 720,
    srBandWidth: 10, srPerBand: 2
  });
  assert.strictEqual(b.length, 3, '2열이면 야드 · S/R · 야드');
  assert.deepStrictEqual(b.map(x => x.kind), ['yard', 'sr', 'yard']);
  assert.strictEqual(b.reduce((s, x) => s + x.width, 0), 110, '50 + 10 + 50');
  assert.ok(/①/.test(b[0].label), '야드 번호가 라벨에 붙어야 한다');
  assert.ok(/②/.test(b[2].label));
}

// ===== buildYardBands: 3열 → 야드/SR/야드/SR/야드 =====
{
  const b = master.buildYardBands({
    label: 'Coal Yard', rows: 3, yardWidth: 50, yardLength: 720,
    srBandWidth: 10, srPerBand: 2
  });
  assert.strictEqual(b.length, 5);
  assert.deepStrictEqual(b.map(x => x.kind), ['yard', 'sr', 'yard', 'sr', 'yard']);
  assert.strictEqual(b.reduce((s, x) => s + x.width, 0), 170, '50×3 + 10×2');
}

// ===== S/R 기수가 라벨에 반영되는가 =====
{
  const b = master.buildYardBands({
    label: 'Coal Yard', rows: 2, yardWidth: 50, yardLength: 720,
    srBandWidth: 10, srPerBand: 2
  });
  assert.ok(/2기/.test(b[1].label), 'S/R 띠 라벨에 기수가 표시되어야 한다');
}

// ===== 경고: B/C 1열당 S/R 최대 2기 초과 =====
{
  const b = master.buildYardBands({
    label: 'Coal Yard', rows: 2, yardWidth: 50, yardLength: 720,
    srBandWidth: 10, srPerBand: 3
  });
  const r = master.computeMaster({ bands: b });
  assert.ok(r.warnings.length > 0, 'S/R 3기는 경고 대상');
  assert.ok(/2기/.test(r.warnings[0]), '경고에 제한값이 담겨야 한다');
}

// ===== 빈 입력 방어 =====
{
  const r = master.computeMaster({ bands: [] });
  assert.strictEqual(r.totalWidth.value, 0);
  assert.strictEqual(r.totalLength.value, 0);
  assert.strictEqual(r.totalArea.value, 0);
}

console.log('OK: engine-master');
