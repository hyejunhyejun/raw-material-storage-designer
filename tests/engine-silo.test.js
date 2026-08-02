const assert = require('assert');
const silo = require('../js/rsd-engine-silo.js');
const data = require('../js/rsd-data.js');

function near(actual, expected, tolPct, label) {
  const diff = Math.abs(actual - expected);
  const tol = Math.abs(expected) * tolPct / 100;
  assert.ok(diff <= tol,
    `${label}: 계산 ${actual} vs 실적 ${expected} — 오차 ${(diff / Math.abs(expected) * 100).toFixed(4)}% > 허용 ${tolPct}%`);
}

// ===== 회귀: Silo 14기 1열 =====
{
  const r = silo.computeSilo({
    count: 14, rows: 1, pitch: 51, footprintWidth: 61, innerDia: 41,
    capacity: 50000, operatingEff: 0.6, corridorWidth: 0
  });
  assert.strictEqual(r.count.value, 14);
  assert.strictEqual(r.perRow.value, 14);
  assert.strictEqual(r.bandLength.value, 724, '띠 길이 = (14−1)×51 + 61');
  assert.strictEqual(r.bandWidth.value, 61, '띠 폭 = 점유폭 + (열수−1)×중심간격');
  assert.strictEqual(r.clearance.value, 10, '순수 이격 = 중심간격 − 내경');
}

// ===== 기수 산정 (정방향) =====
{
  // 설계 대상용량 500,000 t ÷ 50,000 t = 10기
  const r = silo.computeSilo({
    designCapacity: 500000, capacity: 50000, operatingEff: 0.6,
    innerDia: 41, pitch: 51, footprintWidth: 61, corridorWidth: 5, rows: 1
  });
  assert.strictEqual(r.countExact.value, 10, '수학적 필요 기수');
  assert.strictEqual(r.count.value, 10, '설계 기수 (round-up)');
}

{
  // 520,000 t → 10.4기 → 올림 11기
  const r = silo.computeSilo({
    designCapacity: 520000, capacity: 50000, operatingEff: 0.6,
    innerDia: 41, pitch: 51, footprintWidth: 61, corridorWidth: 5, rows: 1
  });
  near(r.countExact.value, 10.4, 0.01, '수학적 필요 기수');
  assert.strictEqual(r.count.value, 11, '설계 기수는 올림');
}

// ===== 다열 배치 =====
{
  // 14기 2열 → 열당 7기 → 길이 (7−1)×51 + 61 = 367 / 폭 61 + 51 = 112
  const r = silo.computeSilo({
    count: 14, rows: 2, pitch: 51, footprintWidth: 61, innerDia: 41,
    capacity: 50000, operatingEff: 0.6, corridorWidth: 0
  });
  assert.strictEqual(r.perRow.value, 7);
  assert.strictEqual(r.bandLength.value, 367);
  assert.strictEqual(r.bandWidth.value, 112);
}

{
  // 14기 3열 → 열당 ceil(14/3)=5기 → 길이 (5−1)×51 + 61 = 265 / 폭 61 + 2×51 = 163
  const r = silo.computeSilo({
    count: 14, rows: 3, pitch: 51, footprintWidth: 61, innerDia: 41,
    capacity: 50000, operatingEff: 0.6, corridorWidth: 0
  });
  assert.strictEqual(r.perRow.value, 5);
  assert.strictEqual(r.bandLength.value, 265);
  assert.strictEqual(r.bandWidth.value, 163);
}

// ===== corridor가 폭에 더해지는가 =====
{
  const r = silo.computeSilo({
    count: 14, rows: 1, pitch: 51, footprintWidth: 61, innerDia: 41,
    capacity: 50000, operatingEff: 0.6, corridorWidth: 5
  });
  assert.strictEqual(r.bandWidth.value, 66, '띠 폭 = 61 + corridor 5');
}

// ===== 최적 열 수 제안 — 종횡비가 1에 가장 가까운 안 =====
{
  // 14기: 1열 724×61(비 11.9) / 2열 367×112(비 3.28) / 3열 265×163(비 1.63) / 4열 214×214(비 1.0)
  assert.strictEqual(silo.suggestRows(14, 51, 61, 0), 4);
}

