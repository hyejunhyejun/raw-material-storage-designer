(function (global) {
  const req = (typeof require !== 'undefined');
  const core   = req ? require('./rsd-core.js')          : global.RSD.core;
  const data   = req ? require('./rsd-data.js')          : global.RSD.data;
  const yardE  = req ? require('./rsd-engine-yard.js')   : global.RSD.yard;
  const shedE  = req ? require('./rsd-engine-shed.js')   : global.RSD.shed;
  const siloE  = req ? require('./rsd-engine-silo.js')   : global.RSD.silo;
  const costE  = req ? require('./rsd-cost.js')          : global.RSD.cost;

  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

  // 기본값 위에 불러온 값을 얹는다. 불러온 쪽에 없는 항목은 기본값이 남는다.
  // 배열은 통째로 교체한다 — 셀 길이 배열 같은 것을 원소별로 섞으면
  // 옛 파일의 셀 6개 + 기본값 셀 8개 = 셀 8개 같은 엉뚱한 결과가 된다.
  function deepMerge(base, patch) {
    if (patch === null || patch === undefined) return deepCopy(base);
    if (Array.isArray(patch) || typeof patch !== 'object') return deepCopy(patch);
    if (Array.isArray(base) || typeof base !== 'object' || base === null) return deepCopy(patch);
    const out = {};
    Object.keys(base).forEach(function (k) { out[k] = deepMerge(base[k], patch[k]); });
    // 불러온 쪽에만 있는 항목도 살린다 (사용자가 원료를 추가했을 수 있다)
    Object.keys(patch).forEach(function (k) {
      if (!(k in out)) out[k] = deepCopy(patch[k]);
    });
    return out;
  }

  // 'yard.yardLength' 같은 점 표기 경로에 값을 쓴다
  function setPath(obj, path, value) {
    const keys = path.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (cur[keys[i]] === undefined) cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = value;
  }

  function getPath(obj, path) {
    const keys = path.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length; i++) {
      if (cur === undefined || cur === null) return undefined;
      cur = cur[keys[i]];
    }
    return cur;
  }

  // 상태 저장소 — 변경 시 구독자에게 통보
  function createStore(initial) {
    const seed = deepCopy(initial);
    let state = deepCopy(initial);
    const subs = [];
    function notify() { for (let i = 0; i < subs.length; i++) subs[i](state); }
    return {
      get: function () { return state; },
      set: function (path, value) { setPath(state, path, value); notify(); },
      getPath: function (path) { return getPath(state, path); },
      subscribe: function (fn) { subs.push(fn); },
      // 상태 전체 교체 — 불러오기·시나리오 되돌리기용.
      // **깊은 병합**이라야 옛 저장파일도 열린다. 얕게 덮으면
      // materials 가 통째로 갈려서, 나중에 추가된 항목(원료별 파일 수 등)이
      // undefined 인 채로 화면에 들어간다 — 입력칸에 "undefined" 가 뜬다.
      replace: function (next) { state = sanitize(deepMerge(seed, next), seed); notify(); },
      reset: function () { state = deepCopy(seed); notify(); }
    };
  }

  // 0 이나 음수가 들어가면 계산이 성립하지 않는 값들 — 여기서 되돌린다.
  //
  // 상태는 localStorage 에 자동 저장되므로, 한 번 들어간 잘못된 값은 새로고침해도
  // 그대로 살아나 도구가 계속 죽는다. 입력 단에서 막는 것만으로는
  // **이미 저장된** 값을 구제할 수 없어 여기서도 한 번 더 본다.
  const POSITIVE = [
    'operatingDays',
    'yard.operatingEff', 'shed.operatingEff', 'silo.operatingEff'
  ];
  function sanitize(state, seed) {
    POSITIVE.forEach(function (path) {
      const v = getPath(state, path);
      if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
        setPath(state, path, getPath(seed, path));
      }
    });
    return state;
  }

  // 부팅 기본 시나리오 — 조강 약 1,000만 t/년 일관제철소
  // 석탄은 기본 시나리오에서 Silo 14기가 나오는 값으로 잡았다
  const SCENARIO = {
    ironOre: { annualUsage: 15000000, stockDays: 15, storageType: 'yard' },
    coal:    { annualUsage: 5000000,  stockDays: 30, storageType: 'silo' },
    flux:    { annualUsage: 1500000,  stockDays: 15, storageType: 'yard' }
  };

  function initialState() {
    const D = data.getDefaults();
    const materials = {};
    for (const key of Object.keys(D.materials)) {
      const s = SCENARIO[key] || { annualUsage: 0, stockDays: 15, storageType: 'yard' };
      materials[key] = Object.assign({}, D.materials[key], {
        key: key,
        enabled: true,                 // 검토 대상 여부 — 끄면 계산·도면에서 아예 빠진다
        annualUsage: s.annualUsage,
        stockDays: s.stockDays,
        storageType: s.storageType,
        // 파일 수·파일간 간격은 원료마다 다르다.
        // (철광석은 브랜드가 많아 파일 10개, 석탄은 5개일 수 있다)
        // 야드 길이·폭 같은 부지 제원은 공통이므로 state.yard 에 남는다.
        pileCount: D.yard.pileCount,
        pileGap: D.yard.pileGap
      });
    }
    return {
      activeTab: 'material',
      operatingDays: D.operatingDays,
      materials: materials,
      yard: D.yard,
      shed: D.shed,
      silo: D.silo,
      cost: D.cost,
      master: D.master
    };
  }

  // 검토 대상으로 켜 둔 원료만 추린다
  function enabledKeys(state) {
    return Object.keys(state.materials).filter(function (k) {
      return state.materials[k].enabled !== false;
    });
  }

  // 야드 계산 입력 = 공통 부지 제원 + 그 원료의 파일 제원
  function bandsMod() { return req ? require('./rsd-bands.js') : global.RSD.bands; }

  function yardInput(state, m) {
    return Object.assign({}, state.yard, {
      pileCount: (m.pileCount !== undefined) ? m.pileCount : state.yard.pileCount,
      pileGap:   (m.pileGap   !== undefined) ? m.pileGap   : state.yard.pileGap
    });
  }

  function effFor(type, state) {
    if (type === 'silo') return state.silo.operatingEff;
    if (type === 'shed') return state.shed.operatingEff;
    return state.yard.operatingEff;
  }

  // Shed 셀 자동 구성 — 설계 대상용량을 담을 만큼 균등 길이 셀을 bay에 나눠 담는다.
  // 반환 형태는 [[셀길이...], [셀길이...]] 로 bay 하나당 배열 하나다.
  function buildCells(shedIn, designCapacity) {
    const section = shedE.computeSection(shedIn);
    const tPerM = section.tPerM.value;
    const bays = Math.max(1, shedIn.bays);
    // 담을 것이 없으면 건물도 없다 — 1 m 짜리 셀을 12개 세워
    // 총면적을 부풀리면 검토 결과가 거짓말이 된다
    if (!(designCapacity > 0)) {
      const empty = [];
      for (let b = 0; b < bays; b++) empty.push([]);
      return empty;
    }

    let perBay, cellLen;
    if (shedIn.sizingMode === 'add') {
      // 셀 길이를 고정하고 개수를 늘린다
      cellLen = shedIn.cellLength;
      const perCell = cellLen * tPerM;
      const need = (perCell > 0 && designCapacity > 0)
        ? Math.ceil(designCapacity / perCell) : 1;
      perBay = Math.max(1, Math.ceil(need / bays));
    } else {
      // grow — 셀 개수를 고정하고 길이를 늘린다 (bay 당 6셀 유지)
      //
      // 셀 수를 그대로 고정하면 안 된다. 수요가 적은 원료(부원료 등)는
      // 셀이 5 m 까지 쪼그라든다 — 격벽이 2 m 인데 셀이 5.5 m 면
      // 격벽이 셀 길이의 40 % 다. SPR 이 들어갈 수도 없는 형상이다.
      // 셀이 최소 길이 밑으로 내려가면 **길이를 줄이는 대신 개수를 줄인다**.
      const minLen = shedIn.minCellLength > 0 ? shedIn.minCellLength : 15;
      const asked = Math.max(1, shedIn.cellsPerBayCount || 6);
      const fits = (tPerM > 0 && designCapacity > 0)
        ? Math.floor(designCapacity / (minLen * tPerM)) : asked * bays;
      const totalCells = Math.max(1, Math.min(asked * bays, fits));
      perBay = Math.max(1, Math.ceil(totalCells / bays));
      const needLen = (tPerM > 0 && designCapacity > 0)
        ? designCapacity / (perBay * bays * tPerM) : shedIn.cellLength;
      // 0.5 m 단위로 올림 — 실무 치수 단위.
      // 최소 길이는 지킨다. 담을 양이 셀 하나보다도 적으면 그게 최소 건물이고,
      // 남는 용량은 '최종 적치가능 재고일수' 에 그대로 드러난다.
      cellLen = Math.max(minLen, Math.ceil(needLen * 2) / 2);
    }

    const out = [];
    for (let b = 0; b < bays; b++) {
      const row = [];
      for (let i = 0; i < perBay; i++) row.push(cellLen);
      out.push(row);
    }
    return out;
  }

  // 셀별 직접 입력용 배열을 bay 수·셀 수에 맞춰 늘리고 줄인다.
  // 기존에 손으로 넣은 값은 최대한 살리고, 모자란 칸만 기본 길이로 채운다.
  function resizeCells(cells, bays, perBay, fillLength) {
    const src = Array.isArray(cells) ? cells : [];
    const out = [];
    for (let b = 0; b < bays; b++) {
      const row = Array.isArray(src[b]) ? src[b] : [];
      const next = [];
      for (let i = 0; i < perBay; i++) {
        const v = Number(row[i]);
        next.push(v > 0 ? v : fillLength);
      }
      out.push(next);
    }
    return out;
  }

  // 공용 Shed — 한 동에 여러 원료를 함께 담는다.
  //
  // 원료마다 안식각·비중이 다르므로 **같은 크기의 셀이라도 담기는 양이 다르다**.
  // 철광석(2.3 t/m³)은 석탄(0.8)의 2.6배가 들어간다. 그래서 셀 배분은
  // 원료별 t/m 으로 각각 계산해야 한다.
  //
  // 배치는 원료별로 뭉쳐 놓는다 (한 구역에 한 원료) — 실제 운용이 그렇고,
  // 섞어 놓으면 Tripper 주행·불출 동선이 엉킨다.
  // bay 배정은 그때그때 짧은 쪽에 넣어 두 bay 길이를 맞춘다 —
  // 건물 길이는 **긴 bay** 가 결정하므로 한쪽에 몰면 건물이 길어진다.
  function buildSharedCells(state, matsByKey, needByKey) {
    const bays = Math.max(1, state.shed.bays);
    const keys = Object.keys(needByKey).filter(function (k) { return needByKey[k] > 0; });

    // 원료별 셀 1 m 당 용량 — 안식각·비중이 다르므로 같은 길이라도 담기는 양이 다르다
    const tPerM = {};
    keys.forEach(function (k) {
      tPerM[k] = shedE.computeSection(Object.assign({}, state.shed, {
        density: matsByKey[k].density, repose: matsByKey[k].repose
      })).tPerM.value;
    });
    // 주어진 셀 길이로 전 원료를 담는 데 필요한 셀 수
    const cellsNeeded = function (len) {
      return keys.reduce(function (n, k) {
        const per = len * tPerM[k];
        return n + (per > 0 ? Math.ceil(needByKey[k] / per) : 0);
      }, 0);
    };

    const cellLen = sharedCellLength(state, cellsNeeded);
    const rows = [], bayLen = [];
    for (let b = 0; b < bays; b++) { rows.push([]); bayLen.push(0); }

    keys.forEach(function (key) {
      const per = cellLen * tPerM[key];
      const n = (per > 0) ? Math.ceil(needByKey[key] / per) : 0;
      // 짧은 bay 부터 채워 두 bay 길이를 맞춘다
      for (let i = 0; i < n; i++) {
        const bi = bayLen.indexOf(Math.min.apply(null, bayLen));
        rows[bi].push({ length: cellLen, key: key });
        bayLen[bi] += cellLen;
      }
    });
    // bay 길이를 맞춘다 — 건물 길이는 어차피 긴 bay 가 정하므로 짧은 bay 의
    // 남는 자리는 그냥 빈 땅이다. 마지막 원료 구역을 늘려 셀로 채운다.
    // (따로 짓기도 bay 마다 같은 셀 수를 세우므로 이래야 두 방식이 같아진다)
    const maxCells = rows.reduce(function (n, r) { return Math.max(n, r.length); }, 0);
    rows.forEach(function (r) {
      while (r.length && r.length < maxCells) {
        r.push({ length: cellLen, key: r[r.length - 1].key });
      }
    });
    return rows;
  }

  // 공용 Shed 의 셀 길이. 따로 짓기(buildCells)와 같은 규칙을 따라야 한다 —
  // 원료를 하나만 Shed 로 골랐다면 '모아 짓기'와 '따로 짓기'가 같은 건물이어야 하는데,
  // 여기서만 셀 길이를 고정하면 형상이 갈린다.
  function sharedCellLength(state, cellsNeeded) {
    const sh = state.shed;
    if (sh.sizingMode === 'add') return Math.max(1, sh.cellLength);
    // grow — 셀 개수를 목표치 이내로 맞추는 **가장 짧은** 셀 길이를 찾는다.
    // 원료마다 t/m 이 달라 닫힌 해가 없으므로 0.5 m 단위로 훑는다.
    // ponytail: 선형 탐색. 셀 길이는 실무상 수백 m 를 넘지 않아 충분하다.
    const minLen = sh.minCellLength > 0 ? sh.minCellLength : 15;
    const target = Math.max(1, sh.cellsPerBayCount || 6) * Math.max(1, sh.bays);
    for (let len = minLen; len <= 500; len += 0.5) {
      if (cellsNeeded(len) <= target) return len;
    }
    return 500;
  }

  // 상태 → 결과. 순수 함수이며 DOM을 모른다.
  function recompute(state) {
    const out = { materials: {}, totals: { area: 0 } };
    let yardRowsTotal = 0;

    // 공용 Shed — 여러 원료를 한 동에 담는 구성이면 건물을 한 번만 세운다
    const shedKeys = enabledKeys(state).filter(function (k) {
      return state.materials[k].storageType === 'shed';
    });
    const useShared = (state.shed.buildingMode === 'shared') && shedKeys.length > 0;
    let sharedShed = null;
    if (useShared) {
      const matsByKey = {}, needByKey = {};
      shedKeys.forEach(function (k) {
        const m = state.materials[k];
        matsByKey[k] = { label: m.label, density: m.density, repose: m.repose, color: m.color };
        const d = core.computeDemand({
          annualUsage: m.annualUsage, operatingDays: state.operatingDays,
          stockDays: m.stockDays, operatingEff: state.shed.operatingEff, label: m.label
        });
        needByKey[k] = d.designCapacity.value;
      });
      const cells = buildSharedCells(state, matsByKey, needByKey);
      const sizing = shedE.computeShed(Object.assign({}, state.shed, {
        density: state.materials[shedKeys[0]].density,
        repose: state.materials[shedKeys[0]].repose,
        materialsByKey: matsByKey,
        cellsPerBay: cells,
        operatingEff: state.shed.operatingEff
      }));
      sharedShed = { sizing: sizing, keys: shedKeys, matsByKey: matsByKey };
      out.sharedShed = sharedShed;
    }

    for (const key of enabledKeys(state)) {
      const m = state.materials[key];
      const type = m.storageType;
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
      let sizing = null, area = 0;

      if (type === 'silo') {
        // 비중이 있어야 용량에서 체적을, 체적에서 직경을 뽑을 수 있다
        sizing = siloE.computeSilo(Object.assign({}, state.silo, {
          density: m.density, designCapacity: design, daily: daily, operatingEff: eff
        }));
        area = sizing.area.value;
      } else if (type === 'shed' && useShared) {
        // 공용 Shed — 건물은 하나. 면적은 그 원료가 쓰는 셀 길이 비율로 나눈다.
        // (건물을 원료 수만큼 세면 총면적이 몇 배로 부풀려진다)
        sizing = sharedShed.sizing;
        const mine = sizing.byMaterial[key];
        const totalLen = Object.keys(sizing.byMaterial).reduce(function (t, k) {
          return t + sizing.byMaterial[k].length;
        }, 0);
        const share = (totalLen > 0 && mine) ? mine.length / totalLen : 0;
        area = sizing.area.value * share;

      } else if (type === 'shed') {
        // 셀 구성이 지정되지 않았으면 설계 대상용량을 담을 만큼 균등 셀을 자동 생성한다.
        // 사용자가 나중에 셀별 길이를 개별 수정할 수 있게 배열 형태로 만들어 둔다.
        const shedIn = Object.assign({}, state.shed, {
          density: m.density, repose: m.repose,
          designCapacity: design, daily: daily, operatingEff: eff
        });
        // manual 모드일 때만 사용자가 넣은 셀 배열을 쓴다.
        // 다른 모드에서도 남아 있는 배열을 쓰면 자동 산정이 먹히지 않는다.
        const manual = (shedIn.sizingMode === 'manual') && Array.isArray(shedIn.cellsPerBay)
          && shedIn.cellsPerBay.length === Math.max(1, shedIn.bays);
        if (!manual) {
          shedIn.cellsPerBay = buildCells(shedIn, design);
        }
        sizing = shedE.computeShed(shedIn);
        area = sizing.area.value;
      } else {
        sizing = yardE.computeYard(Object.assign(yardInput(state, m), {
          density: m.density, repose: m.repose, operatingEff: eff,
          designCapacity: design, daily: daily
        }));
        // 야드는 열 수만큼 점유면적이 늘어난다.
        // 이동기기 및 B/C 띠는 **원료별이 아니라 야드 전체 기준**으로 한 번에 센다 —
        // 띠 하나가 좌우 두 야드를 함께 담당하므로 원료별로 세면 이중으로 세거나
        // (원료가 여럿이면) 오히려 모자라게 센다.
        area = sizing.footprintArea.value * sizing.rows.value;
        yardRowsTotal += sizing.rows.value;
      }

      out.materials[key] = { material: m, type: type, demand: demand, sizing: sizing, area: area };
      out.totals.area += area;
    }

    // 이동기기 및 Belt Conveyor 면적 — 야드가 있을 때만
    const srBands = bandsMod().srBandCount(yardRowsTotal);
    out.totals.srBands = srBands;
    out.totals.srArea = srBands * state.yard.srBandWidth * state.yard.yardLength;
    out.totals.facilityArea = out.totals.area;      // 설비 자체만
    out.totals.area += out.totals.srArea;           // 화면의 '총 점유면적'

    return out;
  }

  // ---------- 화면 ----------
  // (브라우저에서만 동작. node 테스트는 위 순수 함수들만 사용한다)

  const TABS = [
    { id: 'material', label: '① 원료·용량' },
    { id: 'yard',     label: '② 오픈야드' },
    { id: 'shed',     label: '③ Shed' },
    { id: 'silo',     label: '④ Silo' },
    { id: 'compare',  label: '⑤ 타입 비교' },
    { id: 'master',   label: '⑥ 마스터플랜' },
    { id: 'view3d',   label: '⑦ 3D 부지' },
    { id: 'sens',     label: '⑧ 민감도·시나리오' },
    { id: 'verify',   label: '검증' }
  ];

  const VIEW3D_PRESETS = [
    { id: 'bird',  label: '조감' },
    { id: 'front', label: '정면' },
    { id: 'eye',   label: '아이레벨' },
    { id: 'top',   label: '평면' }
  ];

  const TYPE_LABEL = { yard: '오픈야드', shed: 'Shed', silo: 'Silo' };
  // 운영효율은 저장타입의 성질이므로 타입 설정을 그대로 편집한다.
  // ① 탭에서 고치면 그 타입을 쓰는 모든 원료와 이후 계산 전부에 반영된다.
  const EFF_PATH = { yard: 'yard.operatingEff', shed: 'shed.operatingEff', silo: 'silo.operatingEff' };

  function ctrls()   { return req ? require('./rsd-ui-controls.js') : global.RSD.controls; }
  function uiYard()  { return req ? require('./rsd-ui-yard.js')     : global.RSD.uiYard; }
  function uiVerify(){ return req ? require('./rsd-ui.js')          : global.RSD.ui; }
  function uiFac()   { return req ? require('./rsd-ui-facility.js') : global.RSD.uiFacility; }
  function uiSens()  { return req ? require('./rsd-ui-sensitivity.js') : global.RSD.sensitivity; }
  function xp()      { return req ? require('./rsd-export.js')  : global.RSD.exporter; }

  // ① 원료·용량 탭
  // 아직 아무것도 안 건드린 상태인가 — 화면에 뜬 숫자가 '예시' 인지 '내 검토안' 인지
  // 알려주기 위해서다. 처음 여는 사람에게는 채워진 입력칸이 실제 검토 결과로 보인다.
  function isPristine(state) {
    try { return JSON.stringify(state) === JSON.stringify(initialState()); }
    catch (e) { return false; }
  }

  function renderMaterialTab(state, result) {
    const c = ctrls();
    const blocks = [];

    if (isPristine(state)) {
      blocks.push('<div class="panel intro"><h3>예시 시나리오로 시작합니다</h3>' +
        '<p class="dim">지금 화면의 숫자는 <b>조강 약 1,000만 t/년 일관제철소</b>를 가정한 예시입니다. ' +
        '아래 값을 검토 대상 조건으로 바꾸면 모든 탭의 계산·도면·3D 가 함께 따라옵니다. ' +
        '값을 하나라도 바꾸면 이 안내는 사라집니다.</p>' +
        '<p class="dim">입력값은 브라우저에 자동 저장되므로 새로고침해도 남습니다. ' +
        '처음 상태로 돌리려면 오른쪽 위 <b>초기화</b> 를 누르십시오.</p></div>');
    }

    blocks.push('<div class="panel"><h3>공통 조건</h3><div class="fields">' +
      c.numberField({ path: 'operatingDays', label: '연간 가동일수', value: state.operatingDays, unit: '일', step: 1, min: 1 }) +
      '</div></div>');

    for (const key of Object.keys(state.materials)) {
      const m = state.materials[key];
      const entry = result.materials[key];
      const opts = m.types.map(function (t) { return { value: t, label: TYPE_LABEL[t] }; });
      if (!entry) {
        // 검토 제외된 원료 — 입력만 남기고 결과는 생략한다
        blocks.push('<section class="card card-off">' +
          '<h3><label class="use-toggle"><input type="checkbox" data-use="' + c.esc(key) + '">' +
          '<span class="swatch" style="background:' + c.esc(m.color) + '"></span>' +
          c.esc(m.label) + '</label><span class="off-tag">검토 제외</span></h3>' +
          '<div class="fields">' +
          c.numberField({ path: 'materials.' + key + '.annualUsage', label: '연간 사용량', value: m.annualUsage, unit: 't/년', step: 100000, min: 0, group: true }) +
          c.numberField({ path: 'materials.' + key + '.stockDays', label: '목표 재고일수', value: m.stockDays, unit: '일', step: 1, min: 0 }) +
          c.selectField({ path: 'materials.' + key + '.storageType', label: '저장타입', value: m.storageType, options: opts }) +
          '</div></section>');
        continue;
      }

      const on = (m.enabled !== false);
      blocks.push('<section class="card' + (on ? '' : ' card-off') + '">' +
        '<h3><label class="use-toggle"><input type="checkbox" data-use="' + c.esc(key) + '"' +
        (on ? ' checked' : '') + '><span class="swatch" style="background:' + c.esc(m.color) +
        '"></span>' + c.esc(m.label) + '</label>' +
        (on ? '' : '<span class="off-tag">검토 제외</span>') + '</h3>' +
        '<div class="fields">' +
        c.numberField({ path: 'materials.' + key + '.annualUsage', label: '연간 사용량', value: m.annualUsage, unit: 't/년', step: 100000, min: 0, group: true }) +
        c.numberField({ path: 'materials.' + key + '.stockDays', label: '목표 재고일수', value: m.stockDays, unit: '일', step: 1, min: 0 }) +
        c.selectField({ path: 'materials.' + key + '.storageType', label: '저장타입', value: m.storageType, options: opts }) +
        c.numberField({ path: EFF_PATH[m.storageType], label: '운영효율',
          value: state[m.storageType].operatingEff, unit: '-', step: 0.05, min: 0.01,
          hint: TYPE_LABEL[m.storageType] + ' 공통 · ' +
            Math.round(state[m.storageType].operatingEff * 100) + '%' }) +
        c.numberField({ path: 'materials.' + key + '.density', label: '비중', value: m.density, unit: 't/m³', step: 0.1, min: 0 }) +
        c.numberField({ path: 'materials.' + key + '.repose', label: '안식각', value: m.repose, unit: '°', step: 1, min: 0 }) +
        '</div>' +
        '<div class="tiles">' +
        c.statTile({ label: '일일 사용량', value: entry.demand.daily.value, unit: 't/일' }) +
        c.statTile({ label: '대상 저장용량', value: entry.demand.targetCapacity.value, unit: 't' }) +
        c.statTile({ label: '설계 대상용량', value: entry.demand.designCapacity.value, unit: 't', sub: '운영효율 반영' }) +
        c.statTile({ label: '점유면적', value: entry.area, unit: 'm²', sub: TYPE_LABEL[entry.type] }) +
        '</div>' +
        c.resultTable([
          { label: '일일 사용량', res: entry.demand.daily },
          { label: '대상 저장용량', res: entry.demand.targetCapacity },
          { label: '설계 대상용량', res: entry.demand.designCapacity }
        ]) +
        '</section>');
    }

    blocks.push('<section class="card"><h3>합계</h3><div class="tiles">' +
      c.statTile({ label: '총 점유면적', value: result.totals.area, unit: 'm²',
        sub: (result.totals.area / 4046.86).toFixed(2) + ' acres' }) +
      '</div></section>');

    return blocks.join('');
  }

  function renderTabs(active) {
    return TABS.map(function (t) {
      return '<button class="tab' + (t.id === active ? ' active' : '') +
        '" data-tab="' + t.id + '">' + t.label + '</button>';
    }).join('');
  }

  // 3D 화면 상태 — 상태 저장소가 아니라 화면 전용이므로 여기서 들고 있는다
  let play3d = true;
  const hidden3d = {};
  let bandOrder = null;      // 마스터플랜 띠 순서 (드래그 결과)
  let cmpMaterial = null;    // 타입 비교 대상 원료

  // ③ 3D 부지 탭 — 캔버스는 draw3d 가 붙인다
  function render3dTab(state, result) {
    const c = ctrls();
    const btns = VIEW3D_PRESETS.map(function (v) {
      return '<button class="view-btn" data-view="' + v.id + '">' + v.label + '</button>';
    }).join('');
    // 원료별 표시 토글 — 체크를 풀면 해당 원료의 야드/Silo/Shed 가 3D 에서 사라진다
    const legend = Object.keys(result.materials).map(function (k) {
      const e = result.materials[k];
      const m = e.material;
      const on = hidden3d[k] ? '' : ' checked';
      return '<label class="lg"><input type="checkbox" data-mat="' + c.esc(k) + '"' + on + '>' +
        '<span class="swatch" style="background:' + c.esc(m.color) + '"></span>' +
        c.esc(m.label) + '<span class="lg-type">' + TYPE_LABEL[e.type] + '</span></label>';
    }).join('');

    const playLabel = play3d ? '❚❚ 정지' : '▶ 재생';

    return '<section class="card card-3d">' +
      '<div class="dwg3d-bar">' +
      '<div class="view-btns">' + btns +
      '<button class="view-btn play-btn' + (play3d ? ' active' : '') + '" id="play3d">' +
      playLabel + '</button></div>' +
      '<div class="legend">' + legend + '</div>' +
      '</div>' +
      '<div id="stage3d" class="dwg3d"></div>' +
      '<p class="dim dwg3d-hint">끌어서 회전 · 휠로 확대 · 오른쪽 버튼으로 이동. ' +
      '노란 덤프트럭(길이 14 m)이 축척 기준입니다. ' +
      '적치는 Stacker·Tripper, 불출은 Reclaimer·SPR·RDM 이 담당합니다.</p>' +
      '<div class="tiles">' +
      c.statTile({ label: '총 점유면적', value: result.totals.area, unit: 'm²',
        sub: (result.totals.area / 4046.86).toFixed(2) + ' acres' }) +
      '</div>' +
      '</section>';
  }

  function renderBody(state, result) {
    if (state.activeTab === 'material') return renderMaterialTab(state, result);
    if (state.activeTab === 'yard') {
      return uiYard().renderInputs(state) + uiYard().renderResult(state, result);
    }
    if (state.activeTab === 'shed') {
      return uiFac().renderShedInputs(state, result) + uiFac().renderShedResult(state, result);
    }
    if (state.activeTab === 'silo') {
      return uiFac().renderSiloInputs(state, result) + uiFac().renderSiloResult(state, result);
    }
    if (state.activeTab === 'compare') return uiFac().renderCompare(state, result, cmpMaterial);
    if (state.activeTab === 'master') return uiFac().renderMaster(state, result, bandOrder);
    if (state.activeTab === 'view3d') return render3dTab(state, result);
    if (state.activeTab === 'sens') return uiSens().renderSensitivity(state, result);
    if (state.activeTab === 'verify') return uiVerify().renderVerification();
    return '';
  }

  function boot() {
    if (typeof document === 'undefined') return;
    const store = createStore(initialState());
    const nav = document.getElementById('tabs');
    const main = document.getElementById('main');

    let view3d = 'bird';

    function paint() {
      const state = store.get();
      let result;
      // 계산이 터져도 화면은 살아 있어야 한다. 예외가 그대로 올라가면
      // main 이 빈 채로 남아 사용자가 되돌릴 방법조차 없어진다 (새로고침뿐).
      try { result = recompute(state); }
      catch (err) {
        nav.innerHTML = renderTabs(state.activeTab);
        main.innerHTML = '<section class="card empty">' +
          '<b>입력값으로 계산할 수 없습니다</b><br>' + ctrls().esc(err.message) +
          '<br><span class="dim">값을 되돌리거나 상단 “초기화” 를 누르십시오.</span></section>';
        return;
      }
      nav.innerHTML = renderTabs(state.activeTab);
      main.innerHTML = renderBody(state, result);

      addExportBars();

      // 3D 는 innerHTML 교체로 캔버스가 떨어지므로 탭에 들어올 때마다 다시 붙인다
      const stage = document.getElementById('stage3d');
      if (stage) {
        global.RSD.draw3d.mount(stage, state, result, view3d);
        const active = stage.parentNode.querySelector('[data-view="' + view3d + '"]');
        if (active) active.classList.add('active');
      } else {
        global.RSD.draw3d.unmount();
      }
    }

    // 도면 위에 내보내기 막대를 얹는다. 도면 생성기는 그림에만 집중하고
    // 화면 부속물은 여기서 붙인다 — 내보낸 SVG 에 버튼이 섞이지 않는다.
    function addExportBars() {
      main.querySelectorAll('.dwg-wrap').forEach(function (w) {
        if (w.querySelector('.dwg-tools')) return;
        const svg = w.querySelector('svg.dwg');
        if (!svg) return;
        const h4 = w.querySelector('h4');
        const name = (h4 ? h4.textContent : '도면').trim();
        const bar = document.createElement('div');
        bar.className = 'dwg-tools';
        bar.innerHTML = '<button class="mini-btn" data-dwg="png">PNG</button>' +
          '<button class="mini-btn" data-dwg="svg">SVG</button>';
        w.insertBefore(bar, svg);
        bar.setAttribute('data-name', name);
      });
      // 3D 캔버스도 그림으로 뽑을 수 있어야 한다
      const stage = document.getElementById('stage3d');
      if (stage && !stage.parentNode.querySelector('.dwg-tools')) {
        const bar = document.createElement('div');
        bar.className = 'dwg-tools';
        bar.innerHTML = '<button class="mini-btn" data-dwg3d="png">3D 화면 PNG</button>';
        stage.parentNode.insertBefore(bar, stage);
      }
    }

    // 계산서 CSV — res 객체(값·단위·식·대입·출처)를 그대로 옮긴다.
    // 숫자만 뽑으면 "이 값이 어디서 나왔나"를 파일만 보고는 알 수 없다.
    function isRes(v) {
      return v && typeof v === 'object' && typeof v.value === 'number' && 'unit' in v;
    }
    function exportSheetCsv() {
      const state = store.get();
      const result = recompute(state);
      const rows = [['원료 저장설비 면적계산 — 계산서'],
                    ['생성', new Date().toLocaleString('ko-KR')],
                    ['연간 가동일수', state.operatingDays, '일'], []];
      let totalCost = 0;
      Object.keys(result.materials).forEach(function (k) {
        const e = result.materials[k];
        rows.push([e.material.label + ' (' + TYPE_LABEL[e.type] + ')']);
        rows.push(['항목', '값', '단위', '계산식', '대입', '출처']);
        const push = function (label, r) {
          rows.push([label, r.value, r.unit || '', r.formula || '', r.substitution || '', r.source || '']);
        };
        Object.keys(e.demand).forEach(function (key) {
          if (isRes(e.demand[key])) push(e.demand[key].label || key, e.demand[key]);
        });
        Object.keys(e.sizing || {}).forEach(function (key) {
          if (isRes(e.sizing[key])) push(e.sizing[key].label || key, e.sizing[key]);
        });
        rows.push(['점유면적 (이동기기 면적 포함)', Math.round(e.area), 'm²', '', '', '']);
        // 투자비도 res 객체이므로 식·대입·출처가 그대로 따라간다
        const cst = costE.costFor(e.type, e.sizing, state);
        Object.keys(cst).forEach(function (key) {
          if (isRes(cst[key])) push(cst[key].label || key, cst[key]);
        });
        rows.push([]);
        totalCost += cst.total.value;
      });
      rows.push(['총 점유면적', Math.round(result.totals.area), 'm²']);
      rows.push(['총 투자비', Math.round(totalCost), '억원', '',
        '규모지수 n = ' + state.cost.exponent, '0.6승법 — 기준 투자비는 사용자 입력 가정값']);
      xp().downloadText(xp().toCsv(rows),
        '원료저장설비_계산서_' + xp().stamp() + '.csv', 'text/csv');
    }

    // 3D 카메라 프리셋 · 재생 토글
    main.addEventListener('click', function (e) {
      // --- 내보내기 ---
      const dx = e.target.closest('[data-dwg]');
      if (dx) {
        const wrap = dx.closest('.dwg-wrap');
        const svg = wrap && wrap.querySelector('svg.dwg');
        const nm = (wrap.querySelector('h4') ? wrap.querySelector('h4').textContent : '도면').trim();
        const card = dx.closest('.card');
        const title = card && card.querySelector('h3') ? card.querySelector('h3').textContent.trim() : '';
        const full = (title ? title + '_' : '') + nm;
        if (svg) {
          if (dx.getAttribute('data-dwg') === 'png') xp().exportPng(svg, full);
          else xp().exportSvg(svg, full);
        }
        return;
      }
      const d3 = e.target.closest('[data-dwg3d]');
      if (d3) {
        const cv = document.querySelector('#stage3d canvas');
        if (cv) xp().exportCanvas(cv, '3D_부지');
        return;
      }
      // --- 계산서 CSV ---
      const cs = e.target.closest('[data-csv]');
      if (cs) { exportSheetCsv(cs.getAttribute('data-csv')); return; }
      // --- 민감도·시나리오 탭 ---
      if (store.get().activeTab === 'sens') {
        const back = uiSens().restoreTarget(e.target);
        if (back) { store.replace(back); return; }
        if (uiSens().handleClick(e.target, store.get())) { paint(); return; }
      }
      const p = e.target.closest('#play3d');
      if (p) {
        play3d = !play3d;
        global.RSD.draw3d.setPlaying(play3d);
        p.textContent = play3d ? '❚❚ 정지' : '▶ 재생';
        p.classList.toggle('active', play3d);
        return;
      }
      const ar = e.target.closest('[data-rows]');
      if (ar) { store.set('silo.rows', Number(ar.getAttribute('data-rows'))); return; }
      const cm = e.target.closest('[data-cmp]');
      if (cm) {
        cmpMaterial = cm.getAttribute('data-cmp');
        store.set('activeTab', 'compare');   // 재렌더 유발
        return;
      }
      const b = e.target.closest('[data-view]');
      if (!b) return;
      view3d = b.getAttribute('data-view');
      b.parentNode.querySelectorAll('[data-view]').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      global.RSD.draw3d.applyView(view3d);
    });

    // 원료별 3D 표시 토글
    // 민감도 슬라이더 — 끄는 동안 따라와야 하므로 change 가 아니라 input 을 듣는다.
    // 전체를 다시 그리지 않고 마커와 요약만 갈아끼운다 (매 틱 재렌더는 화면이 튄다).
    main.addEventListener('input', function (e) {
      const sl = e.target.closest('[data-sens-slider]');
      if (sl) uiSens().applySlider(sl.value);
    });

    main.addEventListener('change', function (e) {
      const cb = e.target.closest('[data-mat]');
      if (!cb) return;
      const key = cb.getAttribute('data-mat');
      if (cb.checked) delete hidden3d[key]; else hidden3d[key] = true;
      global.RSD.draw3d.setVisible(key, cb.checked);
    });

    global.addEventListener('resize', function () { global.RSD.draw3d.resize(); });

    // 탭 전환
    nav.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      store.set('activeTab', btn.getAttribute('data-tab'));
    });

    // 입력 변경 — 이벤트 위임. change 시점에만 반영해 타이핑 중 리렌더로 포커스를 잃지 않는다.
    main.addEventListener('change', function (e) {
      const use = e.target.closest('[data-use]');
      if (use) {
        store.set('materials.' + use.getAttribute('data-use') + '.enabled', use.checked);
        return;
      }
      const el = e.target.closest('[data-path]');
      if (!el) return;
      const path = el.getAttribute('data-path');
      let value;
      if (el.getAttribute('data-num')) {
        // 천 단위 쉼표가 붙은 칸 — 숫자만 걷어내고, 못 읽으면 이전 값을 지킨다
        const n = ctrls().parseNum(el.value);
        if (n === null) { paint(); return; }
        const lo = Number(el.getAttribute('data-min'));
        value = isFinite(lo) && el.getAttribute('data-min') !== '' ? Math.max(lo, n) : n;
      } else if (el.type === 'number') {
        // min 을 여기서 강제한다. <input min> 은 스피너만 막을 뿐 직접 입력은 그대로 통과하고,
        // 운영효율 0 같은 값이 계산 엔진까지 내려가면 예외가 나 화면이 통째로 죽는다.
        // 입력이 들어오는 길목이 여기 하나뿐이므로 방어도 여기서 한 번만 하면 된다.
        const n = Number(el.value);
        if (!isFinite(n)) { paint(); return; }   // 문자·빈 칸 → 이전 값 유지
        const lo = Number(el.getAttribute('min'));
        const hi = Number(el.getAttribute('max'));
        value = (el.hasAttribute('min') && isFinite(lo)) ? Math.max(lo, n) : n;
        // 상한도 지킨다. 수량 칸(bay 수·기수·셀 수)은 그대로 반복 횟수가 되므로
        // 자릿수 하나만 잘못 쳐도 배열을 수억 개 만들다 브라우저가 죽는다.
        if (el.hasAttribute('max') && isFinite(hi)) value = Math.min(hi, value);
      } else {
        value = el.value;
      }
      store.set(path, value);

      // 셀별 직접 입력 배열은 bay 수·셀 수를 따라가야 한다.
      // 안 맞으면 manual 판정이 깨져 조용히 자동 산정으로 돌아가 버린다.
      if (/^shed\.(sizingMode|bays|cellsPerBayCount)$/.test(path)) syncManualCells();
    });

    function syncManualCells() {
      const st = store.get();
      if (st.shed.sizingMode !== 'manual') return;
      const bays = Math.max(1, st.shed.bays);
      const perBay = Math.max(1, st.shed.cellsPerBayCount);
      // 처음 manual 로 넘어올 때는 자동 산정 결과를 출발점으로 준다
      let seed = st.shed.cellsPerBay;
      if (!Array.isArray(seed)) {
        const auto = firstShedCells();
        seed = auto || [];
      }
      store.set('shed.cellsPerBay', resizeCells(seed, bays, perBay, st.shed.cellLength));
    }

    // 지금 화면의 Shed 계산 결과에서 셀 길이 배열을 뽑는다 (manual 출발점)
    function firstShedCells() {
      const st = store.get();
      const res = recompute(st);
      const k = Object.keys(res.materials).filter(function (x) {
        return res.materials[x].type === 'shed';
      })[0];
      if (!k) return null;
      const bays = Math.max(1, st.shed.bays);
      const rows = [];
      for (let b = 0; b < bays; b++) rows.push([]);
      res.materials[k].sizing.cells.forEach(function (cell) {
        const bi = Math.min(bays - 1, Math.max(0, cell.bay - 1));
        rows[bi].push(cell.length.value);
      });
      return rows;
    }

    // 도면 드래그 — 포인터 이벤트로 야드 길이를 조정한다.
    // 드래그 중에는 리페인트가 잦으므로 requestAnimationFrame 으로 한 프레임에 한 번만 반영한다.
    let drag = null, pending = false;

    // 마스터플랜 띠 재배열 — 손잡이를 잡고 위아래로 끌면 순서가 바뀐다
    let bandDrag = null;
    main.addEventListener('pointerdown', function (e) {
      const grip = e.target.closest('.band-grip');
      if (grip) {
        const g = grip.closest('[data-band]');
        const svg = grip.ownerSVGElement;
        if (!g || !svg) return;
        const vb = svg.viewBox.baseVal;
        bandDrag = {
          from: Number(g.getAttribute('data-band')),
          svg: svg,
          pxPerMeter: svg.getBoundingClientRect().height / vb.height,
          top: svg.getBoundingClientRect().top,
          vbY: vb.y
        };
        document.body.classList.add('dragging-band');
        e.preventDefault();
        return;
      }
      const h = e.target.closest('[data-drag]');
      if (!h) return;
      const svg = h.ownerSVGElement;
      if (!svg) return;
      // 화면 축척: SVG 표시 폭(px) ÷ viewBox 폭(m)
      const vb = svg.viewBox.baseVal;
      const pxPerMeter = svg.getBoundingClientRect().width / vb.width;
      drag = {
        path: h.getAttribute('data-drag'),
        startX: e.clientX,
        startValue: Number(getPath(store.get(), h.getAttribute('data-drag'))),
        pxPerMeter: pxPerMeter
      };
      document.body.classList.add('dragging');
      e.preventDefault();
    });

    window.addEventListener('pointermove', function (e) {
      if (!drag || pending) return;
      pending = true;
      const dx = e.clientX - drag.startX;
      requestAnimationFrame(function () {
        pending = false;
        if (!drag) return;
        const d2m = global.RSD.draw2d;
        const next = d2m.handleDragDelta(drag.startValue, dx, drag.pxPerMeter);
        if (next !== Number(getPath(store.get(), drag.path))) store.set(drag.path, next);
      });
    });

    window.addEventListener('pointerup', function (e) {
      if (!bandDrag) return;
      const dmm = global.RSD.draw2dMaster;
      // 화면 y → viewBox(미터) y
      const yM = bandDrag.vbY + (e.clientY - bandDrag.top) / bandDrag.pxPerMeter;
      const st = store.get();
      const res = recompute(st);
      // 띠 구성은 rsd-bands 가 단독으로 담당한다 (uiFacility 에는 더 이상 없다)
      let bands = global.RSD.bands.buildBands(st, res);
      if (bandOrder && bandOrder.length === bands.length) {
        bands = bandOrder.map(function (i) { return bands[i]; });
      }
      const to = dmm.dropIndex(bands, yM);
      const idx = bands.map(function (_, i) { return i; });
      const cur = (bandOrder && bandOrder.length === bands.length) ? bandOrder : idx;
      bandOrder = dmm.reorderBands(cur, bandDrag.from, to);
      bandDrag = null;
      document.body.classList.remove('dragging-band');
      paint();
    });

    function endDrag() {
      if (!drag) return;
      drag = null;
      document.body.classList.remove('dragging');
    }
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    // ---------- 머리말 도구: 저장 / 불러오기 / 인쇄 / 초기화 ----------
    const SAVE_KEY = 'rsd.state.v1';

    function byId(id) { return document.getElementById(id); }
    function on(id, fn) { const el = byId(id); if (el) el.addEventListener('click', fn); }

    on('save-json', function () {
      xp().downloadText(xp().stateToJson(store.get()),
        '원료저장설비_시나리오_' + xp().stamp() + '.json', 'application/json');
    });
    on('csv-btn', exportSheetCsv);
    on('print-btn', function () { window.print(); });

    // 인쇄할 때는 접힌 계산근거를 전부 펼친다. 종이에 근거가 남지 않으면
    // 보고 자리에서 "이 숫자 어디서 나왔냐"에 답할 수 없다.
    // CSS 만으로는 details 를 열 수 없으므로 여기서 열고, 끝나면 되돌린다.
    let reopened = [];
    global.addEventListener('beforeprint', function () {
      reopened = [];
      document.querySelectorAll('details:not([open])').forEach(function (d) {
        d.open = true; reopened.push(d);
      });
    });
    global.addEventListener('afterprint', function () {
      reopened.forEach(function (d) { d.open = false; });
      reopened = [];
    });
    on('reset-btn', function () {
      if (!window.confirm('입력값을 기본 시나리오로 되돌립니다. 계속할까요?')) return;
      try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* 무시 */ }
      store.reset();
    });
    on('load-json', function () { const f = byId('load-file'); if (f) f.click(); });
    const fileEl = byId('load-file');
    if (fileEl) {
      fileEl.addEventListener('change', function (e) {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = function () {
          const r = xp().jsonToState(String(rd.result));
          if (!r.ok) { window.alert('불러오기 실패: ' + r.error); return; }
          store.replace(r.state);
        };
        rd.readAsText(f, 'utf-8');
        e.target.value = '';        // 같은 파일을 다시 골라도 change 가 오도록
      });
    }

    // 새로고침해도 입력값이 남도록 자동 저장. 저장에 실패해도(사생활 모드 등)
    // 도구 자체는 계속 돌아가야 하므로 조용히 넘긴다.
    store.subscribe(function (st) {
      try { localStorage.setItem(SAVE_KEY, xp().stateToJson(st)); } catch (err) { /* 무시 */ }
    });

    store.subscribe(paint);

    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) {
        const r = xp().jsonToState(saved);
        if (r.ok) store.replace(r.state);
      }
    } catch (err) { /* 무시 */ }

    paint();
    global.RSD.store = store;
  }

  const api = {
    createStore: createStore, initialState: initialState, recompute: recompute,
    setPath: setPath, getPath: getPath, buildCells: buildCells, yardInput: yardInput,
    buildSharedCells: buildSharedCells, sanitize: sanitize, isPristine: isPristine,
    deepMerge: deepMerge,
    resizeCells: resizeCells,
    enabledKeys: enabledKeys, SCENARIO: SCENARIO,
    renderMaterialTab: renderMaterialTab, renderTabs: renderTabs,
    renderBody: renderBody, boot: boot, TABS: TABS
  };
  global.RSD = global.RSD || {};
  global.RSD.app = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', boot);
  }
})(typeof window !== 'undefined' ? window : globalThis);
