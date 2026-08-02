const assert = require('assert');
const yardE = require('../js/rsd-engine-yard.js');
const shedE = require('../js/rsd-engine-shed.js');
const siloE = require('../js/rsd-engine-silo.js');
const core = require('../js/rsd-core.js');
const data = require('../js/rsd-data.js');

// 엔진이 쓰는 식을 그대로 다시 쓰면 오타만 확인될 뿐 논리 오류는 못 잡는다.
// **다른 경로로 같은 답이 나오는지** 를 본다.

function rel(a, b) { return Math.abs(a - b) / Math.max(1e-9, Math.abs(b)); }

// ===== 야드 체적: 닫힌 식 vs 길이방향 수치적분 =====
// 파일 1개 = 삼각기둥 + 양끝 반원뿔(합치면 원뿔 1개).
// 이걸 길이 x 를 따라 단면적 S(x) 를 적분해서 독립적으로 구한다.
//   0 ≤ x ≤ r        : 반지름이 x 에서 r 로 커지는 원뿔 구간 → 상사 삼각형 단면
//   r ≤ x ≤ len−r    : 온전한 삼각형 단면 (밑변 2r, 높이 G)
//   len−r ≤ x ≤ len  : 반대쪽 원뿔 구간
// 원뿔 구간의 단면은 원뿔을 세로로 자른 것이므로 반원(반지름 ρ)이 아니라
// 원뿔 축에서 잰 원형 단면이다 — 즉 파일 끝단은 '반원뿔'이고, 두 끝을 합치면
// 온전한 원뿔 1개다. 그래서 수치적분은 원뿔 체적 공식으로 검증한다.
function pileVolumeNumeric(len, F, G, steps) {
  const r = F / 2;
  const n = steps || 200000;
  const dx = len / n;
  let v = 0;
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * dx;
    let S;
    if (x < r) {
      // 끝단 반원뿔: 축방향 x 에서의 반지름 ρ = x, 높이는 G·(ρ/r)
      // 단면(원의 일부가 아니라 원뿔을 x 에서 자른 원) 넓이는 π ρ² 가 아니라
      // 원뿔 축이 수평이 아니라 수직이므로 — 아래 별도 검증에서 다룬다.
      S = null;
    } else if (x > len - r) {
      S = null;
    } else {
      S = F * G / 2;                        // 삼각형 단면
    }
    if (S !== null) v += S * dx;
  }
  return v;                                 // 직선구간 체적만
}

{
  // 예시 야드 A 형상
  const F = 41, G = 14.3529, L = 351;       // 적치폭 / 적치높이 / 삼각파일길이
  const prismNumeric = pileVolumeNumeric(L + F, F, G);   // 양끝 원뿔 제외분
  const prismClosed = 0.5 * F * G * L;
  assert.ok(rel(prismNumeric, prismClosed) < 1e-4,
    '직선구간 체적: 수치적분 ' + prismNumeric.toFixed(1) + ' vs 닫힌식 ' + prismClosed.toFixed(1));
}

{
  // 원뿔 체적을 회전체 적분으로 독립 검증
  //   V = ∫₀^G π·ρ(y)² dy,  ρ(y) = r·(1 − y/G)
  const r = 20.5, G = 14.3529;
  const n = 200000, dy = G / n;
  let v = 0;
  for (let i = 0; i < n; i++) {
    const y = (i + 0.5) * dy;
    const rho = r * (1 - y / G);
    v += Math.PI * rho * rho * dy;
  }
  const closed = Math.PI * r * r * G / 3;
  assert.ok(rel(v, closed) < 1e-6, '원뿔 체적 적분 ' + v.toFixed(2) + ' vs 닫힌식 ' + closed.toFixed(2));

  // 엔진이 실제로 이 값을 쓰는가
  const z = yardE.computeYard(Object.assign({}, data.PRESETS.exampleYardA.input));
  const engineCone = z.coneVolume.value;
  const expectCone = 9 * closed;                        // 파일 9개
  assert.ok(rel(engineCone, expectCone) < 1e-3,
    '엔진 원뿔체적 ' + engineCone.toFixed(0) + ' vs 독립 ' + expectCone.toFixed(0));
}

// ===== 야드 전체 체적: 엔진 vs 완전 독립 재구성 =====
{
  const IN = data.PRESETS.exampleYardA.input;
  const z = yardE.computeYard(Object.assign({}, IN));
  const C = IN.yardLength - IN.maintLength;
  const F = IN.yardWidth - IN.roadWidth;
  const G = (F / 2) * Math.tan(IN.repose * Math.PI / 180);
  const L = C - (IN.pileCount - 1) * IN.pileGap - IN.pileCount * F;
  const V = 0.5 * F * G * L + IN.pileCount * Math.PI * (F / 2) * (F / 2) * G / 3;
  assert.ok(rel(z.volume.value, V) < 1e-9,
    '야드 총 체적 엔진 ' + z.volume.value.toFixed(2) + ' vs 독립 ' + V.toFixed(2));
  // 골든값과도 맞는가
  assert.ok(rel(z.volume.value, data.PRESETS.exampleYardA.expected.volume) < 3e-4,
    '예시 야드 A 골든값 재현');
}

