(function (global) {
  // Silo 평면·입면 도면
  //
  // 배치 길이 = (열당 기수 − 1) × 중심간격 + 점유폭
  // 순수 이격 = 중심간격 − 내부 직경
  // 도면도 같은 식으로 좌표를 잡으므로 계산서와 그림이 어긋나지 않는다.

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return ESC[ch]; }); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function dim(v) { return (v % 1 === 0) ? String(v) : v.toFixed(1); }
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
  // 글자 폭 어림 — 한글 ≈ 1.0em, 그 외 ≈ 0.55em (em 단위)
  function textUnits(t) {
    let x = 0;
    for (const ch of String(t)) x += (/[가-힣]/.test(ch) ? 1.0 : 0.55);
    return x;
  }

  function hDim(x1, x2, y, label, fs, ext) {
    const a = fs * 0.55;
    const p = ['<g class="dim">'];
    if (ext !== undefined) {
      p.push('<line class="dim-ext" x1="' + r2(x1) + '" y1="' + r2(ext) + '" x2="' + r2(x1) + '" y2="' + r2(y + fs * 0.3) + '"/>');
      p.push('<line class="dim-ext" x1="' + r2(x2) + '" y1="' + r2(ext) + '" x2="' + r2(x2) + '" y2="' + r2(y + fs * 0.3) + '"/>');
    }
    p.push('<line class="dim-line" x1="' + r2(x1) + '" y1="' + r2(y) + '" x2="' + r2(x2) + '" y2="' + r2(y) + '"/>');
    p.push(arrowH(x1, y, a, -1)); p.push(arrowH(x2, y, a, 1));
    // 순이격처럼 구간이 짧으면 가운데 정렬한 라벨이 도면 왼쪽 여백(배치 폭 치수 자리)
    // 까지 뻗어 나간다. 왼쪽으로 넘칠 것 같으면 왼쪽 화살표에 붙여 오른쪽으로 흘린다.
    const half = textUnits(label) * fs / 2;
    const mid = (x1 + x2) / 2;
    const overflowsLeft = (mid - half) < 0;
    p.push('<text class="dim-text" x="' + r2(overflowsLeft ? Math.max(x1, 0) : mid) +
      '" y="' + r2(y - fs * 0.45) + '" font-size="' + r2(fs) +
      '" text-anchor="' + (overflowsLeft ? 'start' : 'middle') + '">' + esc(label) + '</text></g>');
    return p.join('');
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

  // 축척 막대 — 도면이 실비례임을 눈으로 확인시킨다
  function scaleBar(x, y, len, fs) {
    const seg = len / 4, fa = fs * 0.8;
    const p = ['<g class="scale-bar">'];
    for (let i = 0; i < 4; i++) {
      p.push('<rect class="' + (i % 2 ? 'sb-b' : 'sb-a') + '" x="' + r2(x + i * seg) +
        '" y="' + r2(y) + '" width="' + r2(seg) + '" height="' + r2(fs * 0.34) + '"/>');
    }
    p.push('<text class="dim-text" x="' + r2(x) + '" y="' + r2(y + fs * 1.1) +
      '" font-size="' + r2(fa) + '" text-anchor="start">0</text>');
    p.push('<text class="dim-text" x="' + r2(x + len) + '" y="' + r2(y + fs * 1.1) +
      '" font-size="' + r2(fa) + '" text-anchor="end">' + dim(len) + ' m</text>');
    p.push('</g>');
    return p.join('');
  }

  // ---------- 평면도 ----------
  function drawSiloPlan(o) {
    const L = o.bandLength, W = o.bandWidth;
    const fs = fsFor(L, 13.9);  // 여백 4.4 + 9.5
    const fa = fs * 0.8;        // 주기용 — 치수 fs / 주기 fa 두 가지만 쓴다
    const r = o.innerDia / 2;
    const base = o.color || '#6E6E73';
    const rows = Math.max(1, o.rows);
    const perRow = Math.max(1, o.perRow);
    const clearance = o.pitch - o.innerDia;
    const uid = 'sp' + Math.abs(Math.round(L * 7 + W * 13 + o.count)).toString(36);

    // 원통을 위에서 본 입체감 — 좌상단 광원
    const defs = '<defs>' +
      '<radialGradient id="sg-' + uid + '" cx="0.34" cy="0.30" r="0.78">' +
      '<stop offset="0" stop-color="' + shade(base, 62) + '"/>' +
      '<stop offset="0.55" stop-color="' + shade(base, 34) + '"/>' +
      '<stop offset="1" stop-color="' + shade(base, -12) + '"/>' +
      '</radialGradient>' +
      '<pattern id="ch-' + uid + '" width="' + r2(fs * 0.4) + '" height="' + r2(fs * 0.4) +
      '" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<line class="hatch" x1="0" y1="0" x2="0" y2="' + r2(fs * 0.4) + '"/></pattern>' +
      '</defs>';

    const parts = [];
    parts.push('<rect class="silo-band" x="0" y="0" width="' + r2(L) + '" height="' + r2(W) + '"/>');

    // 상부 공급/불출 corridor — 해칭으로 구분
    const cw = o.corridorWidth || 0;
    if (cw > 0) {
      parts.push('<rect class="silo-corridor" x="0" y="' + r2(W - cw) +
        '" width="' + r2(L) + '" height="' + r2(cw) + '" fill="url(#ch-' + uid + ')"/>');
      parts.push('<rect class="silo-corridor-edge" x="0" y="' + r2(W - cw) +
        '" width="' + r2(L) + '" height="' + r2(cw) + '"/>');
    }

    const usableW = W - cw;
    let placed = 0;
    const centers = [];
    for (let rr = 0; rr < rows && placed < o.count; rr++) {
      for (let ii = 0; ii < perRow && placed < o.count; ii++, placed++) {
        const cx = o.footprintWidth / 2 + ii * o.pitch;
        const cy = usableW / 2 + (rr - (rows - 1) / 2) * o.pitch;
        centers.push([cx, cy]);
        // 외벽 링 → 내부 → 중앙 배출구
        parts.push('<circle class="silo-wall" cx="' + r2(cx) + '" cy="' + r2(cy) +
          '" r="' + r2(r * 1.06) + '"/>');
        parts.push('<circle class="silo" fill="url(#sg-' + uid + ')" cx="' + r2(cx) +
          '" cy="' + r2(cy) + '" r="' + r2(r) + '"/>');
        parts.push('<circle class="silo-outlet" cx="' + r2(cx) + '" cy="' + r2(cy) +
          '" r="' + r2(r * 0.17) + '"/>');
        // 기수 번호는 원 안에 들어갈 때만 — 기수가 많아지면 원이 촘촘해져
        // 번호끼리 붙어버린다 (도면이 지저분해지느니 번호를 빼는 편이 낫다)
        const noTxt = String(placed + 1);
        if (fa * noTxt.length * 0.62 < r * 1.1) {
          parts.push('<text class="silo-no" x="' + r2(cx) + '" y="' + r2(cy - r * 0.42) +
            '" font-size="' + r2(fa) + '" text-anchor="middle">' + noTxt + '</text>');
        }
      }
    }

    // 열마다 상부 공급 B/C + Tripper 주행선이 Silo 중심 위를 지난다.
    // 2열 이상이면 열마다 한 줄씩 있어야 각 Silo 에 장입할 수 있다.
    for (let rr = 0; rr < rows; rr++) {
      const cy = usableW / 2 + (rr - (rows - 1) / 2) * o.pitch;
      parts.push('<line class="silo-axis" x1="' + r2(-fs * 0.6) + '" y1="' + r2(cy) +
        '" x2="' + r2(L + fs * 0.6) + '" y2="' + r2(cy) + '"/>');
      parts.push('<line class="silo-feed" x1="' + r2(-fs * 0.6) + '" y1="' + r2(cy) +
        '" x2="' + r2(L + fs * 0.6) + '" y2="' + r2(cy) + '"/>');
      parts.push('<text class="zone-tag" x="' + r2(L + fs * 0.9) + '" y="' + r2(cy) +
        '" font-size="' + r2(fa) + '" text-anchor="start">공급 B/C + Tripper (' +
        (rr + 1) + '열)</text>');
    }

    // 치수 — 첫 두 기에만 중심간·순이격을 표기해 지저분해지지 않게
    const cy0 = usableW / 2 - (rows - 1) / 2 * o.pitch;
    if (o.count > 1) {
      const c1 = o.footprintWidth / 2, c2 = c1 + o.pitch;
      // 순이격은 원 사이 틈이 좁아 그 자리에 적으면 원에 묻힌다.
      // 두 치수를 모두 첫 열 위쪽 바깥에 쌓고 보조선으로 대상을 명시한다.
      parts.push(hDim(c1 + r, c2 - r, cy0 - r - fs * 1.6, '순이격 ' + dim(clearance) + ' m', fs, cy0 - r));
      parts.push(hDim(c1, c2, cy0 - r - fs * 3.5, '중심간격 ' + dim(o.pitch) + ' m', fs, cy0 - r - fs * 1.9));
    }
    // 기수가 적으면 배치 길이 라벨이 중심간격 라벨과 같은 자리에 온다 —
    // 위쪽 치수단이 이미 쓰이고 있으면 한 단 더 올린다
    const topUsed = (o.count > 1) ? (cy0 - r - fs * 3.5) : 0;
    const lenY = Math.min(-fs * 1.7, topUsed - fs * 1.8);
    parts.push(hDim(0, L, lenY, '배치 길이 ' + dim(L) + ' m', fs, 0));
    parts.push(vDim(0, W, -fs * 1.9, '배치 폭 ' + dim(W) + ' m', fs));

    // corridor 라벨은 띠 바깥 오른쪽에 (안에 넣으면 원과 겹친다)
    if (cw > 0) {
      // corridor 폭이 좁으면 이 라벨이 마지막 열의 '공급 B/C' 라벨과 같은 높이에 온다.
      // 최소 한 줄(fa*1.3) 은 떨어뜨린다.
      const lastFeedY = usableW / 2 + (rows - 1) / 2 * o.pitch;
      const corrY = Math.max(W - cw / 2, lastFeedY + fa * 1.4);
      parts.push('<text class="zone-tag" x="' + r2(L + fs * 0.6) + '" y="' + r2(corrY) +
        '" font-size="' + r2(fa) + '" text-anchor="start">공급/불출 Corridor ' + dim(cw) + ' m</text>');
    }
    // 축척 막대 — 양끝 라벨('0' · '100 m')이 들어갈 만큼은 길어야 한다.
    // 배치가 아주 길면 fs 가 커져 100 m 막대가 라벨보다 짧아진다.
    const barMin = fs * 6;
    parts.push(scaleBar(0, W + fs * 1.4, Math.max(barMin, Math.min(100, L / 4)), fs));

    const x0 = -fs * 4.4;
    // 배치 길이 치수를 위로 밀어 올렸으면 viewBox 도 그만큼 넓혀야 잘리지 않는다
    const y0 = Math.min(-fs * 5.6, lenY - fs * 1.7);
    const vw = (L + fs * 9.5) - x0;
    const vh = (W + fs * 3.4) - y0;
    return '<svg class="dwg dwg-silo-plan" viewBox="' + [x0, y0, vw, vh].map(r2).join(' ') +
      '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
      defs + parts.join('') + '</svg>';
  }

  // ---------- 입면도 ----------
  function drawSiloElevation(o) {
    const H = o.totalHeight;
    const r = o.innerDia / 2;
    const show = Math.min(o.count, 5);
    const L = (show - 1) * o.pitch + o.innerDia;
    const fs = fsFor(L, 16);    // 여백 5.0 + 11
    const fa = fs * 0.8;
    const base = o.color || '#6E6E73';
    const uid = 'se' + Math.abs(Math.round(L * 11 + H * 3)).toString(36);

    // 실제 콘크리트 Silo 는 외벽이 기초까지 곧게 내려온다.
    // 호퍼는 내부 설비이므로 외형에서 오목해지지 않는다 (참조 사진 기준).
    const roofH = r * 0.30;            // 얕은 돔 지붕
    const baseH = 10;                  // 하부 콘크리트 기초 구조
    const bodyTop = roofH;
    const bodyBot = H - baseH;

    // 원통 곡면 — 좌측이 밝고 우측으로 어두워진다
    const defs = '<defs>' +
      '<linearGradient id="cy-' + uid + '" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="' + shade(base, 18) + '"/>' +
      '<stop offset="0.28" stop-color="' + shade(base, 56) + '"/>' +
      '<stop offset="0.68" stop-color="' + shade(base, 22) + '"/>' +
      '<stop offset="1" stop-color="' + shade(base, -18) + '"/>' +
      '</linearGradient>' +
      '<linearGradient id="rf-' + uid + '" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="' + shade(base, 44) + '"/>' +
      '<stop offset="1" stop-color="' + shade(base, 4) + '"/>' +
      '</linearGradient>' +
      '</defs>';

    const parts = [];

    // 지반 + 기초
    parts.push('<line class="ground" x1="' + r2(-fs * 1.4) + '" y1="' + r2(H) +
      '" x2="' + r2(L + fs * 1.4) + '" y2="' + r2(H) + '"/>');

    for (let i = 0; i < show; i++) {
      const cx = r + i * o.pitch;

      // 하부 콘크리트 기초 — 외벽 폭 그대로 곧게 내려온다
      parts.push('<rect class="silo-base" x="' + r2(cx - r) + '" y="' + r2(H - baseH) +
        '" width="' + r2(o.innerDia) + '" height="' + r2(baseH) + '"/>');
      // 원통 몸통 — 지붕 아래부터 기초까지 곧게
      parts.push('<rect class="silo-body" fill="url(#cy-' + uid + ')" x="' + r2(cx - r) +
        '" y="' + r2(bodyTop) + '" width="' + r2(o.innerDia) + '" height="' + r2(bodyBot - bodyTop) + '"/>');
      // 얕은 돔 지붕 + 처마 챙 (참조 사진의 파란 돔)
      parts.push('<path class="silo-roof" fill="url(#rf-' + uid + ')" d="M ' +
        r2(cx - r * 1.08) + ' ' + r2(roofH) +
        ' Q ' + r2(cx) + ' ' + r2(-roofH * 0.75) + ' ' + r2(cx + r * 1.08) + ' ' + r2(roofH) + ' Z"/>');
      // 돔 방사 리브
      [-0.62, -0.3, 0, 0.3, 0.62].forEach(function (t) {
        parts.push('<line class="silo-rib" x1="' + r2(cx) + '" y1="' + r2(-roofH * 0.34) +
          '" x2="' + r2(cx + r * 1.05 * t) + '" y2="' + r2(roofH) + '"/>');
      });
      parts.push('<rect class="silo-vent" x="' + r2(cx - r * 0.09) + '" y="' + r2(-roofH * 1.1) +
        '" width="' + r2(r * 0.18) + '" height="' + r2(roofH * 0.8) + '"/>');
      // RDM 배출 하우스 — 기초 안에 들어간다
      parts.push('<rect class="silo-rdm" x="' + r2(cx - r * 0.26) + '" y="' + r2(H - baseH * 0.72) +
        '" width="' + r2(r * 0.52) + '" height="' + r2(baseH * 0.72) + '"/>');
      // 외부 계단
      parts.push('<line class="silo-stair" x1="' + r2(cx + r) + '" y1="' + r2(bodyBot) +
        '" x2="' + r2(cx + r * 0.55) + '" y2="' + r2(bodyTop) + '"/>');
    }

    // 상부 공급 갤러리 (트러스) + Tripper
    const galY = -fs * 2.2, galH = fs * 0.9;
    parts.push('<rect class="silo-gallery" x="' + r2(-fs * 1.0) + '" y="' + r2(galY) +
      '" width="' + r2(L + fs * 2.0) + '" height="' + r2(galH) + '"/>');
    const nT = Math.max(4, Math.round(L / 22));
    for (let i = 0; i <= nT; i++) {
      const x = -fs * 1.0 + (L + fs * 2.0) * (i / nT);
      parts.push('<line class="truss" x1="' + r2(x) + '" y1="' + r2(galY) +
        '" x2="' + r2(x + (L + fs * 2.0) / nT) + '" y2="' + r2(galY + galH) + '"/>');
    }
    // Tripper — 경사 벨트가 정점 풀리를 돌아 후드로 떨어지는 실루엣
    const tw = fs * 3.4, th = fs * 2.6;
    [L * 0.26, L * 0.74].forEach(function (tx) {
      const ty = galY - th;
      parts.push('<g class="silo-tripper">' +
        // 대차
        '<rect class="tp-car" x="' + r2(tx - tw / 2) + '" y="' + r2(galY - fs * 0.5) +
        '" width="' + r2(tw) + '" height="' + r2(fs * 0.5) + '"/>' +
        // 경사 벨트 (상승 → 정점 → 하강)
        '<polyline class="tp-belt" points="' +
        r2(tx - tw / 2) + ',' + r2(galY - fs * 0.5) + ' ' +
        r2(tx) + ',' + r2(ty) + ' ' +
        r2(tx + tw / 2) + ',' + r2(galY - fs * 0.5) + '"/>' +
        // 정점 풀리
        '<circle class="tp-pulley" cx="' + r2(tx) + '" cy="' + r2(ty) + '" r="' + r2(fs * 0.4) + '"/>' +
        // 상부 하우징
        '<rect class="tp-house" x="' + r2(tx - fs * 0.75) + '" y="' + r2(ty - fs * 1.0) +
        '" width="' + r2(fs * 1.5) + '" height="' + r2(fs * 1.0) + '"/>' +
        // 디스차지 후드
        '<polygon class="tp-hood" points="' +
        r2(tx - fs * 0.45) + ',' + r2(ty + fs * 0.4) + ' ' +
        r2(tx + fs * 0.45) + ',' + r2(ty + fs * 0.4) + ' ' +
        r2(tx + fs * 0.8) + ',' + r2(galY + galH + fs * 1.4) + ' ' +
        r2(tx + fs * 0.3) + ',' + r2(galY + galH + fs * 1.4) + '"/>' +
        // 주행 차륜
        '<circle class="tp-wheel" cx="' + r2(tx - tw * 0.34) + '" cy="' + r2(galY) + '" r="' + r2(fs * 0.22) + '"/>' +
        '<circle class="tp-wheel" cx="' + r2(tx + tw * 0.34) + '" cy="' + r2(galY) + '" r="' + r2(fs * 0.22) + '"/>' +
        '</g>');
    });
    parts.push('<text class="zone-tag" x="' + r2(L + fs * 1.4) + '" y="' + r2(galY + galH / 2) +
      '" font-size="' + r2(fa) + '" text-anchor="start">상부 공급 B/C + Tripper</text>');

    // 하부 불출 B/C
    parts.push('<rect class="silo-bc" x="' + r2(-fs * 1.0) + '" y="' + r2(H + fs * 0.7) +
      '" width="' + r2(L + fs * 2.0) + '" height="' + r2(fs * 0.6) + '"/>');
    parts.push('<text class="zone-tag" x="' + r2(L + fs * 1.4) + '" y="' + r2(H + fs * 1.0) +
      '" font-size="' + r2(fa) + '" text-anchor="start">하부 불출 B/C (RDM 배출)</text>');

    if (o.count > show) {
      parts.push('<text class="more-tag" x="' + r2(L + fs * 0.5) + '" y="' + r2(H * 0.30) +
        '" font-size="' + r2(fa) + '" text-anchor="start">… 총 ' + o.count + '기</text>');
    }

    // 레벨 표기 — 왼쪽은 높이 치수선이 쓰므로 오른쪽에 둔다.
    // 전고는 치수선이 이미 말해주므로 EL 은 중복이라 넣지 않는다.
    // GL 표기 — 왼쪽은 전체높이 치수선, 오른쪽 아래는 불출 B/C 라벨이 쓰므로
    // 오른쪽에 두되 지반선보다 한 줄 위로 올린다
    parts.push('<line class="lvl-line" x1="' + r2(L + fs * 0.3) + '" y1="' + r2(H) +
      '" x2="' + r2(L + fs * 1.2) + '" y2="' + r2(H) + '"/>');
    parts.push('<text class="lvl" x="' + r2(L + fs * 1.4) + '" y="' + r2(H - fs * 1.2) +
      '" font-size="' + r2(fa) + '" text-anchor="start">GL ±0</text>');

    // 치수
    parts.push(vDim(0, H, -fs * 2.6, '전체 높이 ' + dim(H) + ' m', fs));
    parts.push(hDim(0, o.innerDia, H + fs * 2.6, '내부 직경 ' + dim(o.innerDia) + ' m', fs, H));
    if (show > 1) {
      parts.push(hDim(r, r + o.pitch, H + fs * 4.2, '중심간격 ' + dim(o.pitch) + ' m', fs));
    }

    const x0 = -fs * 5.0, y0 = -fs * 6.4;
    const vw = (L + fs * 11) - x0;
    const vh = (H + fs * 5.6) - y0;
    return '<svg class="dwg dwg-silo-elev" viewBox="' + [x0, y0, vw, vh].map(r2).join(' ') +
      '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
      defs + parts.join('') + '</svg>';
  }

  const api = { drawSiloPlan: drawSiloPlan, drawSiloElevation: drawSiloElevation, scaleBar: scaleBar };
  global.RSD = global.RSD || {};
  global.RSD.draw2dSilo = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
