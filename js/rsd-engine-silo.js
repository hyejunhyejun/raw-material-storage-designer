(function (global) {
  const req = (typeof require !== 'undefined');
  const core = req ? require('./rsd-core.js') : global.RSD.core;
  const res = core.res, fmt = core.fmt;

  const SRC = '원형 Silo 직선배치 일반식';

  // 열 수 k 로 배치했을 때의 치수
  function dimsFor(count, rows, pitch, footprintWidth, corridorWidth) {
    // 담을 것이 없으면 부지도 없다. 0 기를 그대로 식에 넣으면
    // (0−1)×pitch + fw 로 음수가 섞여 엉뚱한 띠 치수가 나온다.
    if (!(count > 0)) return { perRow: 0, bandLength: 0, bandWidth: 0 };
    const perRow = Math.ceil(count / rows);
    const bandLength = (perRow - 1) * pitch + footprintWidth;
    const bandWidth = footprintWidth + (rows - 1) * pitch + (corridorWidth || 0);
    return { perRow: perRow, bandLength: bandLength, bandWidth: bandWidth };
  }

  // 열별 기수 분배 — 14기 3열이면 5·5·4 처럼 앞 열부터 채운다
  function rowSplit(count, rows) {
    const n = Math.max(1, rows);
    const per = Math.ceil(count / n);
    const out = [];
    let left = count;
    for (let i = 0; i < n && left > 0; i++) {
      const take = Math.min(per, left);
      out.push(take);
      left -= take;
    }
    return out;
  }

  // 열 수 대안 목록 — 사용자가 배치를 비교해 고를 수 있게
  function arrangements(count, pitch, footprintWidth, corridorWidth, maxRows) {
    const out = [];
    const top = Math.min(maxRows || 4, Math.max(1, count));
    for (let k = 1; k <= top; k++) {
      const d = dimsFor(count, k, pitch, footprintWidth, corridorWidth);
      const split = rowSplit(count, k);
      out.push({
        rows: k,
        split: split,
        perRow: d.perRow,
        length: d.bandLength,
        width: d.bandWidth,
        area: d.bandLength * d.bandWidth,
        ratio: Math.max(d.bandLength, d.bandWidth) / Math.min(d.bandLength, d.bandWidth)
      });
    }
    return out;
  }

  // 종횡비가 1에 가장 가까운 열 수를 제안 (1~4열)
  function suggestRows(count, pitch, footprintWidth, corridorWidth) {
    let best = 1, bestRatio = Infinity;
    for (let k = 1; k <= 4; k++) {
      const d = dimsFor(count, k, pitch, footprintWidth, corridorWidth);
      const ratio = Math.max(d.bandLength, d.bandWidth) / Math.min(d.bandLength, d.bandWidth);
      if (ratio < bestRatio) { bestRatio = ratio; best = k; }
    }
    return best;
  }

  // 용량에서 제원을 산출한다 (실적이 없는 용량으로 갈 때).
  //
  // 기준 제원 41 m ⌀ × 57.6 m 는 5만톤·석탄 0.8 t/m³ 기준이며 스스로 정합적이다:
  //   총체적 π/4 × 41² × 57.6 = 76,047 m³
  //   필요체적 50,000 ÷ 0.8    = 62,500 m³
  //   → 유효 충전율 0.822, 세장비 H/D 1.405
  // 이 두 비를 유지한 채 용량만 바꾸면 상사(相似) 확대·축소가 된다.
  //
  //   필요체적 V = 용량 ÷ (비중 × 충전율)
  //   V = π/4 · D² · H,  H = 세장비 · D
  //   → D = ∛(4V ÷ (π · 세장비)),  H = 세장비 · D
  //
  // 순이격·점유폭 여유는 **접근·시공 여유**라 직경과 함께 커지지 않는다 —
  // 절대값(10 m · 20 m)으로 두고 직경에 더한다.
  function deriveDims(input) {
    const dens = input.density > 0 ? input.density : 0.8;
    const fill = input.fillRatio > 0 ? input.fillRatio : 0.82;
    const sl = input.slenderness > 0 ? input.slenderness : 1.405;
    const V = input.capacity / (dens * fill);
    const D = Math.cbrt(4 * V / (Math.PI * sl));
    // 실무 치수 단위로 정리 — 직경 0.5 m, 높이 0.1 m
    const dia = Math.round(D * 2) / 2;
    const h = Math.round(sl * dia * 10) / 10;
    return {
      volume: V,
      innerDia: dia,
      totalHeight: h,
      pitch: dia + (input.clearance === undefined ? 10 : input.clearance),
      footprintWidth: dia + (input.sideMargin === undefined ? 20 : input.sideMargin)
    };
  }

  function computeSilo(input) {
    const warnings = [];

    // 제원 산출 모드면 용량에서 직경·높이를 뽑아 쓴다.
    // 사용자가 벤더 제원을 들고 있으면 manual 로 직접 넣는다.
    const derived = (input.sizingMode === 'derive') ? deriveDims(input) : null;
    if (derived) input = Object.assign({}, input, {
      innerDia: derived.innerDia, totalHeight: derived.totalHeight,
      pitch: derived.pitch, footprintWidth: derived.footprintWidth
    });

    const pitch = input.pitch;
    const innerDia = input.innerDia;
    const clearance = pitch - innerDia;
    if (clearance < 0) {
      warnings.push(
        `Silo 순수 이격거리가 음수입니다 (${clearance} m) — ` +
        `중심간격 ${pitch} m 가 내부 직경 ${innerDia} m 보다 커야 합니다`
      );
    }

    const eff = input.operatingEff;

    // 기수: count가 직접 주어지면 그대로, 아니면 설계 대상용량에서 산정
    let countExact = 0, count = 0;
    if (input.count) {
      count = input.count;
      countExact = input.count;
    } else if (input.designCapacity && input.capacity > 0) {
      countExact = input.designCapacity / input.capacity;
      count = Math.ceil(countExact);
    }

    // 기수는 통으로만 늘어난다 — 1기가 5만 t 이면 5.1만 t 이 필요해도 2기다.
    // 야드와 같은 규칙으로 과잉을 알려 준다. 숫자만 보면 '이만큼 필요하다' 로 읽힌다.
    if (count > 0 && input.designCapacity > 0 && input.capacity > 0) {
      const over = (count * input.capacity) / input.designCapacity;
      if (over >= 1.5) {
        warnings.push(
          `확보 용량이 필요량의 ${over.toFixed(1)}배입니다 ` +
          `(${count}기 × ${fmt(input.capacity)} t vs 필요 ${fmt(Math.round(input.designCapacity))} t). ` +
          `기수는 통으로만 늘어나므로 1기 용량을 줄이면 면적을 아낄 수 있습니다`
        );
      }
    }

    const rows = input.rows || 1;
    const d = dimsFor(count, rows, pitch, input.footprintWidth, input.corridorWidth);
    const split = rowSplit(count, rows);
    const area = d.bandLength * d.bandWidth;

    const totalCapacity = count * input.capacity * eff;

    let achievedStockDays = 0;
    if (input.daily && input.daily > 0) achievedStockDays = totalCapacity / input.daily;

    const DSRC = derived
      ? '[산출] 기준 제원 41 m⌀ × 57.6 m / 5만톤 / 석탄 0.8 t/m³ 에서 상사 확대'
      : SRC;

    return {
      derived: derived ? true : false,
      innerDia: res(innerDia, 'm',
        derived ? '내부 직경 = ∛(4 × 필요체적 ÷ (π × 세장비))' : '내부 직경 (직접 입력)',
        derived
          ? `= ∛(4 × ${fmt(derived.volume)} ÷ (π × ${input.slenderness || 1.405})) ≈ ${innerDia}`
          : `= ${innerDia}`, DSRC),
      totalHeight: res(input.totalHeight, 'm',
        derived ? '전체 높이 = 세장비 × 내부 직경' : '전체 높이 (직접 입력)',
        derived
          ? `= ${input.slenderness || 1.405} × ${innerDia} = ${input.totalHeight}`
          : `= ${input.totalHeight}`, DSRC),
      requiredVolume: res(derived ? derived.volume : 0, 'm³',
        '필요 체적 = 1기 용량 ÷ (비중 × 충전율)',
        derived
          ? `= ${fmt(input.capacity)} ÷ (${input.density} × ${input.fillRatio || 0.82}) = ${fmt(derived.volume)}`
          : '= — (제원 직접 입력)', DSRC),
      pitch: res(pitch, 'm',
        derived ? '중심간격 = 내부 직경 + 순이격' : '중심간격 (직접 입력)',
        derived ? `= ${innerDia} + ${input.clearance === undefined ? 10 : input.clearance} = ${pitch}`
                : `= ${pitch}`, DSRC),
      footprintWidth: res(input.footprintWidth, 'm',
        derived ? '점유 폭 = 내부 직경 + 시공 여유' : '점유 폭 (직접 입력)',
        derived ? `= ${innerDia} + ${input.sideMargin === undefined ? 20 : input.sideMargin} = ${input.footprintWidth}`
                : `= ${input.footprintWidth}`, DSRC),
      clearance: res(clearance, 'm', '순수 이격거리 = 중심간격 − 내부 직경',
        `= ${pitch} − ${innerDia} = ${clearance}`, SRC),
      countExact: res(countExact, '기', '수학적 필요 기수 = 설계 대상용량 ÷ Silo 1기 용량',
        input.count
          ? `= ${count} (직접 지정)`
          : `= ${fmt(input.designCapacity)} ÷ ${fmt(input.capacity)} = ${countExact.toFixed(2)}`, SRC),
      count: res(count, '기', '설계 기수 = 올림(수학적 필요 기수)',
        input.count
          ? `= ${count} (직접 지정)`
          : `= ceil(${countExact.toFixed(2)}) = ${count}`, SRC),
      perRow: res(d.perRow, '기/열', '열당 기수 = 올림(설계 기수 ÷ 열 수)',
        `= ceil(${count} ÷ ${rows}) = ${d.perRow}`, SRC),
      bandLength: res(d.bandLength, 'm', '배치 길이 = (열당 기수 − 1) × 중심간격 + 점유폭',
        `= (${d.perRow} − 1) × ${pitch} + ${input.footprintWidth} = ${d.bandLength}`, SRC),
      bandWidth: res(d.bandWidth, 'm', '배치 폭 = 점유폭 + (열수 − 1) × 중심간격 + corridor',
        `= ${input.footprintWidth} + (${rows} − 1) × ${pitch} + ${input.corridorWidth || 0} = ${d.bandWidth}`, SRC),
      area: res(area, 'm²', 'Silo 부지면적 = 배치 길이 × 배치 폭',
        `= ${fmt(d.bandLength)} × ${fmt(d.bandWidth)} = ${fmt(area)}`, SRC),
      physicalCapacity: res(count * input.capacity, 't', '최대 저장용량 = 설계 기수 × 1기 용량 (운영효율 미반영)',
        `= ${count} × ${fmt(input.capacity)} = ${fmt(count * input.capacity)}`, SRC),
      totalCapacity: res(totalCapacity, 't', '유효 총 저장용량 = 설계 기수 × 1기 용량 × 운영효율',
        `= ${count} × ${fmt(input.capacity)} × ${eff} = ${fmt(totalCapacity)}`, SRC),
      achievedStockDays: res(achievedStockDays, 'day',
        '최종 적치가능 재고일수 = 유효 총 저장용량 ÷ 일일 사용량',
        input.daily
          ? `= ${fmt(totalCapacity)} ÷ ${fmt(input.daily)} = ${achievedStockDays.toFixed(1)}`
          : '= 0 (일일 사용량 미입력)', SRC),
      split: split,
      warnings: warnings
    };
  }

  const api = { computeSilo: computeSilo, deriveDims: deriveDims, suggestRows: suggestRows,
    arrangements: arrangements, rowSplit: rowSplit, SRC: SRC };
  global.RSD = global.RSD || {};
  global.RSD.silo = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
