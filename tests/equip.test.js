const assert = require('assert');
const eq = require('../js/rsd-equip.js');
const data = require('../js/rsd-data.js');

// ===== 야드: 겸용기 2기 =====
{
  const list = eq.yardEquipment({ mode: 'combined', perBand: 2 });
  assert.strictEqual(list.length, 2);
  assert.deepStrictEqual(list.map(x => x.type), ['sr', 'sr']);
  // 각자 담당 구역 중앙에 선다 (야드를 반씩 나눠 맡는다)
  assert.deepStrictEqual(list.map(x => x.xRatio), [0.25, 0.75]);
  assert.deepStrictEqual(list.map(x => [x.zoneFrom, x.zoneTo]), [[0, 0.5], [0.5, 1]]);
}

// ===== 야드: 분리형 = Stacker 1 + Reclaimer 1 =====
{
  const list = eq.yardEquipment({ mode: 'separate', perBand: 2 });
  assert.deepStrictEqual(list.map(x => x.type), ['stacker', 'reclaimer']);
}

// ===== 야드: 1기만 =====
{
  const list = eq.yardEquipment({ mode: 'combined', perBand: 1 });
  assert.strictEqual(list.length, 1);
  assert.deepStrictEqual(list.map(x => x.xRatio), [0.5], '1기는 중앙');
  assert.deepStrictEqual(list.map(x => [x.zoneFrom, x.zoneTo]), [[0, 1]], '1기는 야드 전체 담당');
}

// ===== 야드: 상한 초과는 잘라낸다 (B/C 1열당 최대 2기) =====
{
  const list = eq.yardEquipment({ mode: 'combined', perBand: 5 });
  assert.strictEqual(list.length, eq.SR_MAX, 'B/C 1열당 최대 2기');
}

// ===== 야드: 0기 =====
{
  assert.deepStrictEqual(eq.yardEquipment({ mode: 'combined', perBand: 0 }), []);
}

// ===== Silo =====
{
  const s = eq.siloEquipment({ trippers: 2, count: 14 });
  assert.strictEqual(s.trippers, 2);
  assert.strictEqual(s.rdmPerSilo, 1, 'Silo 1기당 RDM 1기');
  assert.strictEqual(s.rdmTotal, 14);
}

// ===== Shed: SPR 면당 2기 =====
{
  const s = eq.shedEquipment({ bays: 2, sprPerBay: 2, trippers: 2 });
  assert.strictEqual(s.trippers, 2);
  assert.strictEqual(s.sprPerBay, 2);
  assert.strictEqual(s.sprTotal, 4, '2 bay × 면당 2기 = 4기 ');
}

{
  const s = eq.shedEquipment({ bays: 1, sprPerBay: 2, trippers: 1 });
  assert.strictEqual(s.sprTotal, 2);
}

// ===== 기본 파라미터 =====
{
  const D = data.getDefaults();
  assert.strictEqual(D.yard.srMode, 'combined');
  assert.strictEqual(D.yard.srPerBand, 2);
  assert.strictEqual(D.silo.trippers, 2);
  assert.strictEqual(D.shed.trippers, 2);
  assert.strictEqual(D.shed.sprPerBay, 2);
}

// ===== 이동기기끼리 주행 구간이 겹치지 않는다 (충돌 방지) =====
{
  const list = eq.yardEquipment({ mode: 'combined', perBand: 2 });
  const spans = list.map(function (m) {
    return [m.xRatio - m.travelRatio / 2, m.xRatio + m.travelRatio / 2];
  });
  for (let i = 0; i < spans.length - 1; i++) {
    assert.ok(spans[i][1] < spans[i + 1][0],
      '기계 ' + i + ' 의 주행 끝(' + spans[i][1].toFixed(3) + ')이 ' +
      '기계 ' + (i + 1) + ' 의 시작(' + spans[i + 1][0].toFixed(3) + ')보다 앞서야 한다');
  }
  // 야드 밖으로 나가지 않는다
  assert.ok(spans[0][0] >= 0 && spans[spans.length - 1][1] <= 1, '주행 구간은 야드 안에 머문다');
}

