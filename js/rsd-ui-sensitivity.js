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
  function ctrls()   { return req ? require('./rsd-ui-controls.js') : global.RSD.controls; }

  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function fmt(n) { return Math.round(n).toLocaleString('ko-KR'); }

  // 흔들 수 있는 변수 — 경로와 표시 규칙을 한 곳에 모은다
  const VARS = {
    stockDays: {
      label: '목표 재고일수',
      unit: '일',
      // 원료별 값이므로 경로에 원료 키가 들어간다
      path: function (key) { return 'materials.' + key + '.stockDays'; },
      steps: [0.6, 0.8, 0.9, 1.0, 1.1, 1.2, 1.4],
      mode: 'ratio'
    },
    annualUsage: {
      label: '연간 사용량',
      unit: 't/년',
      path: function (key) { return 'materials.' + key + '.annualUsage'; },
      steps: [0.8, 0.9, 1.0, 1.1, 1.2, 1.3],
      mode: 'ratio'
    },
    operatingEff: {
      label: '운영효율',
      unit: '-',
      // 저장타입의 설정이므로 원료가 아니라 타입 경로를 쓴다
      path: function (key, state) { return state.materials[key].storageType + '.operatingEff'; },
      steps: [0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.90],
      mode: 'absolute'
    }
  };

  // 한 변수만 흔들어 면적을 훑는다. 순수 함수 — 원본 상태를 건드리지 않는다.
  function sweep(state, materialKey, varKey) {
    const app = appMod();
    const v = VARS[varKey];
    if (!v) return null;
    const path = v.path(materialKey, state);
    const base = app.getPath(state, path);
    const points = v.steps.map(function (step) {
      const s = deepCopy(state);
      const val = (v.mode === 'ratio') ? base * step : step;
      app.setPath(s, path, val);
      const res = app.recompute(s);
      const e = res.materials[materialKey];
      return {
        input: val,
        step: step,
        isBase: Math.abs(val - base) < 1e-9,
        area: e ? e.area : 0,
        totalArea: res.totals.area,
        // 계단이 어디서 생기는지 — 열 수(야드) / 기수(Silo) / 셀 수(Shed)
        units: e ? unitsOf(e) : 0,
        unitLabel: e ? unitLabelOf(e) : ''
      };
    });
    return { varKey: varKey, label: v.label, unit: v.unit, base: base, points: points };
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

  function chart(sw, materialLabel) {
    const pts = sw.points;
    if (!pts.length) return '';
    const areas = pts.map(function (p) { return p.area; });
    const maxA = Math.max.apply(null, areas) * 1.08 || 1;
    const minA = 0;
    const x = function (i) { return PAD.l + (CW - PAD.l - PAD.r) * (i / Math.max(1, pts.length - 1)); };
    const y = function (a) { return PAD.t + (CH - PAD.t - PAD.b) * (1 - (a - minA) / (maxA - minA)); };

    const p = [];
    // 격자 + 세로축 눈금
    for (let g = 0; g <= 4; g++) {
      const a = maxA * g / 4, gy = y(a);
      p.push('<line class="ch-grid" x1="' + r2(PAD.l) + '" y1="' + r2(gy) +
        '" x2="' + r2(CW - PAD.r) + '" y2="' + r2(gy) + '"/>');
      // 0 눈금 글씨는 생략 — 바로 아래 가로축 라벨과 겹친다 (바닥이 0인 건 자명하다)
      if (g === 0) continue;
      p.push('<text class="ch-ax" x="' + r2(PAD.l - FS * 0.5) + '" y="' + r2(gy) +
        '" font-size="' + r2(FS) + '" text-anchor="end">' + fmt(a) + '</text>');
    }
    // 꺾은선
    p.push('<polyline class="ch-line" points="' +
      pts.map(function (pt, i) { return r2(x(i)) + ',' + r2(y(pt.area)); }).join(' ') + '"/>');
    // 점 · 가로축 · 설비 수량
    pts.forEach(function (pt, i) {
      p.push('<circle class="ch-dot' + (pt.isBase ? ' base' : '') + '" cx="' + r2(x(i)) +
        '" cy="' + r2(y(pt.area)) + '" r="' + r2(FS * (pt.isBase ? 0.42 : 0.28)) + '"/>');
      // 양 끝 점의 라벨은 가운데 정렬하면 그래프 밖(세로축 눈금 자리)으로 삐져나간다
      const anc = (i === 0) ? 'start' : (i === pts.length - 1 ? 'end' : 'middle');
      p.push('<text class="ch-ax" x="' + r2(x(i)) + '" y="' + r2(CH - PAD.b + FS * 1.3) +
        '" font-size="' + r2(FS) + '" text-anchor="' + anc + '">' +
        esc(fmtInput(sw, pt.input)) + '</text>');
      // 설비 수량은 **바뀌는 지점에만** 적는다. 점마다 붙이면 라벨끼리 겹치고,
      // 정작 보여줘야 할 "여기서 한 열이 더 필요해진다"가 묻힌다.
      if (i === 0 || pt.units !== pts[i - 1].units) {
        p.push('<text class="ch-unit" x="' + r2(x(i)) + '" y="' + r2(y(pt.area) - FS * 1.0) +
          '" font-size="' + r2(FS) + '" text-anchor="' + anc + '">' +
          pt.units + pt.unitLabel + '</text>');
      }
    });
    // 기준선
    const bi = pts.findIndex(function (pt) { return pt.isBase; });
    if (bi >= 0) {
      p.push('<line class="ch-base" x1="' + r2(x(bi)) + '" y1="' + r2(PAD.t) +
        '" x2="' + r2(x(bi)) + '" y2="' + r2(CH - PAD.b) + '"/>');
    }
    p.push('<text class="ch-title" x="' + r2(PAD.l) + '" y="' + r2(FS * 1.2) +
      '" font-size="' + r2(FS) + '" text-anchor="start">' +
      esc(materialLabel + ' · ' + sw.label + ' 변화에 따른 점유면적 (m²)') + '</text>');

    return '<svg class="dwg chart" viewBox="0 0 ' + CW + ' ' + CH +
      '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
      p.join('') + '</svg>';
  }

  function fmtInput(sw, v) {
    if (sw.varKey === 'operatingEff') return Math.round(v * 100) + '%';
    if (sw.varKey === 'annualUsage') return (v / 10000).toFixed(0) + '만';
    return String(Math.round(v));
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
  const view = { material: null, varKey: 'stockDays', A: null, B: null };

  function pctTag(p) {
    if (p === null) return '<span class="dim">—</span>';
    const cls = p > 0.5 ? 'up' : (p < -0.5 ? 'down' : 'flat');
    const sign = p > 0 ? '+' : '';
    return '<span class="delta ' + cls + '">' + sign + p.toFixed(1) + ' %</span>';
  }

  function renderSensitivity(state, result) {
    const c = ctrls();
    const keys = Object.keys(result.materials);
    if (!keys.length) {
      return '<section class="card empty">검토 대상 원료가 없습니다. ' +
        '① 원료·용량 탭에서 원료를 켜 주세요.</section>';
    }
    if (!view.material || keys.indexOf(view.material) < 0) view.material = keys[0];

    const matBtns = keys.map(function (k) {
      const m = result.materials[k].material;
      return '<button class="view-btn' + (k === view.material ? ' active' : '') +
        '" data-sens-mat="' + c.esc(k) + '">' + c.esc(m.label) + '</button>';
    }).join('');
    const varBtns = Object.keys(VARS).map(function (v) {
      return '<button class="view-btn' + (v === view.varKey ? ' active' : '') +
        '" data-sens-var="' + v + '">' + c.esc(VARS[v].label) + '</button>';
    }).join('');

    const sw = sweep(state, view.material, view.varKey);
    const mLabel = result.materials[view.material].material.label;
    const jumps = steps(sw);

    const rows = sw.points.map(function (p) {
      const baseArea = (sw.points.filter(function (q) { return q.isBase; })[0] || sw.points[0]).area;
      const pct = baseArea > 0 ? (p.area / baseArea - 1) * 100 : 0;
      return '<tr' + (p.isBase ? ' class="base-row"' : '') + '>' +
        '<td>' + c.esc(fmtInput(sw, p.input)) + (p.isBase ? ' <span class="tag">기준</span>' : '') + '</td>' +
        '<td class="n">' + p.units + ' ' + p.unitLabel + '</td>' +
        '<td class="n">' + fmt(p.area) + '</td>' +
        '<td class="n">' + pctTag(p.isBase ? 0 : pct) + '</td>' +
        '<td class="n">' + fmt(p.totalArea) + '</td></tr>';
    }).join('');

    return '<div class="panel"><h3>민감도 분석</h3>' +
      '<p class="dim">한 변수만 흔들었을 때 소요 면적이 어떻게 움직이는지 봅니다. ' +
      '면적은 열 수·기수가 정수로 올림되므로 <b>계단형</b>으로 뜁니다 — ' +
      '그 계단이 곧 “여기서 한 열이 더 필요해지는” 경계입니다.</p>' +
      '<div class="view-btns">' + matBtns + '</div>' +
      '<div class="view-btns">' + varBtns + '</div></div>' +

      '<section class="card"><h3>' + c.esc(mLabel + ' · ' + sw.label) + '</h3>' +
      (jumps.length
        ? c.warnBox(jumps.map(function (j) {
            return fmtInput(sw, j.input) + ' 에서 ' + j.units + ' ' + j.unitLabel +
              ' 로 늘어납니다 (면적 ' + fmt(j.area) + ' m²)';
          }))
        : '<p class="dim">이 범위에서는 설비 수량이 변하지 않습니다.</p>') +
      '<div class="dwg-wrap">' + chart(sw, mLabel) + '</div>' +
      '<table class="sheet-table"><thead><tr>' +
      '<th>' + c.esc(sw.label) + '</th><th class="n">설비 수량</th>' +
      '<th class="n">해당 원료 면적 (m²)</th><th class="n">기준 대비</th>' +
      '<th class="n">전체 면적 (m²)</th></tr></thead><tbody>' + rows +
      '</tbody></table></section>' +

      renderScenario(state);
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
    if (m) { view.material = m.getAttribute('data-sens-mat'); return true; }
    const v = target.closest('[data-sens-var]');
    if (v) { view.varKey = v.getAttribute('data-sens-var'); return true; }
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
    renderSensitivity: renderSensitivity, handleClick: handleClick,
    restoreTarget: restoreTarget, view: view,
    scenarioSummary: scenarioSummary, compareScenarios: compareScenarios, diff: diff,
    unitsOf: unitsOf, unitLabelOf: unitLabelOf, CW: CW, FS: FS
  };
  global.RSD = global.RSD || {};
  global.RSD.sensitivity = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
