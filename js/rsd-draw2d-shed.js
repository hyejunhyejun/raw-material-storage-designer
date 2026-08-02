(function (global) {
  // Shed 단면·평면 도면
  //
  // 단면은 P1 엔진의 computeSection 결과를 그대로 받아 ①②③ 영역을 색으로 나눈다.
  //   ① 개방측 삼각형  = ½ · La · h1
  //   ② 옹벽측 사다리꼴 = Lb · (h1 + 옹벽측높이) / 2
  //   ③ 하부 쐐기      = ½ · (La+Lb) · h3
  // 세 영역이 맞물려야 총 단면적이 나오므로, 도면도 같은 좌표에서 만들어야
  // 숫자와 그림이 어긋나지 않는다.

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return ESC[ch]; }); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function dim(v) { return (v % 1 === 0) ? String(v) : v.toFixed(1); }
  function fmt(n) { return Math.round(n).toLocaleString('ko-KR'); }
  // 글자 폭 어림 — 한글 ≈ 1.0em, 그 외 ≈ 0.55em (em 단위)
  function textUnits(t) {
    let x = 0;
    for (const ch of String(t)) x += (/[가-힣]/.test(ch) ? 1.0 : 0.55);
    return x;
  }
  function tan(deg) { return Math.tan(deg * Math.PI / 180); }
  // 글씨 크기 — 화면상 크기는 `fs ÷ viewBox 폭` 이 결정하므로,
  // 여백 단위 합(marginUnits)을 빼서 viewBox 폭의 1/46 이 되게 잡는다.
  // (rsd-draw2d.js 의 fsFor 와 같은 규칙 — 전 도면 글씨 크기가 여기서 맞춰진다)
  const FS_RATIO = 46;
  function fsFor(contentWidth, marginUnits) {
    const d = FS_RATIO - (marginUnits || 0);
    return contentWidth / (d > 4 ? d : 4);
  }


  function shade(hex, pct) {
    const n = parseInt(String(hex).slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = pct / 100;
    if (f > 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    else { r *= (1 + f); g *= (1 + f); b *= (1 + f); }
    const h = function (v) {
      const s = Math.round(Math.max(0, Math.min(255, v))).toString(16);
      return s.length < 2 ? '0' + s : s;
    };
    return '#' + h(r) + h(g) + h(b);
  }

  // ---------- 치수선 (P2 와 동일 원칙: 도형 바깥 + 화살표) ----------
  function arrowH(x, y, a, d) {
    const t = a * 0.34;
    return '<polygon class="dim-arrow" points="' + r2(x) + ',' + r2(y) + ' ' +
      r2(x - d * a) + ',' + r2(y - t) + ' ' + r2(x - d * a) + ',' + r2(y + t) + '"/>';
  }
  function arrowV(x, y, a, d) {
    const t = a * 0.34;
    return '<polygon class="dim-arrow" points="' + r2(x) + ',' + r2(y) + ' ' +
      r2(x - t) + ',' + r2(y - d * a) + ' ' + r2(x + t) + ',' + r2(y - d * a) + '"/>';
  }
  function hDim(x1, x2, y, label, fs) {
    const a = fs * 0.55;
    return '<g class="dim">' +
      '<line class="dim-line" x1="' + r2(x1) + '" y1="' + r2(y) + '" x2="' + r2(x2) + '" y2="' + r2(y) + '"/>' +
      arrowH(x1, y, a, -1) + arrowH(x2, y, a, 1) +
      '<text class="dim-text" x="' + r2((x1 + x2) / 2) + '" y="' + r2(y - fs * 0.45) +
      '" font-size="' + r2(fs) + '" text-anchor="middle">' + esc(label) + '</text></g>';
  }
  function vDim(y1, y2, x, label, fs) {
    const a = fs * 0.55, mid = (y1 + y2) / 2;
    return '<g class="dim">' +
      '<line class="dim-line" x1="' + r2(x) + '" y1="' + r2(y1) + '" x2="' + r2(x) + '" y2="' + r2(y2) + '"/>' +
      arrowV(x, y1, a, -1) + arrowV(x, y2, a, 1) +
      '<text class="dim-text" x="' + r2(x - fs * 0.45) + '" y="' + r2(mid) +
      '" font-size="' + r2(fs) + '" text-anchor="middle"' +
      ' transform="rotate(-90 ' + r2(x - fs * 0.45) + ' ' + r2(mid) + ')">' +
      esc(label) + '</text></g>';
  }

  // 지시선 — 도면의 한 점을 찍고 라벨을 여백으로 뺀다
  function lead(px, py, tx, ty, label, fa, anchor) {
    const a = anchor || 'start';
    const el = tx + (a === 'end' ? fa * 0.5 : -fa * 0.5);
    return '<g class="part-note">' +
      '<polyline points="' + r2(px) + ',' + r2(py) + ' ' + r2(el) + ',' + r2(ty) + ' ' +
      r2(tx) + ',' + r2(ty) + '"/>' +
      '<circle cx="' + r2(px) + '" cy="' + r2(py) + '" r="' + r2(fa * 0.16) + '"/>' +
      '<text x="' + r2(tx + (a === 'end' ? -fa * 0.3 : fa * 0.3)) + '" y="' + r2(ty) +
      '" font-size="' + r2(fa) + '" text-anchor="' + a + '">' + esc(label) + '</text></g>';
  }

  // 흐름 화살표 — 원료가 어디로 가는지 (적치 / 불출)
  function flow(x1, y1, x2, y2, fa) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len, uy = dy / len, a = fa * 0.9, t = a * 0.36;
    return '<g class="flow">' +
      '<line x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2 - ux * a) + '" y2="' + r2(y2 - uy * a) + '"/>' +
      '<polygon points="' + r2(x2) + ',' + r2(y2) + ' ' +
      r2(x2 - ux * a + uy * t) + ',' + r2(y2 - uy * a - ux * t) + ' ' +
      r2(x2 - ux * a - uy * t) + ',' + r2(y2 - uy * a + ux * t) + '"/></g>';
  }

  // 각도 호 — 꼭짓점에서 시작각→끝각까지 (도 단위, 화면좌표는 y 아래가 +)
  function angArc(cx, cy, rad, a0, a1, label, fa, lx, ly) {
    const p = [];
    for (let i = 0; i <= 12; i++) {
      const a = (a0 + (a1 - a0) * (i / 12)) * Math.PI / 180;
      p.push(r2(cx + rad * Math.cos(a)) + ',' + r2(cy + rad * Math.sin(a)));
    }
    return '<g class="ang-g"><polyline class="ang-arc" points="' + p.join(' ') + '"/>' +
      '<text x="' + r2(lx) + '" y="' + r2(ly) + '" font-size="' + r2(fa) +
      '" text-anchor="middle">' + esc(label) + '</text></g>';
  }

  // ---------- 단면도 ----------
  //
  // 처음 보는 사람이 읽을 수 있어야 하므로, 면적 ①②③ 뿐 아니라
  // 부재명(지붕·외벽·중앙 옹벽) · 각도(안식각·하부 경사각) ·
  // 원료 흐름(적치/불출) · 범례를 모두 도면 위에 올린다.
  function drawShedSection(o) {
    const bays = Math.max(1, o.bays);
    const bayW = o.centerWall / 2 + o.slopeClear + o.Lb + o.La + o.openClear;
    const totalW = bayW * bays;
    const H = o.totalHeight;
    const wallH = H * 0.49;                    // 벽체 상단 (도면 GL+29,500)
    // 범례 글자 폭이 여백에 들어가므로 fs 보다 먼저 확정해야 한다.
    // 폭은 fs 배수(문자단위)로 재고, 한글 ≈ 1.0em · 그 외 ≈ 0.55em 로 어림한다.
    const legendRows = o.section ? [
      ['①', '개방측 삼각형', o.section.A1.value.toFixed(2), 0],
      ['②', '옹벽측 사다리꼴', o.section.A2.value.toFixed(2), 0],
      ['③', '하부 쐐기', o.section.A3.value.toFixed(2), 0]
    ] : [];
    function textUnits(t) {
      let x = 0;
      for (const ch of t) x += (/[가-힣]/.test(ch) ? 1.0 : 0.55);
      return x;
    }
    // 주기 글씨 fa = 0.8·fs 이므로 fs 단위 폭은 ×0.8
    const legUnits = legendRows.reduce(function (w, row) {
      return Math.max(w, textUnits(row[0] + ' ' + row[1] + '  ' + row[2] + ' m²') * 0.8);
    }, 14 * 0.8) + 1.6 + 1.4 * 0.8;

    // 글씨는 두 가지만 쓴다 — 치수 fs, 주기 fa.
    // 여백(왼쪽 4.0 + 범례 시작 6.2 + 범례 폭 + 오른쪽 1)까지 빼야
    // viewBox 폭 기준 1/46 이 되어 다른 도면과 화면상 크기가 맞는다.
    const fs = fsFor(totalW, 4.0 + 6.2 + legUnits + 1);
    const fa = fs * 0.8;

    const h1 = o.La * tan(o.repose);
    const wallHeight = h1 - o.Lb * tan(o.repose);
    const h3 = (o.La + o.Lb) * tan(o.bottomSlope);

    // 좌표: x = 중앙 옹벽 중심 기준, y = 지붕 정상(0) → 지반(H)
    const gl = H;
    const base = o.color || '#6E6E73';
    const c1 = shade(base, 8), c2 = shade(base, 30), c3 = shade(base, -22);

    const parts = [];

    // 1 bay 면 중앙 옹벽 중심에서 끝난다 (옹벽 반쪽은 이미 bayW 에 들어 있다)
    const left = bays === 1 ? -bayW : -totalW / 2;
    const right = bays === 1 ? 0 : totalW / 2;

    // 지반 해칭 — 바닥이 GL 아래로 파여 있음을 보이려면 지반이 있어야 한다
    const uid = 'sh' + Math.abs(Math.round(totalW * 13 + H * 7)).toString(36);
    parts.push('<defs><pattern id="gr-' + uid + '" width="' + r2(fs * 0.7) + '" height="' + r2(fs * 0.7) +
      '" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<line class="hatch" x1="0" y1="0" x2="0" y2="' + r2(fs * 0.7) + '"/></pattern></defs>');
    parts.push('<rect class="subgrade" x="' + r2(left - fs * 2) + '" y="' + r2(gl + h3) +
      '" width="' + r2(right - left + fs * 4) + '" height="' + r2(fs * 1.6) +
      '" fill="url(#gr-' + uid + ')"/>');

    // 지반선 (GL)
    parts.push('<line class="ground" x1="' + r2(left - fs * 2) + '" y1="' + r2(gl) +
      '" x2="' + r2(right + fs * 2) + '" y2="' + r2(gl) + '"/>');
    parts.push('<text class="gl-tag" x="' + r2(left - fs * 3.6) + '" y="' + r2(gl - fa * 0.5) +
      '" font-size="' + r2(fa) + '" text-anchor="start">GL ±0</text>');

    // 건물 외곽 (PEB 벽체 + 박공지붕)
    parts.push('<path class="shed-roof" d="M ' + r2(left) + ' ' + r2(gl - wallH) +
      ' L 0 0 L ' + r2(right) + ' ' + r2(gl - wallH) + '"/>');
    parts.push('<line class="shed-wall" x1="' + r2(left) + '" y1="' + r2(gl - wallH) +
      '" x2="' + r2(left) + '" y2="' + r2(gl) + '"/>');
    parts.push('<line class="shed-wall" x1="' + r2(right) + '" y1="' + r2(gl - wallH) +
      '" x2="' + r2(right) + '" y2="' + r2(gl) + '"/>');
    // 부재명 — 처음 보는 사람은 "이 선이 뭐냐"부터 막힌다
    parts.push(lead(left * 0.5, (gl - wallH) / 2, left - fs * 1.2, -fs * 1.4, 'PEB 박공지붕', fa, 'start'));
    parts.push(lead(left, gl - wallH * 0.55, left - fs * 1.0, gl - wallH - fs * 1.2, '외벽', fa, 'end'));

    // bay 별 원료 단면 — 중앙 옹벽 기준 좌우 대칭
    const sides = (bays === 1) ? [-1] : [-1, 1];
    sides.forEach(function (s) {
      const x1 = s * (o.centerWall / 2 + o.slopeClear);          // 옹벽면
      const x2 = x1 + s * o.Lb;                                   // 능선
      const x3 = x2 + s * o.La;                                   // 개방측 끝

      // ③ 하부 쐐기 — 옹벽쪽이 깊고 개방측으로 얕아진다
      parts.push('<polygon class="shed-a3" fill="' + c3 + '" points="' +
        r2(x1) + ',' + r2(gl) + ' ' +
        r2(x1) + ',' + r2(gl + h3) + ' ' +
        r2(x3) + ',' + r2(gl) + '"/>');

      // ② 옹벽측 사다리꼴
      parts.push('<polygon class="shed-a2" fill="' + c2 + '" points="' +
        r2(x1) + ',' + r2(gl) + ' ' +
        r2(x1) + ',' + r2(gl - wallHeight) + ' ' +
        r2(x2) + ',' + r2(gl - h1) + ' ' +
        r2(x2) + ',' + r2(gl) + '"/>');

      // ① 개방측 삼각형
      parts.push('<polygon class="shed-a1" fill="' + c1 + '" points="' +
        r2(x2) + ',' + r2(gl) + ' ' +
        r2(x2) + ',' + r2(gl - h1) + ' ' +
        r2(x3) + ',' + r2(gl) + '"/>');

      // 능선 — 원료 더미의 마루선. 여기가 최고점임을 눈으로 알 수 있게 한다
      parts.push('<line class="ore-crest" x1="' + r2(x2) + '" y1="' + r2(gl - h1) +
        '" x2="' + r2(x2) + '" y2="' + r2(gl) + '" stroke="' + shade(base, 46) + '"/>');

      // 영역 안에는 기호만 찍는다 — 면적 수치는 오른쪽 범례가 들고 있다.
      // (Lb 10.5 m 같은 좁은 영역에 긴 숫자를 넣으면 치수선·이웃 라벨과 겹친다)
      parts.push('<text class="area-tag" x="' + r2(x2 + s * o.La * 0.45) + '" y="' + r2(gl - h1 * 0.28) +
        '" font-size="' + r2(fa) + '" text-anchor="middle">①</text>');
      parts.push('<text class="area-tag" x="' + r2(x1 + s * o.Lb * 0.5) + '" y="' + r2(gl - h1 * 0.42) +
        '" font-size="' + r2(fa) + '" text-anchor="middle">②</text>');
      parts.push('<text class="area-tag" x="' + r2(x1 + s * (o.La + o.Lb) * 0.42) + '" y="' + r2(gl + h3 * 0.62) +
        '" font-size="' + r2(fa) + '" text-anchor="middle">③</text>');

      // 각도 — 개방측 끝 x3 이 안식각(위)과 하부 경사각(아래)의 공통 꼭짓점이다.
      // 두 각을 같은 자리에 그려야 "무엇이 어느 각인지" 헷갈리지 않는다.
      const rad = Math.min(o.La * 0.30, fs * 4);
      const dirIn = (s > 0) ? 180 : 0;              // 안쪽(능선쪽)을 향하는 방향
      parts.push(angArc(x3, gl, rad, dirIn, dirIn + s * o.repose, dim(o.repose) + '°',
        fa, x3 + s * rad * 0.55, gl - rad * 0.62));
      parts.push(angArc(x3, gl, rad * 0.72, dirIn, dirIn - s * o.bottomSlope,
        dim(o.bottomSlope) + '°', fa, x3 + s * rad * 0.52, gl + rad * 0.46));

      // La · Lb · 개방측 여유 — 입력값이 단면의 어느 구간인지 지붕 밑 여백에 표기

      // SPR — 반포털: 개방측은 지면 레일, 옹벽측은 옹벽 상부에 얹힌다.
      // 경사 스크레이퍼 붐이 원료 빗변을 긁어 하부 B/C 로 보낸다.
      const legX = x3 - s * o.La * 0.10;
      const topY = gl - h1 * 1.30;
      const bladeStr = [0.25, 0.5, 0.75].map(function (t) {
        const bx = x2 + (x3 - x2) * t, by = (gl - h1 + 2) + (h1 - 3) * t;
        return '<rect class="spr-blade" x="' + r2(bx - 1.4) + '" y="' + r2(by - 0.9) +
          '" width="2.8" height="1.8"/>';
      }).join('');
      parts.push('<g class="shed-spr">' +
        '<rect class="spr-leg" x="' + r2(Math.min(legX, legX + s * 2.4)) + '" y="' + r2(topY) +
        '" width="2.4" height="' + r2(gl - topY) + '"/>' +
        '<rect class="spr-leg" x="' + r2(Math.min(x1, legX)) + '" y="' + r2(topY) +
        '" width="' + r2(Math.abs(legX - x1)) + '" height="2.2"/>' +
        '<rect class="spr-leg" x="' + r2(Math.min(x1, x1 + s * 2.0)) + '" y="' + r2(topY) +
        '" width="2.0" height="' + r2(gl - h1 - topY + 4) + '"/>' +
        '<line class="spr-boom" x1="' + r2(x2) + '" y1="' + r2(gl - h1 + 2) +
        '" x2="' + r2(x3 - s * 2) + '" y2="' + r2(gl - 1) + '"/>' +
        bladeStr +
        '<rect class="spr-cab" x="' + r2(legX - (s > 0 ? 0 : 3.2)) + '" y="' + r2(topY - 4.2) +
        '" width="3.2" height="4.2"/>' +
        '</g>');
      parts.push('<rect class="shed-bc" x="' + r2(Math.min(x3 - s * 10, x3)) + '" y="' + r2(gl + 0.4) +
        '" width="10" height="2.6"/>');
      parts.push('<text class="bc-tag" x="' + r2(x3 - s * 5) + '" y="' + r2(gl + h3 * 0.5 + fs * 1.9) +
        '" font-size="' + r2(fa) + '" text-anchor="middle">불출 B/C</text>');

      // 불출 흐름 — SPR 이 빗면을 긁어 하부 B/C 로 떨군다
      parts.push(flow(x2 + (x3 - x2) * 0.55, gl - h1 * 0.42, x3 - s * 5, gl + 0.2, fa));
      parts.push('<text class="flow-tag" x="' + r2(x2 + (x3 - x2) * 0.74) + '" y="' + r2(gl - h1 * 0.62) +
        '" font-size="' + r2(fa) + '" text-anchor="middle">불출</text>');
    });

    // 중앙 옹벽 + 상부 Tripper
    const cwTop = gl - h1 - 5;
    parts.push('<rect class="shed-cwall" x="' + r2(-o.centerWall / 2) + '" y="' + r2(cwTop) +
      '" width="' + r2(o.centerWall) + '" height="' + r2(gl - cwTop) + '"/>');
    // Tripper — 중앙 옹벽 상부를 주행. 경사 벨트가 정점 풀리를 돌아 양쪽 후드로 떨군다.
    const tW = Math.max(8, o.Lb * 0.9), tH = fs * 2.4;
    parts.push('<g class="shed-tripper">' +
      '<rect class="tp-car" x="' + r2(-tW / 2) + '" y="' + r2(cwTop - 2.4) +
      '" width="' + r2(tW) + '" height="2.4"/>' +
      '<circle class="tp-wheel" cx="' + r2(-tW * 0.32) + '" cy="' + r2(cwTop) + '" r="1.3"/>' +
      '<circle class="tp-wheel" cx="' + r2(tW * 0.32) + '" cy="' + r2(cwTop) + '" r="1.3"/>' +
      '<polyline class="tp-belt" points="' +
      r2(-tW / 2) + ',' + r2(cwTop - 2.4) + ' 0,' + r2(cwTop - tH) + ' ' +
      r2(tW / 2) + ',' + r2(cwTop - 2.4) + '"/>' +
      '<circle class="tp-pulley" cx="0" cy="' + r2(cwTop - tH) + '" r="1.8"/>' +
      '<rect class="tp-house" x="-3.4" y="' + r2(cwTop - tH - 4.4) + '" width="6.8" height="4.4"/>' +
      '<polygon class="tp-hood" points="' +
      r2(-1.6) + ',' + r2(cwTop - tH + 2) + ' ' + r2(-4.6) + ',' + r2(cwTop - tH + 2) + ' ' +
      r2(-o.Lb * 0.42) + ',' + r2(cwTop + 5) + ' ' + r2(-o.Lb * 0.22) + ',' + r2(cwTop + 5) + '"/>' +
      '<polygon class="tp-hood" points="' +
      r2(1.6) + ',' + r2(cwTop - tH + 2) + ' ' + r2(4.6) + ',' + r2(cwTop - tH + 2) + ' ' +
      r2(o.Lb * 0.42) + ',' + r2(cwTop + 5) + ' ' + r2(o.Lb * 0.22) + ',' + r2(cwTop + 5) + '"/>' +
      '</g>');
    parts.push('<text class="bc-tag" x="0" y="' + r2(cwTop - tH - fs * 2.6) +
      '" font-size="' + r2(fa) + '" text-anchor="middle">Tripper (적치)</text>');
    // 라벨은 지붕 아래 빈 공간(원료 위)으로 — 개방측은 각도·설비가 이미 차 있다
    parts.push(lead(-o.centerWall / 2, gl - h1 * 0.5, left * 0.35, gl - h1 - fs * 2.6,
      '중앙 옹벽 ' + dim(o.centerWall) + ' m', fa, 'end'));

    // 적치 흐름 — Tripper 후드에서 양쪽 셀로 떨어진다
    sides.forEach(function (s) {
      parts.push(flow(s * o.Lb * 0.32, cwTop + 5, s * o.Lb * 0.9, gl - h1 * 0.86, fa));
    });
    parts.push('<text class="flow-tag" x="0" y="' + r2(cwTop + fs * 1.3) +
      '" font-size="' + r2(fa) + '" text-anchor="middle">적치</text>');

    // 치수 — 전부 도형 아래. La·Lb 같은 좁은 구간은 라벨이 서로를 침범하므로
    // 한 줄에 하나씩 쌓아 어느 구간을 재는지 헷갈리지 않게 한다.
    const sLast = sides[sides.length - 1];
    const dx1 = sLast * (o.centerWall / 2 + o.slopeClear);
    const dx2 = dx1 + sLast * o.Lb;
    const dx3 = dx2 + sLast * o.La;
    const step = fs * 1.7;
    let dyN = gl + h3 + fs * 2.6;
    parts.push(hDim(Math.min(dx1, dx2), Math.max(dx1, dx2), dyN, 'Lb 옹벽측 ' + dim(o.Lb) + ' m', fs));
    dyN += step;
    parts.push(hDim(Math.min(dx2, dx3), Math.max(dx2, dx3), dyN, 'La 개방측 ' + dim(o.La) + ' m', fs));
    dyN += step;
    parts.push(hDim(Math.min(dx3, sLast * bayW), Math.max(dx3, sLast * bayW), dyN,
      '개방측 여유 ' + dim(o.openClear) + ' m', fs));
    dyN += step;
    if (bays > 1) { parts.push(hDim(0, right, dyN, 'bay 폭 ' + dim(bayW) + ' m', fs)); dyN += step; }
    parts.push(hDim(left, right, dyN, '총 폭 ' + dim(totalW) + ' m', fs));
    const dy2 = dyN;
    // 개방측 여유 치수가 벽 바깥으로 라벨을 내밀므로 세로 치수는 그보다 더 바깥에 둔다
    parts.push(vDim(gl - h1, gl, right + fs * 3.0, '적치높이 h1 ' + dim(r2(h1)) + ' m', fs));
    parts.push(vDim(0, gl, right + fs * 4.8, '전고 ' + dim(H) + ' m', fs));

    // 범례 — ①②③ 이 무엇인지 도면 안에서 바로 읽히게 한다.
    // (도면 밖 본문을 찾아 읽게 만들면 처음 보는 사람은 그대로 막힌다)
    const lx = right + fs * 6.2;
    const swatches = [c1, c2, c3];
    const rowsTxt = legendRows.map(function (row, i) {
      return [row[0], row[1], row[2], swatches[i]];
    });
    let ly = fs * 1.6;
    parts.push('<text class="legend-h" x="' + r2(lx) + '" y="' + r2(ly) +
      '" font-size="' + r2(fa) + '" text-anchor="start">단면적 구성 (반쪽 셀 1면)</text>');
    rowsTxt.forEach(function (row) {
      ly += fs * 1.7;
      parts.push('<rect class="legend-sw" x="' + r2(lx) + '" y="' + r2(ly - fa * 0.7) +
        '" width="' + r2(fa * 0.9) + '" height="' + r2(fa * 0.9) + '" fill="' + row[3] + '"/>');
      parts.push('<text class="legend-t" x="' + r2(lx + fa * 1.4) + '" y="' + r2(ly) +
        '" font-size="' + r2(fa) + '" text-anchor="start">' +
        esc(row[0] + ' ' + row[1] + '  ' + row[2] + ' m²') + '</text>');
    });
    if (o.section) {
      ly += fs * 1.7;
      parts.push('<text class="legend-t" x="' + r2(lx) + '" y="' + r2(ly) +
        '" font-size="' + r2(fa) + '" text-anchor="start">' +
        esc('사면 각도: 안식각 ' + dim(o.repose) + '° · 하부 경사각 ' + dim(o.bottomSlope) + '°') +
        '</text>');
      ly += fs * 1.7;
      parts.push('<text class="legend-h" x="' + r2(lx) + '" y="' + r2(ly) +
        '" font-size="' + r2(fa) + '" text-anchor="start">합계 ' +
        o.section.sectionArea.value.toFixed(2) + ' m² · ' + fmt(o.section.tPerM.value) + ' t/m</text>');
    }

    const x0 = left - fs * 4.0, y0 = -fs * 3.0;
    const vw = (lx + legUnits * fs + fs) - x0;
    const vh = Math.max(dy2 + fs * 1.4, ly + fs * 1.4) - y0;
    return '<svg class="dwg dwg-shed-sec" viewBox="' + [x0, y0, vw, vh].map(r2).join(' ') +
      '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
      parts.join('') + '</svg>';
  }

  // ---------- 평면도 ----------
  function drawShedPlan(o) {
    const L = o.length, W = o.width;
    const fs = fsFor(L, 6.4);   // 여백 4.2 + 2.2
    const fa = fs * 0.8;                     // 주기용 — 단면도와 같은 규칙
    const base = o.color || '#6E6E73';
    const fill = shade(base, 22);
    const bays = Math.max(1, o.bays);
    const bayW = o.bayWidth;

    const parts = [];

    // 건물 외곽
    parts.push('<rect class="shed-outline" x="0" y="0" width="' + r2(L) + '" height="' + r2(W) + '"/>');

    // 정비존 (양 끝)
    [0, L - o.maintZone].forEach(function (x) {
      parts.push('<rect class="maint-zone" x="' + r2(x) + '" y="0" width="' +
        r2(o.maintZone) + '" height="' + r2(W) + '"/>');
    });
    parts.push('<text class="zone-tag" x="' + r2(o.maintZone / 2) + '" y="' + r2(W * 0.5) +
      '" font-size="' + r2(fa) + '" text-anchor="middle" transform="rotate(-90 ' +
      r2(o.maintZone / 2) + ' ' + r2(W * 0.5) + ')">정비 존</text>');

    // bay 별 셀
    const byBay = {};
    o.cells.forEach(function (c) {
      const b = c.bay - 1;
      if (!byBay[b]) byBay[b] = [];
      byBay[b].push(c);
    });

    // 격벽은 셀 양쪽에 모두 있다 — 셀 n 개면 격벽 n+1 개.
    // (엔진의 길이식 '격벽×(n−1) + 양단벽×2' 는 양단벽 두께가 격벽과 같을 때
    //  격벽 n+1 개와 정확히 같은 값이므로 계산과 도면이 어긋나지 않는다)
    for (let b = 0; b < bays; b++) {
      const list = byBay[b] || [];
      const y0 = b * bayW;
      let x = o.maintZone;
      list.forEach(function (c, i) {
        const len = c.length.value;
        // 셀 앞 격벽
        parts.push('<rect class="partition" x="' + r2(x) + '" y="' + r2(y0 + 1.5) +
          '" width="' + r2(o.wallThickness) + '" height="' + r2(bayW - 3) + '"/>');
        x += o.wallThickness;
        parts.push('<rect class="cell" fill="' + fill + '" x="' + r2(x) + '" y="' + r2(y0 + 1.5) +
          '" width="' + r2(len) + '" height="' + r2(bayW - 3) + '"/>');
        // 셀 번호 · 길이 · 용량.
        // 셀이 글씨보다 좁으면(직접 입력으로 5 m 짜리 셀도 나온다) 옆 셀 글씨와
        // 겹쳐 읽을 수 없게 된다 — 들어갈 것만 남긴다.
        const cx = x + len / 2, cy = y0 + bayW / 2;
        const capTxt = fmt(c.capacity.value) + ' t';
        const lenTxt = dim(len) + ' m';
        const fits = function (t) { return textUnits(t) * fa < len * 0.92; };
        const noTxt = String((b + 1) * 10 + i + 1);
        if (fits(noTxt)) {
          const two = fits(capTxt);
          parts.push('<text class="cell-no" x="' + r2(cx) + '" y="' + r2(cy - (two ? fa * 1.2 : 0)) +
            '" font-size="' + r2(fa) + '" text-anchor="middle">' + noTxt + '</text>');
          if (two) {
            parts.push('<text class="cell-cap" x="' + r2(cx) + '" y="' + r2(cy + fa * 0.2) +
              '" font-size="' + r2(fa) + '" text-anchor="middle">' + capTxt + '</text>');
          }
          if (fits(lenTxt)) {
            parts.push('<text class="cell-len" x="' + r2(cx) + '" y="' + r2(cy + fa * 1.6) +
              '" font-size="' + r2(fa) + '" text-anchor="middle">' + lenTxt + '</text>');
          }
        }
        x += len;
      });
      // 마지막 셀 뒤 격벽
      parts.push('<rect class="partition" x="' + r2(x) + '" y="' + r2(y0 + 1.5) +
        '" width="' + r2(o.wallThickness) + '" height="' + r2(bayW - 3) + '"/>');
    }

    // 중앙 갤러리 (B/C + Tripper 주행로) + Tripper 심볼
    if (bays > 1) {
      parts.push('<rect class="shed-gallery" x="0" y="' + r2(bayW - 2.5) +
        '" width="' + r2(L) + '" height="5"/>');
      parts.push('<line class="gallery-line" x1="0" y1="' + r2(bayW) +
        '" x2="' + r2(L) + '" y2="' + r2(bayW) + '"/>');
      const nT = Math.max(1, o.trippers || 2);
      for (let i = 0; i < nT; i++) {
        const tx = L * ((i + 0.5) / nT);
        parts.push('<g class="shed-tripper-plan">' +
          '<rect x="' + r2(tx - fs * 0.9) + '" y="' + r2(bayW - fs * 0.75) +
          '" width="' + r2(fs * 1.8) + '" height="' + r2(fs * 1.5) +
          '" rx="' + r2(fs * 0.2) + '"/>' +
          '<line x1="' + r2(tx) + '" y1="' + r2(bayW - fs * 0.75) +
          '" x2="' + r2(tx) + '" y2="' + r2(bayW - fs * 2.0) + '"/>' +
          '<line x1="' + r2(tx) + '" y1="' + r2(bayW + fs * 0.75) +
          '" x2="' + r2(tx) + '" y2="' + r2(bayW + fs * 2.0) + '"/>' +
          '</g>');
      }
    }

    // SPR — 면당 기수만큼, 각 bay 안에서 담당 구역을 맡는다
    const nS = Math.max(0, o.sprPerBay || 0);
    for (let b2 = 0; b2 < bays; b2++) {
      for (let k = 0; k < nS; k++) {
        const sx = L * ((k + 0.5) / nS);
        parts.push('<g class="shed-spr-plan">' +
          '<rect x="' + r2(sx - fs * 0.55) + '" y="' + r2(b2 * bayW + 3) +
          '" width="' + r2(fs * 1.1) + '" height="' + r2(bayW - 6) +
          '" rx="' + r2(fs * 0.16) + '"/>' +
          '<line x1="' + r2(sx) + '" y1="' + r2(b2 * bayW + 3) +
          '" x2="' + r2(sx) + '" y2="' + r2(b2 * bayW + bayW - 3) + '"/>' +
          '</g>');
        // SPR 라벨은 건물 밖 위쪽에. bay 안에 넣으면 bay 폭과 글씨 크기의
        // 조합에 따라 셀 번호·용량 표기와 겹친다 (긴 Shed 일수록 글씨가 커진다).
        // 좌우 bay 의 SPR 은 같은 x 에 서므로 라벨은 한 번만 적는다.
        if (b2 === 0) {
          parts.push('<text class="eq-tag" x="' + r2(sx) + '" y="' + r2(-fs * 0.5) +
            '" font-size="' + r2(fa) + '" text-anchor="middle">SPR</text>');
        }
      }
    }

    // 치수
    parts.push(hDim(0, L, -fs * 1.6, '총 길이 ' + dim(L) + ' m', fs));
    parts.push(vDim(0, W, -fs * 1.8, '총 폭 ' + dim(W) + ' m', fs));

    const x0 = -fs * 4.2, y0 = -fs * 3.4;
    const vw = (L + fs * 2.2) - x0;
    const vh = (W + fs * 2.2) - y0;
    return '<svg class="dwg dwg-shed-plan" viewBox="' + [x0, y0, vw, vh].map(r2).join(' ') +
      '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
      parts.join('') + '</svg>';
  }

  const api = { drawShedSection: drawShedSection, drawShedPlan: drawShedPlan, shade: shade };
  global.RSD = global.RSD || {};
  global.RSD.draw2dShed = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