// ===== 총 용량과 재고일수 =====
{
  const r = silo.computeSilo({
    count: 14, rows: 1, pitch: 51, footprintWidth: 61, innerDia: 41,
    capacity: 50000, operatingEff: 0.6, corridorWidth: 0, daily: 10000
  });
  assert.strictEqual(r.totalCapacity.value, 14 * 50000 * 0.6, '유효 총용량 = 기수 × 용량 × 운영효율');
  near(r.achievedStockDays.value, 42, 0.1, '재고일수 = 420,000 ÷ 10,000');
}

// ===== 경고: 중심간격가 내경보다 작은 경우 =====
{
  const r = silo.computeSilo({
    count: 4, rows: 1, pitch: 40, footprintWidth: 61, innerDia: 41,
    capacity: 50000, operatingEff: 0.6, corridorWidth: 0
  });
  assert.ok(r.warnings.length > 0, '이격거리가 음수면 경고해야 한다');
}

// ===== 열 배치 대안 =====
{
  const list = silo.arrangements(14, 51, 61, 5, 4);
  assert.strictEqual(list.length, 4, '1~4열 대안');
  assert.deepStrictEqual(list.map(function (a) { return a.rows; }), [1, 2, 3, 4]);
  // 14기를 열별로 나눈 분배 — 앞 열부터 채운다
  assert.deepStrictEqual(list[0].split, [14], '1열 = 14기');
  assert.deepStrictEqual(list[1].split, [7, 7], '2열 = 7+7');
  assert.deepStrictEqual(list[2].split, [5, 5, 4], '3열 = 5+5+4');
  // 분배 합은 항상 총 기수
  list.forEach(function (a) {
    const sum = a.split.reduce(function (t, v) { return t + v; }, 0);
    assert.strictEqual(sum, 14, a.rows + '열 분배 합 = 14');
    assert.ok(a.length > 0 && a.width > 0 && a.area > 0);
  });
  // 1열은 가장 세장하다
  assert.ok(list[0].ratio > list[3].ratio, '1열이 4열보다 종횡비가 크다');
}

// ===== computeSilo 도 열별 분배를 돌려준다 =====
{
  const r = silo.computeSilo({
    count: 14, rows: 3, pitch: 51, footprintWidth: 61, innerDia: 41,
    capacity: 50000, operatingEff: 0.6, corridorWidth: 0
  });
  assert.deepStrictEqual(r.split, [5, 5, 4], '3열이면 5+5+4');
}

console.log('OK: engine-silo');

