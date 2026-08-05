(function (global) {
  // ⑧ 민감도 · 시나리오
  //
  // 민감도 — "재고일수를 하루 더 잡으면 부지가 얼마나 더 드나"는 임원보고에서
  //          반드시 나오는 질문이다. 한 변수만 흔들어 면적이 어떻게 움직이는지 보여준다.
  //          면적은 열 수·기수가 정수로 올림되므로 **계단형**으로 뛴다. 이 계단이
  //          바로 "여기서 한 열이 더 필요해진다"는 경계이므로 그래프로 보여야 한다.
  //
  // 시나리오 — 현재 입력값을 A·B 두 칸에 담아두고 나란히 비교한다.

  const req = (typeof require !== 'undefined');
  function appMod() { return req ? require('./rsd-app.js') : global.RSD.app; }
  function costMod() { return req ? require('./rsd-cost.js') : global.RSD.cost; }
  function ctrls()   { return req ? require('./rsd-ui-controls.js') : global.RSD.controls; }

  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function fmt(n) { return Math.round(n).toLocaleString('ko-KR'); }

  // from~to 를 n 등분. q 를 주면 q 단위로 반올림하고 중복은 버린다.
  // (파일 수·bay 수처럼 정수여야 하는 값이 3.7 개가 되면 안 된다)
  function span(from, to, n, q) {
    const out = [];
    for (let i = 0; i < n; i++) {
      let v = from + (to - from) * (i / Math.max(1, n - 1));
      if (q) v = Math.round(v / q) * q;
      if (!out.length || Math.abs(v - out[out.length - 1]) > 1e-9) out.push(v);
    }
    return out;
  }
  // 기준값은 반드시 눈금에 들어 있어야 한다 — 없으면 '기준 대비' 가 성립하지 않고
  // 슬라이더가 지금 상태에서 출발하지도 못한다.
  function withBase(vals, base) {
    if (!vals.some(function (v) { return Math.abs(v - base) < 1e-9; })) {
      vals = vals.concat([base]).sort(function (a, b) { return a - b; });
    }
    return vals;
  }

  // 흔들 수 있는 변수 — 경로·눈금·표시 규칙을 한 곳에 모은다.
  //
  // **저장설비 규모를 실제로 정하는 인자만 넣는다.** 규모지수 n 은 뺐다 —
  // 면적은 전혀 안 움직이고, 설비 1기 용량이 기준 용량과 같으면 1^n = 1 이라
  // 투자비도 안 움직인다. 흔들 이유가 없는 변수는 민감도에 있으면 오히려 방해다.
  // (규모지수는 ⑤ 타입 비교 탭에서 직접 바꾼다)
  //
  // applies — 저장타입마다 규모를 정하는 인자가 다르다. 파일 수는 야드에만,
  // 1기 용량은 Silo 에만 의미가 있다. 안 맞는 변수를 보여주면 흔들어도 선이 평평하다.
  const ALL = ['yard', 'shed', 'silo'];
  const VARS = {
    stockDays: {
      label: '목표 재고일수', unit: '일', applies: ALL,
      path: function (key) { return 'materials.' + key + '.stockDays'; },
      range: function (base) {
        const q = base > 40 ? 2 : 1;
        return withBase(span(Math.max(1, base * 0.3), base * 2, 36, q), base);
      },
      fmt: function (v) { return Math.round(v) + '일'; }
    },
    annualUsage: {
      label: '연간 사용량', unit: 't/년', applies: ALL,
      path: function (key) { return 'materials.' + key + '.annualUsage'; },
      range: function (base) {
        return withBase(span(base * 0.4, base * 1.8, 36, base > 2e6 ? 1e5 : 1e4), base);
      },
      fmt: function (v) { return (v / 10000).toFixed(0) + '만'; }
    },
    operatingEff: {
      label: '운영효율', unit: '-', applies: ALL,
      // 저장타입의 설정이므로 원료가 아니라 타입 경로를 쓴다
      path: function (key, state) { return state.materials[key].storageType + '.operatingEff'; },
      range: function (base) { return withBase(span(0.40, 0.95, 34, 0.01), base); },
      fmt: function (v) { return Math.round(v * 100) + '%'; }
    },
    pileCount: {
      label: '파일 수 (I)', unit: '개', applies: ['yard'],
      path: function (key) { return 'materials.' + key + '.pileCount'; },
      range: function (base) { return withBase(span(1, 30, 30, 1), base); },
      fmt: function (v) { return Math.round(v) + '개'; }
    },
    yardLength: {
      label: '야드 길이 (A)', unit: 'm', applies: ['yard'],
      path: function () { return 'yard.yardLength'; },
      range: function (base) { return withBase(span(base * 0.4, base * 1.6, 32, 10), base); },
      fmt: function (v) { return Math.round(v) + 'm'; }
    },
    siloCapacity: {
      label: 'Silo 1기 용량', unit: 't', applies: ['silo'],
      path: function () { return 'silo.capacity'; },
      range: function (base) { return withBase(span(10000, 200000, 39, 5000), base); },
      fmt: function (v) { return (v / 10000).toFixed(1) + '만t'; }
    },
    shedLa: {
      label: '개방측 적치거리 (La)', unit: 'm', applies: ['shed'],
      path: function () { return 'shed.La'; },
      range: function (base) { return withBase(span(base * 0.5, base * 1.6, 34, 1), base); },
      fmt: function (v) { return Math.round(v) + 'm'; }
    }
  };

  // 이 원료의 저장타입에 의미가 있는 변수만
  function varsFor(type) {
    return Object.keys(VARS).filter(function (k) { return VARS[k].applies.indexOf(type) >= 0; });
  }

  // 한 변수만 흔들어 훑는다. 순수 함수 — 원본 상태를 건드리지 않는다.
  //
  // 눈금을 촘촘히 잡는 이유: 면적은 계단형으로 뛰는데 눈금이 성기면
  // 계단이 어디서 뛰는지가 눈금 사이에 숨어 버린다. 슬라이더로 훑으려면
  // 더더욱 촘촘해야 한다.
  function sweep(state, materialKey, varKey) {
    const app = appMod();
    const v = VARS[varKey];
    if (!v) return null;
    const path = v.path(materialKey, state);
    const base = app.getPath(state, path);
    const vals = v.range(base);
    const points = vals.map(function (val) {
      const s = deepCopy(state);
      app.setPath(s, path, val);
      const res = app.recompute(s);
      const e = res.materials[materialKey];
      const cst = e ? costMod().costFor(e.type, e.sizing, s) : null;
      return {
        input: val,
        isBase: Math.abs(val - base) < 1e-9,
        area: e ? e.area : 0,
        totalArea: res.totals.area,
        cost: cst ? cst.total.value : 0,
        perTon: cst ? cst.perTon.value : 0,
        // 실제로 담기는 재고일수 — 계단 때문에 목표보다 남거나 모자란다
        achieved: (e && e.sizing.achievedStockDays) ? e.sizing.achievedStockDays.value : 0,
        // 계단이 어디서 생기는지 — 열 수(야드) / 기수(Silo) / 셀 수(Shed)
        units: e ? unitsOf(e) : 0,
        unitLabel: e ? unitLabelOf(e) : ''
      };
    });
    const baseIndex = Math.max(0, points.findIndex(function (p) { return p.isBase; }));
    return {
      varKey: varKey, label: v.label, unit: v.unit,
      base: base, baseIndex: baseIndex, points: points
    };
  }

  function unitsOf(e) {
    if (e.type === 'yard') return e.sizing.rows.value;
    if (e.type === 'silo') return e.sizing.count.value;
    return e.sizing.cells ? e.sizing.cells.length : 0;
  }
  function unitLabelOf(e) {
    if (e.type === 'yard') return '열';
    if (e.type === 'silo') return '기';
    return '셀';
  }

  // 계단이 뛰는 지점 — "여기서 한 열이 더 필요해진다"
  function steps(sw) {
    const out = [];
    for (let i = 1; i < sw.points.length; i++) {
      if (sw.points[i].units !== sw.points[i - 1].units) out.push(sw.points[i]);
    }
    return out;
  }

  // ---------- 꺾은선 그래프 ----------
  // 도면과 같은 규칙: 미터가 아니라 자체 좌표계지만 글씨는 viewBox 폭의 1/46.
  const CW = 920, CH = 380, FS = CW / 46;
  const PAD = { l: FS * 6.5, r: FS * 2.5, t: FS * 3.4, b: FS * 3.6 };

  function esc(s) { return ctrls().esc(s); }

  // metric 을 갈아끼워 면적/투자비 두 그래프에 같은 코드를 쓴다
  const METRIC = {
    area: { get: function (p) { return p.area; }, title: '점유면적 (m²)' },
    cost: { get: function (p) { return p.cost; }, title: '투자비 (억원)' }
  };

  // 지표별 y 축 범위 — 마커를 움직일 때도 같은 식을 써야 점이 선 위에 붙는다
  function scaleOf(sw, metricKey) {
    const M = METRIC[metricKey || 'area'];
    const vals = sw.points.map(M.get);
    const max = Math.max.apply(null, vals) * 1.12 || 1;
    return {
      M: M, max: max,
      x: function (i) {
        return PAD.l + (CW - PAD.l - PAD.r) * (i / Math.max(1, sw.points.length - 1));
      },
      y: function (a) { return PAD.t + (CH - PAD.t - PAD.b) * (1 - a / max); }
    };
  }

  // 슬라이더가 가리키는 지점의 좌표 — 앱이 마커만 옮길 때 쓴다 (전체를 다시 그리지 않는다)
  function markerAt(sw, idx) {
    const i = Math.max(0, Math.min(sw.points.length - 1, idx));
    const pt = sw.points[i];
    const a = scaleOf(sw, 'area'), c = scaleOf(sw, 'cost');
    return {
      index: i, point: pt,
      area: { x: r2(a.x(i)), y: r2(a.y(pt.area)) },
      cost: { x: r2(c.x(i)), y: r2(c.y(pt.cost)) },
      top: r2(PAD.t), bottom: r2(CH - PAD.b)
    };
  }

  function chart(sw, materialLabel, metricKey, markIdx) {
    const key = metricKey || 'area';
    const sc = scaleOf(sw, key), M = sc.M;
    const pts = sw.points;
    if (!pts.length) return '';
    const x = sc.x, y = sc.y;
    const p = [];

    // 설비 수량이 바뀌는 구간을 번갈아 음영 — "이 구간은 n열" 이 한눈에 보인다.
    // 계단을 선으로만 보여주면 어디부터 어디까지가 같은 구성인지 읽히지 않는다.
    let segStart = 0, band = 0;
    for (let i = 1; i <= pts.length; i++) {
      if (i === pts.length || pts[i].units !== pts[segStart].units) {
        if (band % 2 === 1) {
          const x0 = x(segStart), x1 = x(i - 1);
          p.push('<rect class="ch-seg" x="' + r2(x0) + '" y="' + r2(PAD.t) +
            '" width="' + r2(Math.max(0.5, x1 - x0)) + '" height="' + r2(CH - PAD.t - PAD.b) + '"/>');
        }
        // 구간 가운데에 설비 수량
        const xm = (x(segStart) + x(i - 1)) / 2;
        if (x(i - 1) - x(segStart) > FS * 1.6 || pts.length < 12) {
          p.push('<text class="ch-unit" x="' + r2(xm) + '" y="' + r2(PAD.t + FS * 1.1) +
            '" font-size="' + r2(FS) + '" text-anchor="middle">' +
            pts[segStart].units + pts[segStart].unitLabel + '</text>');
        }
        segStart = i; band++;
      }
    }

    // 격자 + 세로축 눈금
    for (let g = 0; g <= 4; g++) {
      const a = sc.max * g / 4, gy = y(a);
      p.push('<line class="ch-grid" x1="' + r2(PAD.l) + '" y1="' + r2(gy) +
        '" x2="' + r2(CW - PAD.r) + '" y2="' + r2(gy) + '"/>');
      if (g === 0) continue;   // 0 눈금은 가로축 라벨과 겹친다
      p.push('<text class="ch-ax" x="' + r2(PAD.l - FS * 0.5) + '" y="' + r2(gy) +
        '" font-size="' + r2(FS) + '" text-anchor="end">' + fmt(a) + '</text>');
    }

    // 꺾은선
    p.push('<polyline class="ch-line" points="' +
      pts.map(function (pt, i) { return r2(x(i)) + ',' + r2(y(M.get(pt))); }).join(' ') + '"/>');

    // 가로축 라벨은 6~7개만. 눈금이 30개가 넘으므로 전부 적으면 글씨가 뭉갠다.
    const every = Math.max(1, Math.round((pts.length - 1) / 6));
    pts.forEach(function (pt, i) {
      const last = (i === pts.length - 1);
      if (i % every !== 0 && !last) return;
      const anc = (i === 0) ? 'start' : (last ? 'end' : 'middle');
      p.push('<text class="ch-ax" x="' + r2(x(i)) + '" y="' + r2(CH - PAD.b + FS * 1.3) +
        '" font-size="' + r2(FS) + '" text-anchor="' + anc + '">' +
        esc(fmtInput(sw, pt.input)) + '</text>');
    });

    // 기준선 — 지금 입력값이 어디인지
    const bi = sw.baseIndex;
    p.push('<line class="ch-base" x1="' + r2(x(bi)) + '" y1="' + r2(PAD.t) +
      '" x2="' + r2(x(bi)) + '" y2="' + r2(CH - PAD.b) + '"/>');
    p.push('<text class="ch-ax" x="' + r2(x(bi)) + '" y="' + r2(CH - PAD.b + FS * 2.5) +
      '" font-size="' + r2(FS) + '" text-anchor="middle">기준</text>');

    // 슬라이더 마커 — 앱이 id 로 찾아 좌표만 갈아끼운다
    const mk = markerAt(sw, (markIdx === undefined || markIdx === null) ? bi : markIdx);
    const m = mk[key];
    p.push('<line class="ch-mark-line" id="sens-markline-' + key + '" x1="' + m.x +
      '" y1="' + mk.top + '" x2="' + m.x + '" y2="' + mk.bottom + '"/>');
    p.push('<circle class="ch-mark" id="sens-mark-' + key + '" cx="' + m.x +
      '" cy="' + m.y + '" r="' + r2(FS * 0.55) + '"/>');

    p.push('<text class="ch-title" x="' + r2(PAD.l) + '" y="' + r2(FS * 1.2) +
      '" font-size="' + r2(FS) + '" text-anchor="start">' +
      esc(materialLabel + ' · ' + sw.label + ' 변화에 따른 ' + M.title) + '</text>');

    return '<svg class="dwg chart" viewBox="0 0 ' + CW + ' ' + CH +
      '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
      p.join('') + '</svg>';
  }

  function fmtInput(sw, v) {
    const V = VARS[sw.varKey];
    return V && V.fmt ? V.fmt(v) : String(Math.round(v));
  }

  // ---------- 시나리오 A/B ----------
  // 저장한 상태를 다시 계산해서 비교한다. 저장 시점의 결과를 들고 있으면
  // 계산식이 바뀌었을 때 옛 숫자가 남아 거짓 비교가 된다.
  function scenarioSummary(state) {
    const app = appMod();
    const res = app.recompute(state);
    const rows = [];
    Object.keys(res.materials).forEach(function (k) {
      const e = res.materials[k];
      rows.push({
        key: k, label: e.material.label, type: e.type,
        stockDays: e.material.stockDays,
        annualUsage: e.material.annualUsage,
        target: e.demand.targetCapacity.value,
        design: e.demand.designCapacity.value,
        units: unitsOf(e), unitLabel: unitLabelOf(e),
        area: e.area
      });
    });
    // 이동기기 및 B/C 띠는 야드 전체 기준으로 한 번에 잡히므로 원료별 면적에 없다.
    // 합계에서 빠뜨리면 시나리오 비교가 실제보다 작게 나온다.
    return { rows: rows, srArea: res.totals.srArea || 0, totalArea: res.totals.area };
  }

  // A 대비 B 의 차이. A 가 0 이면 비율은 낼 수 없으므로 null 로 둔다.
  function diff(a, b) {
    const d = b - a;
    return { a: a, b: b, delta: d, pct: (a > 0) ? (d / a * 100) : null };
  }

  function compareScenarios(sa, sb) {
    const A = scenarioSummary(sa), B = scenarioSummary(sb);
    const keys = [];
    A.rows.forEach(function (r) { if (keys.indexOf(r.key) < 0) keys.push(r.key); });
    B.rows.forEach(function (r) { if (keys.indexOf(r.key) < 0) keys.push(r.key); });
    const byKey = function (S, k) {
      return S.rows.filter(function (r) { return r.key === k; })[0] || null;
    };
    const rows = keys.map(function (k) {
      const ra = byKey(A, k), rb = byKey(B, k);
      return {
        key: k,
        label: (ra || rb).label,
        typeA: ra ? ra.type : '-', typeB: rb ? rb.type : '-',
        area: diff(ra ? ra.area : 0, rb ? rb.area : 0),
        units: diff(ra ? ra.units : 0, rb ? rb.units : 0),
        unitLabel: (ra || rb).unitLabel
      };
    });
    return { rows: rows, total: diff(A.totalArea, B.totalArea) };
  }

  // ---------- 화면 ----------
  // 선택 상태(대상 원료·변수·A/B 슬롯)는 계산 입력이 아니라 화면 상태이므로
  // 저장소가 아니라 여기서 들고 있는다 (시나리오 저장 파일이 지저분해지지 않게).
  const view = { material: null, varKey: 'stockDays', idx: null, A: null, B: null };
  // 마지막으로 계산한 훑기 — 슬라이더가 재계산 없이 참조한다
  let last = null;

  function pctTag(p) {
    if (p === null) return '<span class="dim">—</span>';
    const cls = p > 0.5 ? 'up' : (p < -0.5 ? 'down' : 'flat');
    const sign = p > 0 ? '+' : '';
    return '<span class="delta ' + cls + '">' + sign + p.toFixed(1) + ' %</span>';
  }

  // 슬라이더가 가리키는 지점의 요약 — 앱이 이 조각만 갈아끼운다
  function readout(sw, idx) {
    const c = ctrls();
    const i = Math.max(0, Math.min(sw.points.length - 1, idx));
    const pt = sw.points[i];
    const bp = sw.points[sw.baseIndex];
    const d = function (now, was) {
      // 오픈야드는 기준 투자비가 0 이라 비율을 낼 수 없다 — 빈칸으로 두면
      // "· 투자비 · 전체 부지" 처럼 문장이 끊겨 보인다
      if (!(was > 0)) return '<span class="ro-d flat">—</span>';
      const pc = (now / was - 1) * 100;
      if (Math.abs(pc) < 0.05) return '<span class="ro-d flat">기준과 같음</span>';
      return '<span class="ro-d ' + (pc > 0 ? 'up' : 'down') + '">' +
        (pc > 0 ? '+' : '') + pc.toFixed(1) + ' %</span>';
    };
    return '<div class="ro-val">' + c.esc(fmtInput(sw, pt.input)) +
      (pt.isBase ? ' <span class="tag">기준</span>' : '') + '</div>' +
      '<div class="tiles">' +
      c.statTile({ label: '설비 수량', value: pt.units, unit: pt.unitLabel }) +
      c.statTile({ label: '해당 원료 면적', value: Math.round(pt.area), unit: 'm²' }) +
      c.statTile({ label: '투자비', value: Math.round(pt.cost), unit: '억원' }) +
      c.statTile({ label: '최종 적치가능', value: Math.round(pt.achieved * 10) / 10, unit: '일' }) +
      '</div>' +
      '<div class="ro-deltas">기준 대비 — 면적 ' + d(pt.area, bp.area) +
      ' · 투자비 ' + d(pt.cost, bp.cost) +
      ' · 전체 부지 ' + d(pt.totalArea, bp.totalArea) + '</div>';
  }

  function renderSensitivity(state, result) {
    const c = ctrls();
    const keys = Object.keys(result.materials);
    if (!keys.length) {
      return '<section class="card empty">검토 대상 원료가 없습니다. ' +
        '① 원료·용량 탭에서 원료를 켜 주세요.</section>';
    }
    if (!view.material || keys.indexOf(view.material) < 0) view.material = keys[0];

    const type = result.materials[view.material].type;
    const avail = varsFor(type);
    // 저장타입을 바꾸면 지금 고른 변수가 의미 없어질 수 있다 (Silo 인데 파일 수 등)
    if (avail.indexOf(view.varKey) < 0) { view.varKey = avail[0]; view.idx = null; }

    const matBtns = keys.map(function (k) {
      const m = result.materials[k].material;
      return '<button class="view-btn' + (k === view.material ? ' active' : '') +
        '" data-sens-mat="' + c.esc(k) + '">' + c.esc(m.label) + '</button>';
    }).join('');
    const varBtns = avail.map(function (v) {
      return '<button class="view-btn' + (v === view.varKey ? ' active' : '') +
        '" data-sens-var="' + v + '">' + c.esc(VARS[v].label) + '</button>';
    }).join('');

    const sw = sweep(state, view.material, view.varKey);
    last = sw;                                  // 슬라이더가 재계산 없이 쓴다
    const mLabel = result.materials[view.material].material.label;
    const idx = (view.idx === null || view.idx === undefined ||
                 view.idx >= sw.points.length) ? sw.baseIndex : view.idx;
    view.idx = idx;
    const jumps = steps(sw);

    // 계단 표 — 눈금이 30개가 넘으므로 전부 적으면 읽히지 않는다.
    // **설비 수량이 바뀌는 행과 기준·양 끝만** 남긴다. 그게 곧 의사결정 지점이다.
    const keep = {};
    keep[0] = true; keep[sw.points.length - 1] = true; keep[sw.baseIndex] = true;
    sw.points.forEach(function (pt, k) {
      if (k > 0 && pt.units !== sw.points[k - 1].units) keep[k] = true;
    });
    const rows = Object.keys(keep).map(Number).sort(function (a, b) { return a - b; })
      .map(function (k) {
        const pt = sw.points[k];
        const bp = sw.points[sw.baseIndex];
        const pct = bp.area > 0 ? (pt.area / bp.area - 1) * 100 : 0;
        const jump = (k > 0 && pt.units !== sw.points[k - 1].units);
        return '<tr' + (pt.isBase ? ' class="base-row"' : '') + '>' +
          '<td>' + c.esc(fmtInput(sw, pt.input)) +
          (pt.isBase ? ' <span class="tag">기준</span>' : '') +
          (jump ? ' <span class="tag tag-step">여기서 증설</span>' : '') + '</td>' +
          '<td class="n">' + pt.units + ' ' + pt.unitLabel + '</td>' +
          '<td class="n">' + fmt(pt.area) + '</td>' +
          '<td class="n">' + pctTag(pt.isBase ? 0 : pct) + '</td>' +
          '<td class="n">' + fmt(pt.cost) + '</td>' +
          '<td class="n">' + fmt(pt.achieved) + '</td>' +
          '<td class="n">' + fmt(pt.totalArea) + '</td></tr>';
      }).join('');

    return '<div class="panel"><h3>민감도 분석</h3>' +
      '<p class="dim">저장설비 규모를 정하는 인자를 하나만 흔들어 봅니다. ' +
      '<b>슬라이더를 좌우로 끌면</b> 그래프의 점이 따라 움직이며 ' +
      '그 조건의 설비 수량·면적·투자비가 바로 나옵니다.</p>' +
      '<p class="dim">면적은 열 수·기수가 정수로 올림되므로 <b>계단형</b>으로 뜁니다. ' +
      '그래프의 음영 구간이 “같은 설비 구성으로 버티는 범위”이고, ' +
      '음영이 바뀌는 자리가 곧 <b>한 열이 더 필요해지는 경계</b>입니다.</p>' +
      '<div class="view-btns">' + matBtns + '</div>' +
      '<div class="view-btns">' + varBtns + '</div></div>' +

      '<section class="card"><h3>' + c.esc(mLabel + ' · ' + sw.label) + '</h3>' +
      '<div class="sens-slider">' +
      '<input type="range" data-sens-slider min="0" max="' + (sw.points.length - 1) +
      '" step="1" value="' + idx + '" aria-label="' + c.esc(sw.label) + '">' +
      '<div class="sens-ends"><span>' + c.esc(fmtInput(sw, sw.points[0].input)) + '</span>' +
      '<span>' + c.esc(fmtInput(sw, sw.points[sw.points.length - 1].input)) + '</span></div>' +
      '</div>' +
      '<div id="sens-readout" class="sens-readout">' + readout(sw, idx) + '</div>' +
      (jumps.length
        ? c.warnBox(jumps.map(function (j) {
            return fmtInput(sw, j.input) + ' 에서 ' + j.units + ' ' + j.unitLabel +
              ' 로 늘어납니다 (면적 ' + fmt(j.area) + ' m²)';
          }))
        : '<p class="dim">이 범위에서는 설비 수량이 변하지 않습니다.</p>') +
      '<div class="dwg-wrap">' + chart(sw, mLabel, 'area', idx) + '</div>' +
      '<div class="dwg-wrap">' + chart(sw, mLabel, 'cost', idx) + '</div>' +
      '<table class="sheet-table"><thead><tr>' +
      '<th>' + c.esc(sw.label) + '</th><th class="n">설비 수량</th>' +
      '<th class="n">해당 원료 면적 (m²)</th><th class="n">기준 대비</th>' +
      '<th class="n">투자비 (억원)</th><th class="n">적치가능 (일)</th>' +
      '<th class="n">전체 면적 (m²)</th></tr></thead><tbody>' + rows +
      '</tbody></table></section>' +

      renderScenario(state);
  }

  // 슬라이더 조작 — 전체를 다시 그리지 않고 마커와 요약만 갈아끼운다.
  // 매 틱마다 재계산·재렌더하면 끌 때마다 화면이 튀고 3D 까지 다시 붙는다.
  function applySlider(idx) {
    if (!last || typeof document === 'undefined') return;
    const i = Math.max(0, Math.min(last.points.length - 1, Number(idx)));
    view.idx = i;
    const mk = markerAt(last, i);
    ['area', 'cost'].forEach(function (k) {
      const dot = document.getElementById('sens-mark-' + k);
      const line = document.getElementById('sens-markline-' + k);
      if (dot) { dot.setAttribute('cx', mk[k].x); dot.setAttribute('cy', mk[k].y); }
      if (line) { line.setAttribute('x1', mk[k].x); line.setAttribute('x2', mk[k].x); }
    });
    const box = document.getElementById('sens-readout');
    if (box) box.innerHTML = readout(last, i);
  }

  function slotCard(name, snap) {
    const c = ctrls();
    if (!snap) {
      return '<div class="slot empty-slot"><h4>' + name + '</h4>' +
        '<p class="dim">비어 있음</p>' +
        '<button class="view-btn" data-snap="' + name + '">현재 상태를 ' + name + '에 담기</button></div>';
    }
    const S = scenarioSummary(snap.state);
    return '<div class="slot"><h4>' + name + ' <span class="dim">' + c.esc(snap.at) + '</span></h4>' +
      '<div class="tiles">' +
      c.statTile({ label: '총 점유면적', value: S.totalArea, unit: 'm²' }) +
      '</div><ul class="slot-list">' +
      S.rows.map(function (r) {
        return '<li>' + c.esc(r.label) + ' · ' + c.esc(r.type) + ' · ' +
          r.units + r.unitLabel + ' · ' + fmt(r.area) + ' m²</li>';
      }).join('') +
      '</ul><button class="view-btn" data-snap="' + name + '">현재 상태로 덮어쓰기</button>' +
      '<button class="view-btn" data-restore="' + name + '">이 시나리오로 되돌리기</button></div>';
  }

  function renderScenario(state) {
    const c = ctrls();
    let cmp = '';
    if (view.A && view.B) {
      const d = compareScenarios(view.A.state, view.B.state);
      cmp = '<table class="sheet-table"><thead><tr><th>원료</th>' +
        '<th>A 타입</th><th>B 타입</th>' +
        '<th class="n">A 면적</th><th class="n">B 면적</th>' +
        '<th class="n">차이</th><th class="n">증감</th></tr></thead><tbody>' +
        d.rows.map(function (r) {
          return '<tr><td>' + c.esc(r.label) + '</td>' +
            '<td>' + c.esc(r.typeA) + '</td><td>' + c.esc(r.typeB) + '</td>' +
            '<td class="n">' + fmt(r.area.a) + '</td>' +
            '<td class="n">' + fmt(r.area.b) + '</td>' +
            '<td class="n">' + (r.area.delta >= 0 ? '+' : '') + fmt(r.area.delta) + '</td>' +
            '<td class="n">' + pctTag(r.area.pct) + '</td></tr>';
        }).join('') +
        '<tr class="total-row"><td colspan="3">합계</td>' +
        '<td class="n">' + fmt(d.total.a) + '</td>' +
        '<td class="n">' + fmt(d.total.b) + '</td>' +
        '<td class="n">' + (d.total.delta >= 0 ? '+' : '') + fmt(d.total.delta) + '</td>' +
        '<td class="n">' + pctTag(d.total.pct) + '</td></tr>' +
        '</tbody></table>';
    } else {
      cmp = '<p class="dim">A·B 두 칸을 모두 채우면 비교표가 나타납니다.</p>';
    }

    return '<section class="card"><h3>시나리오 A / B 비교</h3>' +
      '<p class="dim">지금 입력값을 A 또는 B 칸에 담아두고, 조건을 바꾼 뒤 다른 칸에 담아 나란히 봅니다. ' +
      '비교할 때마다 다시 계산하므로 계산식이 바뀌어도 옛 숫자가 남지 않습니다.</p>' +
      '<div class="slots">' + slotCard('A', view.A) + slotCard('B', view.B) + '</div>' +
      cmp + '</section>';
  }

  // 화면에서 누른 버튼 처리 — 다시 그릴 필요가 있으면 true 를 돌려준다
  function handleClick(target, state) {
    const m = target.closest('[data-sens-mat]');
    if (m) { view.material = m.getAttribute('data-sens-mat'); view.idx = null; return true; }
    const v = target.closest('[data-sens-var]');
    if (v) { view.varKey = v.getAttribute('data-sens-var'); view.idx = null; return true; }
    const s = target.closest('[data-snap]');
    if (s) {
      const slot = s.getAttribute('data-snap');
      view[slot] = { state: deepCopy(state), at: new Date().toLocaleString('ko-KR') };
      return true;
    }
    return false;
  }

  // '되돌리기' 는 상태를 갈아끼우므로 앱이 직접 처리해야 한다
  function restoreTarget(target) {
    const r = target.closest('[data-restore]');
    if (!r) return null;
    const slot = view[r.getAttribute('data-restore')];
    return slot ? deepCopy(slot.state) : null;
  }

  const api = {
    VARS: VARS, sweep: sweep, steps: steps, chart: chart,
    varsFor: varsFor, markerAt: markerAt, applySlider: applySlider, readout: readout,
    renderSensitivity: renderSensitivity, handleClick: handleClick,
    restoreTarget: restoreTarget, view: view,
    scenarioSummary: scenarioSummary, compareScenarios: compareScenarios, diff: diff,
    unitsOf: unitsOf, unitLabelOf: unitLabelOf, CW: CW, FS: FS
  };
  global.RSD = global.RSD || {};
  global.RSD.sensitivity = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
