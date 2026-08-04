(function (global) {
  // 저장타입별 투자비 — 0.6승법 (six-tenths rule)
  //
  // 화공·플랜트 견적의 표준 규모지수법이다. 설비 비용은 용량에 정비례하지 않는다 —
  // 용량은 부피(3승)로 늘지만 비용은 표면적(2승)에 가깝게 늘기 때문에
  // 지수가 대략 0.6 근처가 된다.
  //
  //     투자비 = 기준투자비 × (실제 단위용량 ÷ 기준 단위용량)^n
  //
  // **적용 단위가 핵심이다.** 지수는 '설비 1기의 크기' 에만 적용한다.
  //   · Silo 5만톤 기준 100억이면, 10만톤 Silo 1기는 100 × 2^0.6 = 152억
  //   · 5만톤 Silo 를 2기 지으면 200억 (규모의 경제가 아니라 그냥 2배)
  // 기수에까지 지수를 먹이면 "많이 지을수록 싸진다" 는 잘못된 결론이 나온다.
  //
  // 단위는 타입마다 자연스러운 반복 단위를 쓴다:
  //   오픈야드 1열 / Shed 1동 / Silo 1기

  const req = (typeof require !== 'undefined');
  const core = req ? require('./rsd-core.js') : global.RSD.core;
  const res = core.res, fmt = core.fmt;

  const SRC = '0.6승법 (규모지수법) — 기준 투자비는 사용자 입력 가정값';
  const UNIT_LABEL = { yard: '열', shed: '동', silo: '기' };
  const TYPE_LABEL = { yard: '오픈야드', shed: 'Shed', silo: 'Silo' };

  // 규모지수 적용 — 기준보다 크면 단위당 비용이 오르되 비례보다는 덜 오른다
  function scaleFactor(actualUnitCapacity, basisCapacity, exponent) {
    if (!(basisCapacity > 0) || !(actualUnitCapacity > 0)) return 1;
    return Math.pow(actualUnitCapacity / basisCapacity, exponent);
  }

  // 한 타입의 투자비.
  //   unitCapacity : 설비 1기(1열/1동)가 담는 양
  //   unitCount    : 그런 설비를 몇 개 짓는가
  function computeCost(o) {
    const type = o.type;
    const cfg = o.config || {};
    const n = (o.exponent === undefined || o.exponent === null) ? 0.6 : o.exponent;
    const basis = cfg.basisCapacity;
    const base = cfg.baseCost || 0;              // 억원
    const unitCap = o.unitCapacity || 0;
    const count = o.unitCount || 0;
    const uLabel = UNIT_LABEL[type] || '기';

    const factor = scaleFactor(unitCap, basis, n);
    const unitCost = base * factor;
    const total = unitCost * count;
    const totalCapacity = unitCap * count;
    // 톤당 투자비 — 타입 선택의 실제 판단 지표. 억원/톤은 너무 작으므로 원/톤으로.
    const perTon = (totalCapacity > 0) ? (total * 1e8 / totalCapacity) : 0;

    return {
      type: type,
      label: TYPE_LABEL[type] || type,
      basisCapacity: res(basis || 0, 't', '기준 단위용량 (이 용량에서 기준 투자비가 성립)',
        '= ' + fmt(basis || 0) + ' t / ' + uLabel, SRC),
      baseCost: res(base, '억원', '기준 투자비 (설비 1' + uLabel + ' 기준)',
        '= ' + fmt(base) + ' 억원', SRC),
      scaleFactor: res(factor, '-',
        '규모지수 = (실제 단위용량 ÷ 기준 단위용량) ^ ' + n,
        '= (' + fmt(unitCap) + ' ÷ ' + fmt(basis || 0) + ') ^ ' + n + ' = ' + factor.toFixed(4), SRC),
      unitCost: res(unitCost, '억원', '설비 1' + uLabel + ' 투자비 = 기준 투자비 × 규모지수',
        '= ' + fmt(base) + ' × ' + factor.toFixed(4) + ' = ' + unitCost.toFixed(1), SRC),
      unitCount: res(count, uLabel, '설비 수량', '= ' + count, SRC),
      total: res(total, '억원', '총 투자비 = 1' + uLabel + ' 투자비 × 수량',
        '= ' + unitCost.toFixed(1) + ' × ' + count + ' = ' + fmt(total), SRC),
      perTon: res(perTon, '원/t', '톤당 투자비 = 총 투자비 ÷ 총 저장용량',
        totalCapacity > 0
          ? '= ' + fmt(total) + ' 억원 ÷ ' + fmt(totalCapacity) + ' t = ' + fmt(perTon)
          : '= 0 (저장용량 없음)', SRC),
      unitCapacity: unitCap,
      totalCapacity: totalCapacity
    };
  }

  // 계산 결과에서 '설비 1기 용량'과 '수량'을 뽑아낸다.
  // 타입마다 반복 단위가 다르므로 여기서 한 번에 정리한다.
  function unitsOf(type, sizing, state) {
    if (type === 'yard') {
      // 1열이 담는 최대 적치량 (효율 반영 전 — 설비 규모는 효율과 무관하다)
      return { unitCapacity: sizing.maxCapacity.value, unitCount: sizing.rows.value };
    }
    if (type === 'silo') {
      return { unitCapacity: state.silo.capacity, unitCount: sizing.count.value };
    }
    // Shed 는 건물 하나가 단위 — 그 건물이 담는 전량
    return { unitCapacity: sizing.totalCapacity.value, unitCount: sizing.totalCapacity.value > 0 ? 1 : 0 };
  }

  function costFor(type, sizing, state) {
    const u = unitsOf(type, sizing, state);
    return computeCost({
      type: type,
      config: (state.cost && state.cost[type]) || {},
      exponent: state.cost ? state.cost.exponent : 0.6,
      unitCapacity: u.unitCapacity,
      unitCount: u.unitCount
    });
  }

  const api = {
    computeCost: computeCost, costFor: costFor, unitsOf: unitsOf,
    scaleFactor: scaleFactor, UNIT_LABEL: UNIT_LABEL, TYPE_LABEL: TYPE_LABEL, SRC: SRC
  };
  global.RSD = global.RSD || {};
  global.RSD.cost = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