// ===== 용량에서 제원 산출 =====
// 5만톤 기준 제원(41 m⌀ × 57.6 m)은 스스로 정합적이다:
//   총체적 π/4 × 41² × 57.6 = 76,047 m³ / 필요체적 50,000 ÷ 0.8 = 62,500 m³
//   → 충전율 0.822 · 세장비 1.405
// 다른 용량은 이 두 비를 유지한 상사 확대다.
{
  const REF = { density: 0.8, fillRatio: 0.82, slenderness: 1.405, clearance: 10, sideMargin: 20 };

  // --- 기준점을 정확히 재현하는가 ---
  const d = silo.deriveDims(Object.assign({ capacity: 50000 }, REF));
  assert.strictEqual(d.innerDia, 41, '5만톤 → 내부 직경 41 m');
  assert.strictEqual(d.totalHeight, 57.6, '5만톤 → 전체 높이 57.6 m');
  assert.strictEqual(d.pitch, 51, '중심간격 = 직경 + 순이격');
  assert.strictEqual(d.footprintWidth, 61, '점유 폭 = 직경 + 시공 여유');

  // --- 체적이 실제로 용량을 담는가 ---
  const gross = Math.PI / 4 * d.innerDia * d.innerDia * d.totalHeight;
  const held = gross * REF.fillRatio * REF.density;
  assert.ok(Math.abs(held / 50000 - 1) < 0.01,
    '산출 제원이 실제로 5만톤을 담아야 한다 (현재 ' + Math.round(held) + ' t)');

  // --- 용량을 키우면 제원도 커진다 (단조) ---
  const caps = [10000, 25000, 50000, 75000, 100000, 200000];
  let prev = null;
  caps.forEach(function (c) {
    const x = silo.deriveDims(Object.assign({ capacity: c }, REF));
    if (prev) {
      assert.ok(x.innerDia >= prev.innerDia, c + ' t 에서 직경이 줄었다');
      assert.ok(x.totalHeight >= prev.totalHeight, c + ' t 에서 높이가 줄었다');
    }
    // 세장비는 유지된다 (반올림 오차 범위)
    assert.ok(Math.abs(x.totalHeight / x.innerDia - REF.slenderness) < 0.02,
      c + ' t 에서 세장비가 어긋났다 (' + (x.totalHeight / x.innerDia).toFixed(3) + ')');
    // 순이격·시공 여유는 절대값 — 직경과 함께 커지지 않는다
    assert.strictEqual(x.pitch - x.innerDia, REF.clearance, '순이격은 절대값');
    assert.strictEqual(x.footprintWidth - x.innerDia, REF.sideMargin, '시공 여유는 절대값');
    prev = x;
  });

  // --- 체적은 용량에 비례, 직경은 세제곱근에 비례 ---
  const a = silo.deriveDims(Object.assign({ capacity: 50000 }, REF));
  const b = silo.deriveDims(Object.assign({ capacity: 400000 }, REF));   // 8배
  assert.ok(Math.abs(b.innerDia / a.innerDia - 2) < 0.02,
    '용량 8배 → 직경 2배 (∛8) — 현재 ' + (b.innerDia / a.innerDia).toFixed(3));

  // --- 비중이 높으면 같은 톤수에 더 작은 Silo ---
  const coal = silo.deriveDims(Object.assign({ capacity: 50000 }, REF));
  const lime = silo.deriveDims(Object.assign({ capacity: 50000 }, REF, { density: 1.5 }));
  assert.ok(lime.innerDia < coal.innerDia, '무거운 원료는 같은 톤수에 더 작은 Silo');
  assert.ok(Math.abs(lime.volume / coal.volume - 0.8 / 1.5) < 1e-6, '필요체적은 비중에 반비례');
}

// ===== 산출 모드 ↔ 직접 입력 모드 =====
{
  const base = {
    capacity: 100000, density: 0.8, fillRatio: 0.82, slenderness: 1.405,
    clearance: 10, sideMargin: 20, corridorWidth: 5, rows: 1,
    operatingEff: 0.6, designCapacity: 500000,
    innerDia: 41, totalHeight: 57.6, pitch: 51, footprintWidth: 61   // 옛 제원
  };

  // 산출 모드 — 입력에 남아 있는 옛 제원을 무시하고 용량에서 다시 뽑는다
  const derived = silo.computeSilo(Object.assign({}, base, { sizingMode: 'derive' }));
  assert.strictEqual(derived.derived, true);
  assert.ok(derived.innerDia.value > 41, '10만톤이면 41 m 보다 커야 한다');
  assert.ok(derived.requiredVolume.value > 0, '필요 체적이 계산되어야 한다');

  // 직접 입력 모드 — 준 제원을 그대로 쓴다
  const manual = silo.computeSilo(Object.assign({}, base, { sizingMode: 'manual' }));
  assert.strictEqual(manual.derived, false);
  assert.strictEqual(manual.innerDia.value, 41, '직접 입력 모드는 준 값을 그대로');
  assert.strictEqual(manual.pitch.value, 51);

  // 배치 치수가 산출 제원을 따라간다
  assert.ok(derived.bandWidth.value > manual.bandWidth.value,
    '큰 Silo 는 배치 폭도 커야 한다');

  // 모드를 안 주면 직접 입력 (기존 검증 경로가 깨지면 안 된다)
  const noMode = silo.computeSilo(base);
  assert.strictEqual(noMode.derived, false, '모드 미지정은 직접 입력으로 본다');
}