// ===== Shed 단면적: 영역 분해 vs 신발끈 공식 =====
// 엔진은 ①②③ 세 조각으로 나눠 더한다. 조각이 겹치거나 빈틈이 있으면
// 합이 실제 단면과 달라진다 — 경계 다각형 하나로 잡아 넓이를 독립적으로 구한다.
function shoelace(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}
{
  const IN = data.PRESETS.exampleShed.input;
  const tan = function (d) { return Math.tan(d * Math.PI / 180); };
  const La = IN.La, Lb = IN.Lb;
  const h1 = La * tan(IN.repose);              // 능선 높이
  const wh = h1 - Lb * tan(IN.repose);         // 옹벽면 높이
  const h3 = (La + Lb) * tan(IN.bottomSlope);  // 하부 쐐기 깊이

  // 단면 경계를 한 바퀴 (x 는 옹벽면 0 → 개방측 La+Lb, y 는 위가 +)
  //   옹벽면 바닥(0,−h3) → 옹벽면 상단(0, wh) → 능선(Lb, h1) → 개방측 끝(Lb+La, 0)
  //   → 다시 바닥선을 따라 옹벽면 바닥으로
  const poly = [
    [0, -h3],
    [0, wh],
    [Lb, h1],
    [Lb + La, 0],
    [0, -h3]            // 하부 쐐기 빗면이 (Lb+La, 0) 에서 (0, −h3) 로 곧장 간다
  ];
  const areaPoly = shoelace(poly.slice(0, 4));

  const sec = shedE.computeSection(IN);
  assert.ok(rel(sec.sectionArea.value, areaPoly) < 1e-9,
    'Shed 단면적: 엔진 ' + sec.sectionArea.value.toFixed(3) +
    ' vs 경계 다각형 ' + areaPoly.toFixed(3));
  // 조각의 합 = 전체
  const sum = sec.A1.value + sec.A2.value + sec.A3.value;
  assert.ok(rel(sum, sec.sectionArea.value) < 1e-12, '①+②+③ = 총 단면적');
  // 골든값
  assert.ok(rel(sec.sectionArea.value, data.PRESETS.exampleShed.expected.sectionArea) < 1e-3,
    'Shed 단면적 골든값 재현');
}

// ===== Silo 배치 길이: 닫힌 식 vs 원을 직접 놓아 좌우 끝 좌표 =====
{
  const pitch = 50, fw = 60, dia = 40;
  [1, 2, 5, 14, 30].forEach(function (n) {
    const z = siloE.computeSilo({
      count: n, rows: 1, pitch: pitch, footprintWidth: fw, innerDia: dia,
      corridorWidth: 5, capacity: 50000, operatingEff: 0.6
    });
    // 독립: 첫 원 중심은 점유폭 절반, 이후 중심간격마다.
    // 배치 길이 = 마지막 중심 + 점유폭 절반
    const firstC = fw / 2;
    const lastC = firstC + (n - 1) * pitch;
    const len = lastC + fw / 2;
    assert.ok(rel(z.bandLength.value, len) < 1e-9,
      n + '기 배치 길이: 엔진 ' + z.bandLength.value + ' vs 독립 ' + len);
    // 원끼리 겹치지 않는가 (중심간격 ≥ 직경)
    assert.ok(pitch >= dia, '중심간격이 직경보다 커야 원이 겹치지 않는다');
  });
  // 골든값 — 12기 1열 610 × 60 m
  const z12 = siloE.computeSilo({
    count: 12, rows: 1, pitch: 50, footprintWidth: 60, innerDia: 40,
    corridorWidth: 0, capacity: 50000, operatingEff: 0.6
  });
  assert.strictEqual(z12.bandLength.value, 610);
  assert.strictEqual(z12.bandWidth.value, 60);
}

// ===== 수요 계산: 정방향 → 역방향 왕복 =====
{
  const d = core.computeDemand({
    annualUsage: 5000000, operatingDays: 365, stockDays: 30,
    operatingEff: 0.75, label: '석탄'
  });
  // 일일 사용량에서 연간을 되돌린다
  assert.ok(rel(d.daily.value * 365, 5000000) < 1e-9, '일일 → 연간 왕복');
  // 대상 저장용량에서 재고일수를 되돌린다
  assert.ok(rel(d.targetCapacity.value / d.daily.value, 30) < 1e-9, '대상용량 → 재고일수 왕복');
  // 설계 대상용량에 효율을 다시 곱하면 대상용량
  assert.ok(rel(d.designCapacity.value * 0.75, d.targetCapacity.value) < 1e-9,
    '설계용량 × 효율 = 대상용량');
}

// ===== 열 수 산정이 용량을 실제로 담는가 =====
// ceil 로 올림했으니 '최종 적치가능 용량 ≥ 대상 저장용량' 이어야 한다.
// (설계 대상용량이 아니라 대상 저장용량 — 효율은 이미 한 번 반영됐다)
{
  const app = require('../js/rsd-app.js');
  [1000000, 5000000, 15000000, 45000000].forEach(function (usage) {
    [7, 15, 30, 60].forEach(function (days) {
      const s = app.initialState();
      s.materials.ironOre.annualUsage = usage;
      s.materials.ironOre.stockDays = days;
      const r = app.recompute(s);
      const e = r.materials.ironOre;
      const need = e.demand.targetCapacity.value;
      const have = e.sizing.totalCapacity.value;
      assert.ok(have >= need - 1e-6,
        usage / 10000 + '만t/년 · ' + days + '일: 확보 ' + Math.round(have) +
        ' t 가 목표 ' + Math.round(need) + ' t 에 못 미친다');
      // 한 열을 빼면 모자라야 한다 (과다 산정이 아님을 보인다)
      if (e.sizing.rows.value > 1) {
        const oneLess = have / e.sizing.rows.value * (e.sizing.rows.value - 1);
        assert.ok(oneLess < need,
          usage / 10000 + '만t/년 · ' + days + '일: 한 열이 남는다 (과다 산정)');
      }
    });
  });
}

console.log('OK: cross-check');
