(function (global) {
  // 저장타입 비교 — 같은 원료·같은 재고일수를 세 타입으로 했을 때를 대조한다.
  //
  // 대상 저장용량(= 일일사용량 × 재고일수)은 타입과 무관하게 같지만,
  // 운영효율이 타입마다 다르므로(야드·Shed 75%, Silo 60%) 설계 대상용량은 달라진다.
  // 그 차이까지 포함해서 면적을 비교해야 의사결정이 제대로 된다.

  const req = (typeof require !== 'undefined');
  const core  = req ? require('./rsd-core.js')          : global.RSD.core;
  const yardE = req ? require('./rsd-engine-yard.js')   : global.RSD.yard;
  const shedE = req ? require('./rsd-engine-shed.js')   : global.RSD.shed;
  const siloE = req ? require('./rsd-engine-silo.js')   : global.RSD.silo;
  const BD    = req ? require('./rsd-bands.js')         : global.RSD.bands;
  const COST  = req ? require('./rsd-cost.js')          : global.RSD.cost;
  // rsd-app.js 는 이 파일보다 뒤에 로드되므로 지연 해석해야 한다.
  // 로드 시점에 잡으면 브라우저에서 undefined 가 된다 (node 의 require 는 즉시 해석돼 안 걸림).
  function appMod() { return req ? require('./rsd-app.js') : global.RSD.app; }

  const TYPES = ['yard', 'shed', 'silo'];
  const TYPE_LABEL = { yard: '오픈야드', shed: 'Shed', silo: 'Silo' };

  function effFor(type, state) {
    if (type === 'silo') return state.silo.operatingEff;
    if (type === 'shed') return state.shed.operatingEff;
    return state.yard.operatingEff;
  }

  function compareTypes(state, materialKey) {
    const m = state.materials[materialKey];
    const out = { material: m, best: null };
    let bestArea = Infinity, bestKey = null;

    TYPES.forEach(function (type) {
      const feasible = m.types.indexOf(type) >= 0;
      const eff = effFor(type, state);

      const demand = core.computeDemand({
        annualUsage: m.annualUsage,
        operatingDays: state.operatingDays,
        stockDays: m.stockDays,
        operatingEff: eff,
        label: m.label
      });
      const design = demand.designCapacity.value;
      const daily = demand.daily.value;

      let area = 0, sizing = null, spec = '', fp = null;

      if (type === 'yard') {
        sizing = yardE.computeYard(Object.assign(appMod().yardInput(state, m), {
          density: m.density, repose: m.repose, operatingEff: eff,
          designCapacity: design, daily: daily
        }));
        // 이 원료만 야드로 놓았을 때 필요한 이동기기 띠 수 —
        // 배치 규칙과 같은 함수를 써야 ⑥ 마스터플랜과 어긋나지 않는다.
        // (1열이어도 띠 하나는 반드시 붙는다. 없으면 적치·불출이 불가능하다)
        const rows = sizing.rows.value;
        const srBands = BD.srBandCount(rows);
        area = sizing.footprintArea.value * rows
          + state.yard.srBandWidth * state.yard.yardLength * srBands;
        spec = rows + '열 × ' + state.yard.yardLength + ' m';
        fp = { L: state.yard.yardLength,
               W: rows * state.yard.yardWidth + srBands * state.yard.srBandWidth,
               H: sizing.pileHeight.value };

      } else if (type === 'shed') {
        const shedIn = Object.assign({}, state.shed, {
          density: m.density, repose: m.repose,
          designCapacity: design, daily: daily, operatingEff: eff
        });
        shedIn.cellsPerBay = appMod().buildCells(shedIn, design);
        sizing = shedE.computeShed(shedIn);
        area = sizing.area.value;
        spec = sizing.cells.length + '셀 · ' + Math.round(sizing.length.value) + ' × ' +
          Math.round(sizing.width.value) + ' m';
        fp = { L: sizing.length.value, W: sizing.width.value, H: state.shed.totalHeight };

      } else {
        sizing = siloE.computeSilo(Object.assign({}, state.silo, {
          density: m.density, designCapacity: design, daily: daily, operatingEff: eff
        }));
        area = sizing.area.value;
        spec = sizing.count.value + '기 · ' + state.silo.rows + '열';
        // 제원 산출 모드면 높이도 원료·용량에 따라 달라진다
        fp = { L: sizing.bandLength.value, W: sizing.bandWidth.value,
               H: sizing.totalHeight.value };
      }

      // 면적당 저장밀도 — 같은 부지에서 얼마나 담느냐가 타입 선택의 핵심 지표다
      const tPerM2 = (area > 0) ? demand.targetCapacity.value / area : 0;

      // 투자비 — 0.6승법. 면적만으로는 결론이 안 난다:
      // Silo 는 면적이 가장 작지만 톤당 투자비는 가장 비싸다.
      const cost = COST.costFor(type, sizing, state);

      out[type] = {
        type: type,
        label: TYPE_LABEL[type],
        feasible: feasible,
        note: feasible ? '' : m.label + '은(는) ' + TYPE_LABEL[type] + ' 적용 대상이 아닙니다',
        eff: eff,
        targetCapacity: demand.targetCapacity.value,
        designCapacity: design,
        area: area,
        tPerM2: tPerM2,
        // 적치가능율 = 최대 저장용량(운영효율 미반영) ÷ 대상 저장용량.
        // 기준선은 1 ÷ 운영효율 — 타입마다 다르므로 나란히 비교하려면 함께 봐야 한다.
        stackRatio: (demand.targetCapacity.value > 0 && sizing)
          ? sizing.physicalCapacity.value / demand.targetCapacity.value : 0,
        stackFloor: (eff > 0) ? 1 / eff : 0,
        physicalCapacity: sizing ? sizing.physicalCapacity.value : 0,
        footprint: fp,
        spec: spec,
        sizing: sizing,
        demand: demand,
        cost: cost
      };

      if (feasible && area > 0 && area < bestArea) { bestArea = area; bestKey = type; }
    });

    // 오픈야드를 기준(100%)으로 각 타입의 소요 면적 비율
    const baseArea = (out.yard && out.yard.area > 0) ? out.yard.area : 0;
    TYPES.forEach(function (t) {
      out[t].vsYardPct = (baseArea > 0) ? (out[t].area / baseArea * 100) : null;
    });

    // 최소 투자비는 최소 면적과 다를 수 있다 — 둘 다 보여주고 판단은 사람이 한다.
    // 한쪽만 '최적' 으로 표시하면 트레이드오프가 숨는다.
    let cheapest = null, cheapCost = Infinity;
    TYPES.forEach(function (t) {
      if (!out[t].feasible || !(out[t].area > 0)) return;
      const c = out[t].cost.total.value;
      if (c < cheapCost) { cheapCost = c; cheapest = t; }
    });

    out.best = bestKey;          // 최소 면적
    out.cheapest = cheapest;     // 최소 투자비
    return out;
  }

  const api = { compareTypes: compareTypes, TYPES: TYPES, TYPE_LABEL: TYPE_LABEL };
  global.RSD = global.RSD || {};
  global.RSD.compare = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