// ===== Silo 2열 이상이면 열마다 공급 B/C + Tripper 가 필요하다 =====
// 상부 벨트는 Silo 중심 위를 지나야 장입이 된다. 열마다 한 줄이 없으면
// 그 열은 원료를 받을 수 없다.
{
  const s2 = eq.siloEquipment({ trippers: 2, count: 14, rows: 2 });
  assert.strictEqual(s2.feedLines, 2, '2열이면 공급 라인 2줄');
  assert.strictEqual(s2.trippers, 2);
  assert.strictEqual(s2.trippersPerRow, 1, '열마다 1기');
  assert.strictEqual(s2.warnings.length, 0);

  // Tripper 가 열 수보다 적으면 보정하고 경고한다
  const s3 = eq.siloEquipment({ trippers: 2, count: 14, rows: 3 });
  assert.strictEqual(s3.trippers, 3, '3열이면 최소 3기로 올린다');
  assert.strictEqual(s3.askedTrippers, 2, '사용자 입력값은 보존');
  assert.strictEqual(s3.feedLines, 3);
  assert.ok(s3.warnings.length > 0, '보정했음을 알려야 한다');
  assert.ok(/장입/.test(s3.warnings[0]), '왜 문제인지 설명해야 한다');

  // 1열이면 그대로
  const s1 = eq.siloEquipment({ trippers: 2, count: 14, rows: 1 });
  assert.strictEqual(s1.trippers, 2);
  assert.strictEqual(s1.warnings.length, 0);
}

console.log('OK: equip');

// ===== Silo 3D 배치 좌표 =====
// 좌표식을 그리는 코드 안에 흩어 두면 확인할 방법이 없다.
// 실제로 '불출 B/C 가 Silo 밑을 가로지르는' 결함이 거기서 났다.
{
  const P = { pitch: 51, innerDia: 41, footprintWidth: 61 };

  // --- 1열 14기 ---
  const L1 = eq.siloLayout(Object.assign({ count: 14, perRow: 14, length: 724 }, P));
  assert.strictEqual(L1.rows, 1);
  assert.strictEqual(L1.silos.length, 14, '14기가 모두 놓여야 한다');
  assert.deepStrictEqual(L1.rowZ, [0], '1열이면 띠 중심에');
  // 첫 Silo 중심 = 왼쪽 끝 + 점유폭 절반, 마지막 = 오른쪽 끝 − 점유폭 절반
  assert.strictEqual(L1.silos[0].x, -724 / 2 + 61 / 2);
  assert.strictEqual(L1.silos[13].x, -724 / 2 + 61 / 2 + 13 * 51);
  assert.ok(Math.abs(L1.silos[13].x - (724 / 2 - 61 / 2)) < 1e-9,
    '마지막 Silo 가 배치 길이 안에 정확히 맞아야 한다');

  // --- 3열 14기 (5·5·4) ---
  const L3 = eq.siloLayout(Object.assign({ count: 14, perRow: 5, length: 265 }, P));
  assert.strictEqual(L3.rows, 3);
  assert.deepStrictEqual([0, 1, 2].map(function (r) {
    return L3.silos.filter(function (s) { return s.row === r; }).length;
  }), [5, 5, 4], '앞 열부터 채운다');
  assert.deepStrictEqual(L3.rowZ, [-51, 0, 51], '열은 중심에 대칭');

  // --- 열마다 공급 라인과 불출 벨트가 하나씩 ---
  [L1, L3].forEach(function (L) {
    assert.strictEqual(L.feedZ.length, L.rows, '열마다 공급 갤러리 하나');
    assert.strictEqual(L.outZ.length, L.rows, '열마다 불출 벨트 하나');
    L.rowZ.forEach(function (z, i) {
      // 공급은 Silo 중심 **바로 위** — 어긋나면 장입이 안 된다
      assert.strictEqual(L.feedZ[i], z, '공급 라인이 Silo 중심을 벗어났다');
      // 불출 벨트는 몸통 **바깥** — 밑을 가로지르면 안 된다
      assert.ok(L.outZ[i] > z + P.innerDia / 2,
        '불출 벨트가 Silo 몸통 안에 있다 (z=' + L.outZ[i] + ', 몸통 끝=' + (z + P.innerDia / 2) + ')');
    });
    // 불출 벨트가 옆 열 Silo 를 침범하지 않는가
    for (let i = 0; i < L.rows - 1; i++) {
      assert.ok(L.outZ[i] < L.rowZ[i + 1] - P.innerDia / 2,
        (i + 1) + '번 열 불출 벨트가 다음 열 Silo 와 겹친다');
    }
    // RDM 은 몸통 안쪽
    L.silos.forEach(function (s) {
      assert.ok(Math.abs(s.rdmZ - s.z) < P.innerDia / 2,
        'RDM 배출부가 Silo 몸통 밖으로 나갔다');
    });
  });

  // --- 0기 방어 ---
  const L0 = eq.siloLayout(Object.assign({ count: 0, perRow: 1, length: 0 }, P));
  assert.strictEqual(L0.silos.length, 0, '0기면 아무것도 놓지 않는다');
}
