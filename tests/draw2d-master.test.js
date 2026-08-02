const assert = require('assert');
const dm = require('../js/rsd-draw2d-master.js');

function res(v) { return { value: v }; }
const YSZ = { stackLength: res(680), stackWidth: res(46) };
const SSZ = { count: res(14), perRow: res(14) };

const BANDS = [
  { label: '외곽도로 / 배수로', width: 10, length: 720, kind: 'road' },
  { label: 'Iron Ore Yard ①', width: 50, length: 720, kind: 'yard', color: '#8C4A38',
    materialKey: 'ironOre', sizing: YSZ, pileCount: 10, pileGap: 5, maintLength: 40 },
  { label: 'S/R 2기 + B/C', width: 10, length: 720, kind: 'sr' },
  { label: 'Iron Ore Yard ②', width: 50, length: 720, kind: 'yard', color: '#8C4A38',
    materialKey: 'ironOre', sizing: YSZ, pileCount: 10, pileGap: 5, maintLength: 40 },
  { label: '석탄 Silo 14기', width: 61, length: 724, kind: 'silo', color: '#2B2B33',
    materialKey: 'coal', sizing: SSZ, pitch: 51, innerDia: 41, footprintWidth: 61 },
  { label: '외곽 점검도로', width: 5, length: 720, kind: 'road' }
];

// ===== 순서 교체 (순수 함수) =====
{
  const a = dm.reorderBands(BANDS, 1, 3);
  assert.strictEqual(a.length, BANDS.length, '개수는 그대로');
  assert.strictEqual(a[3].label, 'Iron Ore Yard ①', '1번이 3번 자리로');
  assert.strictEqual(BANDS[1].label, 'Iron Ore Yard ①', '원본은 불변');

  // 위로 올리기
  const b = dm.reorderBands(BANDS, 4, 0);
  assert.strictEqual(b[0].label, '석탄 Silo 14기');

  // 범위 밖은 원본 그대로
  assert.deepStrictEqual(dm.reorderBands(BANDS, -1, 2), BANDS);
  assert.deepStrictEqual(dm.reorderBands(BANDS, 2, 99), BANDS);
  assert.deepStrictEqual(dm.reorderBands(BANDS, 2, 2), BANDS);
}

// ===== 재배열해도 총 폭은 그대로 =====
{
  const sum = function (a) { return a.reduce(function (s, b) { return s + b.width; }, 0); };
  assert.strictEqual(sum(dm.reorderBands(BANDS, 0, 5)), sum(BANDS), '순서만 바뀌지 총폭은 불변');
}

// ===== 누적 y 좌표 =====
{
  const ys = dm.bandOffsets(BANDS);
  assert.deepStrictEqual(ys, [0, 10, 60, 70, 120, 181]);
}

// ===== 드래그 목표 위치 산정 =====
{
  // 띠 오프셋 [0,10,60,70,120,181], 총폭 186
  assert.strictEqual(dm.dropIndex(BANDS, 5), 0, '맨 위로 끌면 0번');
  assert.strictEqual(dm.dropIndex(BANDS, 185), BANDS.length - 1, '맨 아래로 끌면 마지막');
  assert.strictEqual(dm.dropIndex(BANDS, 65), 2, '60~70 구간은 2번 자리');
}

// ===== 평면도 =====
{
  const svg = dm.drawMasterPlan({ bands: BANDS, totalWidth: 186, totalLength: 724 });
  assert.ok(/^<svg/.test(svg.trim()));
  assert.strictEqual((svg.match(/data-band="/g) || []).length, BANDS.length, '띠마다 드래그 대상');
  assert.ok(/Iron Ore Yard ①/.test(svg), '띠 라벨');
  assert.strictEqual((svg.match(/class="band-tag/g) || []).length, BANDS.length,
    '라벨은 전부 도면 바깥에 놓인다');
  assert.ok(/724/.test(svg), '총 길이 치수');
  assert.ok(/186/.test(svg), '총 폭 치수');
  // 원료 띠는 원료별 그라데이션으로 구분된다
  assert.ok(/id="mg-[^"]*-ironOre"/.test(svg), '철광석 그라데이션');
  assert.ok(/id="mg-[^"]*-coal"/.test(svg), '석탄 그라데이션');

  // 띠 내용이 실제로 그려진다 — 단색 사각형이 아니다
  assert.strictEqual((svg.match(/class="mp-pile"/g) || []).length, 20,
    '야드 2열 × 파일 10개');
  assert.strictEqual((svg.match(/class="mp-silo"/g) || []).length, 14, 'Silo 14기');
  assert.strictEqual((svg.match(/class="mp-sr"/g) || []).length, 2, 'S/R 기계 2기');
  assert.ok(/class="mp-bc"/.test(svg), 'B/C 중심선');
  assert.ok(/class="mp-rail"/.test(svg), '레일');

  // 라벨은 전부 바깥으로 빼고 지시선으로 연결한다 (안에 넣으면 파일 위에 겹친다)
  assert.strictEqual((svg.match(/class="leader"/g) || []).length, BANDS.length, '띠마다 지시선');
  assert.ok(/class="north"/.test(svg), '방위 표시');
}

// ===== 빈 입력 방어 =====
{
  const svg = dm.drawMasterPlan({ bands: [], totalWidth: 0, totalLength: 0 });
  assert.ok(/^<svg/.test(svg.trim()), '띠가 없어도 SVG 는 생성된다');
}

console.log('OK: draw2d-master');
