(function (global) {
  const req = (typeof require !== 'undefined');
  const core = req ? require('./rsd-core.js') : global.RSD.core;
  const math = req ? require('./rsd-math.js') : global.RSD.math;
  const res = core.res, fmt = core.fmt;

  const SRC = 'Shed 비대칭 단면 산정 일반식 — 개방측 삼각형 + 옹벽측 사다리꼴 + 하부 쐐기';
  const SRC_DIM = 'Shed 건축 치수 산정식';

  // 비대칭 단면 3영역
  //   ① 개방측 삼각형 — 꼭대기에서 La 만큼 안식각으로 흘러내림
  //   ② 옹벽측 사다리꼴 — 꼭대기에서 Lb 만큼 안식각으로 내려가 옹벽에 닿음
  //   ③ 하부 쐐기 — 바닥이 하부경사각으로 기울어 생기는 추가 단면
  //
  // h2 는 표시용 참조값이며 단면적 계산에 관여하지 않는다.
  function computeSection(input) {
    const La = input.La, Lb = input.Lb;
    const rep = input.repose, bot = input.bottomSlope, K = input.density;

    const tanRep = math.tan(rep);
    const h1 = La * tanRep;
    const A1 = 0.5 * La * h1;

    const wallHeight = h1 - Lb * tanRep;
    const A2 = Lb * (h1 + wallHeight) / 2;

    const base = La + Lb;
    const h3 = base * math.tan(bot);
    const A3 = 0.5 * base * h3;

    const area = A1 + A2 + A3;
    const tPerM = area * K;

    return {
      h1: res(h1, 'm', 'h1 = La × tan(안식각)',
        `= ${La} × tan(${rep}°) = ${h1.toFixed(2)}`, SRC),
      A1: res(A1, 'm²', '① 단면적 = ½ × La × h1',
        `= ½ × ${La} × ${h1.toFixed(2)} = ${A1.toFixed(2)}`, SRC),
      wallHeight: res(wallHeight, 'm', '옹벽측 높이 = h1 − Lb × tan(안식각)',
        `= ${h1.toFixed(2)} − ${(Lb * tanRep).toFixed(2)} = ${wallHeight.toFixed(2)}`, SRC),
      A2: res(A2, 'm²', '② 단면적 = Lb × (h1 + 옹벽측높이) ÷ 2',
        `= ${Lb} × (${h1.toFixed(2)} + ${wallHeight.toFixed(2)}) ÷ 2 = ${A2.toFixed(2)}`, SRC),
      h3: res(h3, 'm', 'h3 = (La + Lb) × tan(하부경사각)',
        `= ${base} × tan(${bot}°) = ${h3.toFixed(2)}`, SRC),
      A3: res(A3, 'm²', '③ 단면적 = ½ × (La + Lb) × h3',
        `= ½ × ${base} × ${h3.toFixed(2)} = ${A3.toFixed(2)}`, SRC),
      sectionArea: res(area, 'm²', '총 단면적 = ① + ② + ③',
        `= ${A1.toFixed(2)} + ${A2.toFixed(2)} + ${A3.toFixed(2)} = ${area.toFixed(2)}`, SRC),
      tPerM: res(tPerM, 't/m', '단위길이 용량 = 총 단면적 × 비중',
        `= ${area.toFixed(2)} × ${K} = ${tPerM.toFixed(2)}`, SRC)
    };
  }

  // Shed 전체: 셀 용량 + 건물 치수
  function computeShed(input) {
    const warnings = [];
    const section = computeSection(input);
    const tPerM = section.tPerM.value;

    const bays = input.bays;
    const cellsPerBay = input.cellsPerBay || [];
    if (cellsPerBay.length !== bays) {
      warnings.push(
        `bay 수(${bays})와 셀 배열 개수(${cellsPerBay.length})가 일치하지 않습니다 — ` +
        `bay마다 셀 길이 배열이 하나씩 있어야 합니다`
      );
    }

    // 셀별 용량
    const cells = [];
    let maxBayStackLength = 0;
    let maxCellCount = 0;
    let totalCapacity = 0;
    for (let b = 0; b < cellsPerBay.length; b++) {
      const lengths = cellsPerBay[b];
      let bayLength = 0;
      for (let i = 0; i < lengths.length; i++) {
        const len = lengths[i];
        const cap = len * tPerM;
        totalCapacity += cap;
        bayLength += len;
        cells.push({
          bay: b + 1,
          index: i + 1,
          length: res(len, 'm', `Bay ${b + 1} · ${i + 1}번 셀 길이`, `= ${len}`, '사용자 입력'),
          capacity: res(cap, 't', '셀 용량 = 단위길이 용량 × 셀 길이',
            `= ${tPerM.toFixed(2)} × ${len} = ${fmt(cap)}`, SRC)
        });
      }
      if (bayLength > maxBayStackLength) maxBayStackLength = bayLength;
      if (lengths.length > maxCellCount) maxCellCount = lengths.length;
    }

    // 길이 = 정비존×2 + 최장 bay 적치길이 + 격벽(셀수−1) + 양단벽×2
    // 셀이 하나도 없으면 건물 자체가 없다 — 정비존·양단벽만 남겨 두면
    // 담는 것도 없는 34.5 × 120 m 건물이 총면적에 잡힌다.
    const partitions = Math.max(0, maxCellCount - 1);
    const length = (maxCellCount === 0) ? 0
      : input.maintZone * 2
        + maxBayStackLength
        + input.wallThickness * partitions
        + input.endWallThickness * 2;

    // bay폭 = 중앙옹벽½ + 법면측여유 + Lb + La + 개방측여유
    const bayWidth = input.centerWallThickness / 2
      + input.slopeSideClear
      + input.Lb
      + input.La
      + input.openSideClear;
    const width = (maxCellCount === 0) ? 0 : bayWidth * bays;

    const area = length * width;

    const eff = (input.operatingEff === undefined) ? 1 : input.operatingEff;
    const effectiveCapacity = totalCapacity * eff;

    let achievedStockDays = 0;
    if (input.daily && input.daily > 0) achievedStockDays = effectiveCapacity / input.daily;

    if (input.designCapacity && input.designCapacity > totalCapacity) {
      warnings.push(
        `설계 대상용량 ${fmt(input.designCapacity)} t 가 현재 구성 총 저장용량 ` +
        `${fmt(totalCapacity)} t 를 초과합니다 — 셀을 늘리거나 bay를 추가하십시오`
      );
    }

    return {
      section: section,
      cells: cells,
      stackLengthPerBay: res(maxBayStackLength, 'm', 'bay당 적치길이 = Σ 셀 길이',
        `= ${fmt(maxBayStackLength)}`, SRC_DIM),
      totalCapacity: res(totalCapacity, 't', '총 저장용량 = Σ (셀 길이 × 단위길이 용량)',
        `= ${fmt(totalCapacity)}`, SRC),
      effectiveCapacity: res(effectiveCapacity, 't', '유효 저장용량 = 총 저장용량 × 운영효율',
        `= ${fmt(totalCapacity)} × ${eff} = ${fmt(effectiveCapacity)}`, SRC),
      length: res(length, 'm',
        'Shed 길이 = 정비존×2 + bay당 적치길이 + 격벽×(셀수−1) + 양단벽×2',
        `= ${input.maintZone}×2 + ${fmt(maxBayStackLength)} + ${input.wallThickness}×${partitions} + ${input.endWallThickness}×2 = ${fmt(length)}`,
        SRC_DIM),
      width: res(width, 'm',
        'Shed 폭 = (중앙옹벽÷2 + 법면측여유 + Lb + La + 개방측여유) × bay수',
        `= (${input.centerWallThickness}÷2 + ${input.slopeSideClear} + ${input.Lb} + ${input.La} + ${input.openSideClear}) × ${bays} = ${fmt(width)}`,
        SRC_DIM),
      area: res(area, 'm²', 'Shed 면적 = 길이 × 폭',
        `= ${fmt(length)} × ${fmt(width)} = ${fmt(area)}`, SRC_DIM),
      achievedStockDays: res(achievedStockDays, 'day',
        '최종 적치가능 재고일수 = 유효 저장용량 ÷ 일일 사용량',
        input.daily
          ? `= ${fmt(effectiveCapacity)} ÷ ${fmt(input.daily)} = ${achievedStockDays.toFixed(1)}`
          : '= 0 (일일 사용량 미입력)', SRC),
      warnings: warnings
    };
  }

  const api = { computeSection: computeSection, computeShed: computeShed, SRC: SRC };
  global.RSD = global.RSD || {};
  global.RSD.shed = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
