(function (global) {
  // SVG 좌표는 미터 단위를 그대로 쓴다. viewBox 로만 축척하므로
  // 도면이 실비례임이 코드 수준에서 보장된다.
  //
  // 묘화 원칙
  //   · 치수는 항상 도형 바깥. 치수보조선 + 화살표 + 값을 갖춘 정식 치수선을 쓴다.
  //   · 원료는 실제 색을 도면 팔레트로 옮긴 값으로 칠하고, 광원은 좌상단으로 통일한다.
  //   · 평면의 파일은 능선이 밝고 양 사면이 어두워지는 그라데이션으로 입체를 만든다.
  //   · 단면의 파일은 좌·우 사면 명암과 적치 층선으로 실제 스톡파일처럼 보이게 한다.

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return ESC[ch]; }); }
  function r2(v) { return Math.round(v * 100) / 100; }

  // 소수부가 있는 값만 소수 1자리로
  function dim(v) { return (v % 1 === 0) ? String(v) : v.toFixed(1); }

  // 색을 밝게(+) / 어둡게(−) — 광원 방향에 따른 면 명암용
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

  const STEEL = '#7C8794';   // 구조·설비 슬레이트
  const INVALID = '#D0342C'; // 성립 불가 배치

  // 도면 글씨 크기 — 모든 도면이 화면에서 같은 폭으로 렌더되므로
  // 화면상 글씨 크기는 결국 `fs ÷ viewBox 가로폭` 이 결정한다.
  // 그래서 콘텐츠 폭이 아니라 **viewBox 폭의 1/46** 이 되도록 잡아야 한다.
  //
  //   viewBox 폭 = 콘텐츠 폭 + fs × (여백 단위 합 marginUnits)
  //   fs = viewBox폭 / 46  →  fs = 콘텐츠폭 / (46 − marginUnits)
  //
  // (콘텐츠 폭만 쓰면 여백·범례가 큰 도면일수록 글씨가 작아진다)
  const FS_RATIO = 46;
  function fsFor(contentWidth, marginUnits) {
    const m = marginUnits || 0;
    const denom = FS_RATIO - m;
    return contentWidth / (denom > 4 ? denom : 4);
  }

  // ---------- 치수선 ----------
  // 화살표는 marker 로 두면 viewBox 축척에 휘둘리므로 폴리곤으로 직접 그린다.

  function arrowH(x, y, a, dir) {   // dir +1 = 오른쪽을 향함
    const t = a * 0.34;
    return '<polygon class="dim-arrow" points="' +
      r2(x) + ',' + r2(y) + ' ' +
      r2(x - dir * a) + ',' + r2(y - t) + ' ' +
      r2(x - dir * a) + ',' + r2(y + t) + '"/>';
  }

  function arrowV(x, y, a, dir) {   // dir +1 = 아래를 향함
    const t = a * 0.34;
    return '<polygon class="dim-arrow" points="' +
      r2(x) + ',' + r2(y) + ' ' +
      r2(x - t) + ',' + r2(y - dir * a) + ' ' +
      r2(x + t) + ',' + r2(y - dir * a) + '"/>';
  }

  // 수평 치수 — extFrom 은 치수보조선이 시작할 도형 쪽 y 좌표
  function hDim(x1, x2, y, label, fs, extFrom) {
    const a = fs * 0.55;
    const p = ['<g class="dim">'];
    if (extFrom !== undefined) {
      const g = fs * 0.25;                        // 도형에서 살짝 띄운다
      const s = extFrom < y ? extFrom + g : extFrom - g;
      const e = extFrom < y ? y + fs * 0.3 : y - fs * 0.3;
      p.push('<line class="dim-ext" x1="' + r2(x1) + '" y1="' + r2(s) + '" x2="' + r2(x1) + '" y2="' + r2(e) + '"/>');
      p.push('<line class="dim-ext" x1="' + r2(x2) + '" y1="' + r2(s) + '" x2="' + r2(x2) + '" y2="' + r2(e) + '"/>');
    }
    p.push('<line class="dim-line" x1="' + r2(x1) + '" y1="' + r2(y) + '" x2="' + r2(x2) + '" y2="' + r2(y) + '"/>');
    p.push(arrowH(x1, y, a, -1));
    p.push(arrowH(x2, y, a, 1));
    p.push('<text class="dim-text" x="' + r2((x1 + x2) / 2) + '" y="' + r2(y - fs * 0.45) +
      '" font-size="' + r2(fs) + '" text-anchor="middle">' + esc(label) + '</text>');
    p.push('</g>');
    return p.join('');
  }

  // 수직 치수 — extFrom 은 치수보조선이 시작할 도형 쪽 x 좌표
  function vDim(y1, y2, x, label, fs, extFrom) {
    const a = fs * 0.55;
    const p = ['<g class="dim">'];
    if (extFrom !== undefined) {
      const g = fs * 0.25;
      const s = extFrom < x ? extFrom + g : extFrom - g;
      const e = extFrom < x ? x + fs * 0.3 : x - fs * 0.3;
      p.push('<line class="dim-ext" x1="' + r2(s) + '" y1="' + r2(y1) + '" x2="' + r2(e) + '" y2="' + r2(y1) + '"/>');
      p.push('<line class="dim-ext" x1="' + r2(s) + '" y1="' + r2(y2) + '" x2="' + r2(e) + '" y2="' + r2(y2) + '"/>');
    }
    p.push('<line class="dim-line" x1="' + r2(x) + '" y1="' + r2(y1) + '" x2="' + r2(x) + '" y2="' + r2(y2) + '"/>');
    p.push(arrowV(x, y1, a, -1));
    p.push(arrowV(x, y2, a, 1));
    p.push('<text class="dim-text" x="' + r2(x - fs * 0.45) + '" y="' + r2((y1 + y2) / 2) +
      '" font-size="' + r2(fs) + '" text-anchor="middle"' +
      ' transform="rotate(-90 ' + r2(x - fs * 0.45) + ' ' + r2((y1 + y2) / 2) + ')">' +
      esc(label) + '</text>');
    p.push('</g>');
    return p.join('');
  }

  // ---------- 야드 평면 기하 ----------
  //
  // 파일 1개는 '직선구간 + 양끝 반원뿔'이므로 평면에서는 스타디움(양끝이 둥근 사각형)이다.
  // 점유 길이 = (적치길이 − 간격 총합) ÷ 파일수 이고, 이 값이 곧 rect 의 width,
  // 적치폭 F 가 height, F/2 가 모서리 반경이 된다.
  function yardPlanGeometry(o) {
    const rows = Math.max(1, o.rows || 1);
    const canvasW = o.A;
    // 이동기기 및 Belt Conveyor 면적은 야드 사이에 들어간다.
    // 야드가 1열뿐이면 한쪽에 붙여야 적치·불출이 가능하므로 띠 하나를 반드시 둔다.
    const bandCount = Math.max(1, rows - 1);
    const canvasH = rows * o.D + bandCount * o.srBandWidth;

    const rowsY = [];
    for (let r = 0; r < rows; r++) rowsY.push(r * (o.D + o.srBandWidth));

    // 띠의 y 위치 — 2열 이상이면 야드 사이, 1열이면 야드 아래
    const bandsY = [];
    for (let r = 0; r < bandCount; r++) bandsY.push(rowsY[r] + o.D);

    // 차량 통행로 E 는 한쪽에 몰려 있는 게 아니라 야드 **양측에 E/2 씩**이다 (합계 E).
    // 적치폭 F = D − E 는 그대로지만, 적치 구간은 야드 폭의 한가운데 놓인다.
    const roadHalf = (o.E || 0) / 2;

    const piles = [];
    const I = o.I || 0;
    // 파일 1개 점유 길이가 적치폭보다 좁으면 양끝 원뿔조차 들어가지 못한다.
    // 물리적으로 성립하지 않는 배치이므로 도면에 표시해 정상 배치처럼 보이지 않게 한다.
    let span = 0, invalid = false;
    if (I > 0) {
      span = (o.C - (I - 1) * o.J) / I;
      invalid = span < o.F;
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < I; i++) {
          piles.push({
            row: r,
            x: o.B / 2 + i * (span + o.J),
            y: rowsY[r] + roadHalf,
            w: span,
            h: o.F,
            rx: o.F / 2,
            invalid: invalid
          });
        }
      }
    }

    return {
      piles: piles, canvas: { w: canvasW, h: canvasH }, rowsY: rowsY,
      bandsY: bandsY, roadHalf: roadHalf, pileSpan: span, invalid: invalid
    };
  }

  // ---------- 야드 평면도 ----------
  function drawYardPlan(o) {
    const g = yardPlanGeometry(o);
    const W = g.canvas.w, H = g.canvas.h;
    const fs = fsFor(W, 7.2);   // 여백 4.6 + 2.6
    const fa = fs * 0.8;        // 주기용 — 전 도면 공통 규칙 (치수 fs / 주기 fa)
    const rows = Math.max(1, o.rows || 1);
    const base = o.color || '#6E6E73';
    const uid = 'p' + Math.abs(Math.round(W * 131 + H * 17 + (o.I || 0) * 7)).toString(36);

    const crest = shade(base, 30);   // 능선 — 광원을 정면으로 받는다
    const flank = shade(base, -26);  // 사면 — 빛이 비껴간다

    const defs = [
      '<defs>',
      '<linearGradient id="pg-' + uid + '" x1="0" y1="0" x2="0" y2="1">',
      '<stop offset="0" stop-color="' + flank + '"/>',
      '<stop offset="0.46" stop-color="' + crest + '"/>',
      '<stop offset="0.54" stop-color="' + crest + '"/>',
      '<stop offset="1" stop-color="' + flank + '"/>',
      '</linearGradient>',
      '<filter id="sh-' + uid + '" x="-20%" y="-20%" width="150%" height="160%">',
      '<feDropShadow dx="' + r2(fs * 0.18) + '" dy="' + r2(fs * 0.22) +
      '" stdDeviation="' + r2(fs * 0.16) + '" flood-opacity="0.28"/>',
      '</filter>',
      '</defs>'
    ].join('');

    const parts = [];

    // 열별 지면 · 차량통행로 · 정비공간
    for (let r = 0; r < rows; r++) {
      const y0 = g.rowsY[r];
      parts.push('<rect class="apron" x="0" y="' + r2(y0) +
        '" width="' + r2(o.A) + '" height="' + r2(o.D) + '"/>');
      // 차량 통행로 — 야드 양측에 E/2 씩
      const rh = g.roadHalf;
      parts.push('<rect class="road" x="0" y="' + r2(y0) +
        '" width="' + r2(o.A) + '" height="' + r2(rh) + '"/>');
      parts.push('<rect class="road" x="0" y="' + r2(y0 + o.D - rh) +
        '" width="' + r2(o.A) + '" height="' + r2(rh) + '"/>');
      parts.push('<rect class="maint" x="0" y="' + r2(y0 + rh) +
        '" width="' + r2(o.B / 2) + '" height="' + r2(o.F) + '"/>');
      parts.push('<rect class="maint" x="' + r2(o.A - o.B / 2) + '" y="' + r2(y0 + rh) +
        '" width="' + r2(o.B / 2) + '" height="' + r2(o.F) + '"/>');
      parts.push('<rect class="yard-outline" x="0" y="' + r2(y0) +
        '" width="' + r2(o.A) + '" height="' + r2(o.D) + '"/>');
      // 열 번호
      parts.push('<text class="row-tag" x="' + r2(fs * 0.6) + '" y="' + r2(y0 + o.D / 2) +
        '" font-size="' + r2(fa) + '">' + (r + 1) + '열</text>');
      // 통행로 띠는 2 m 남짓이라 글씨가 들어가지 않는다 — 지시선으로 빼서 가리킨다
      if (r === 0 && rh > 0) {
        parts.push('<g class="part-note">' +
          '<polyline points="' + r2(o.A * 0.62) + ',' + r2(y0 + rh / 2) + ' ' +
          r2(o.A * 0.66) + ',' + r2(y0 - fs * 1.1) + ' ' +
          r2(o.A * 0.70) + ',' + r2(y0 - fs * 1.1) + '"/>' +
          '<circle cx="' + r2(o.A * 0.62) + '" cy="' + r2(y0 + rh / 2) + '" r="' + r2(fa * 0.16) + '"/>' +
          '<text x="' + r2(o.A * 0.72) + '" y="' + r2(y0 - fs * 1.1) +
          '" font-size="' + r2(fa) + '" text-anchor="start">차량 통행로 ' + dim(rh) +
          ' m (양측 합계 ' + dim(o.E) + ' m)</text></g>');
      }
    }

    // 이동기기 및 Belt Conveyor 면적 — 레일 2줄과 설비 실루엣
    for (let r = 0; r < g.bandsY.length; r++) {
      const y0 = g.bandsY[r];
      const bw = o.srBandWidth;
      parts.push('<rect class="sr-band" x="0" y="' + r2(y0) +
        '" width="' + r2(o.A) + '" height="' + r2(bw) + '"/>');
      parts.push('<line class="sr-rail" x1="0" y1="' + r2(y0 + bw * 0.28) +
        '" x2="' + r2(o.A) + '" y2="' + r2(y0 + bw * 0.28) + '"/>');
      parts.push('<line class="sr-rail" x1="0" y1="' + r2(y0 + bw * 0.72) +
        '" x2="' + r2(o.A) + '" y2="' + r2(y0 + bw * 0.72) + '"/>');
      parts.push('<line class="bc-line" x1="0" y1="' + r2(y0 + bw * 0.5) +
        '" x2="' + r2(o.A) + '" y2="' + r2(y0 + bw * 0.5) + '"/>');
      // 스태커·리클레이머 겸용기 2기 (B/C 1열당 최대 2기)
      const mw = bw * 1.5, mh = bw * 0.62;
      [o.A * 0.28, o.A * 0.72].forEach(function (cx) {
        parts.push('<rect class="sr-machine" x="' + r2(cx - mw / 2) + '" y="' + r2(y0 + (bw - mh) / 2) +
          '" width="' + r2(mw) + '" height="' + r2(mh) + '" rx="' + r2(mh * 0.22) + '"/>');
        parts.push('<line class="sr-boom" x1="' + r2(cx) + '" y1="' + r2(y0 + bw * 0.5) +
          '" x2="' + r2(cx) + '" y2="' + r2(y0 - o.D * 0.42) + '"/>');
        parts.push('<line class="sr-boom" x1="' + r2(cx) + '" y1="' + r2(y0 + bw * 0.5) +
          '" x2="' + r2(cx) + '" y2="' + r2(y0 + bw + o.D * 0.42) + '"/>');
      });
    }

    // 파일 — 그라데이션 + 능선 하이라이트 + 그림자
    for (let i = 0; i < g.piles.length; i++) {
      const p = g.piles[i];
      const fill = p.invalid ? INVALID : 'url(#pg-' + uid + ')';
      parts.push('<rect class="pile' + (p.invalid ? ' invalid' : '') +
        '" x="' + r2(p.x) + '" y="' + r2(p.y) +
        '" width="' + r2(p.w) + '" height="' + r2(p.h) +
        '" rx="' + r2(p.rx) + '" ry="' + r2(p.rx) +
        '" fill="' + fill + '" filter="url(#sh-' + uid + ')"/>');
      // 능선은 직선구간에만 존재한다 (양끝은 원뿔이라 정점으로 수렴)
      if (!p.invalid && p.w > p.h) {
        parts.push('<line class="crest" x1="' + r2(p.x + p.h / 2) + '" y1="' + r2(p.y + p.h / 2) +
          '" x2="' + r2(p.x + p.w - p.h / 2) + '" y2="' + r2(p.y + p.h / 2) +
          '" stroke="' + shade(base, 52) + '"/>');
      }
    }

    if (g.invalid) {
      parts.push('<text class="invalid-note" x="' + r2(W / 2) + '" y="' + r2(H / 2) +
        '" font-size="' + r2(fs) + '" text-anchor="middle">성립 불가 배치</text>');
    }

    // 야드 길이 드래그 핸들 — 오른쪽 끝을 끌면 길이가 변한다
    parts.push('<rect class="drag-handle" data-drag="yard.yardLength" ' +
      'x="' + r2(o.A - fs * 0.35) + '" y="' + r2(-fs * 0.2) + '" ' +
      'width="' + r2(fs * 0.7) + '" height="' + r2(H + fs * 0.4) + '" rx="' + r2(fs * 0.35) + '"/>');
    parts.push('<text class="drag-hint" x="' + r2(o.A + fs * 1.1) + '" y="' + r2(H / 2) +
      '" font-size="' + r2(fs) + '" text-anchor="middle">↔</text>');

    // 치수 — 전부 도형 바깥
    const dimTop = -fs * 2.0;
    const dimBot = H + fs * 2.2;
    parts.push(hDim(0, o.A, dimTop, '야드 길이 ' + dim(o.A) + ' m', fs, 0));
    parts.push(hDim(o.B / 2, o.B / 2 + o.C, dimBot, '적치길이 ' + dim(o.C) + ' m', fs, H));
    parts.push(vDim(0, o.D, -fs * 2.2, '야드폭 ' + dim(o.D) + ' m', fs, 0));

    const x0 = -fs * 4.6, y0 = dimTop - fs * 1.9;
    const vw = (o.A + fs * 2.6) - x0;
    const vh = (dimBot + fs * 1.2) - y0;
    return '<svg class="dwg dwg-plan" viewBox="' +
      [x0, y0, vw, vh].map(r2).join(' ') +
      '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
      defs + parts.join('') + '</svg>';
  }

  // ---------- 야드 단면도 ----------
  function drawYardSection(o) {
    const W = o.D, H = o.G;
    const fs = fsFor(W, 10.4);  // 여백 4.8 + 5.6
    const fa = fs * 0.8;
    const base = o.color || '#6E6E73';
    const uid = 's' + Math.abs(Math.round(W * 131 + H * 29)).toString(36);

    // 차량 통행로는 양측 E/2 씩 → 적치 구간이 야드 한가운데 놓인다
    const rh = (o.E || 0) / 2;
    const left = rh, right = o.D - rh;
    const apexX = o.D / 2;
    const sun = shade(base, 22);    // 좌사면 — 광원 좌상단
    const shadow = shade(base, -30); // 우사면

    // 전체 삼각형 (좌하 → 정점 → 우하)
    const pts = [
      r2(left) + ',' + r2(o.G),
      r2(apexX) + ',0',
      r2(right) + ',' + r2(o.G)
    ].join(' ');
    // 우사면만 덧칠해 명암을 만든다
    const shadePts = [
      r2(apexX) + ',0',
      r2(right) + ',' + r2(o.G),
      r2(apexX) + ',' + r2(o.G)
    ].join(' ');

    const defs = [
      '<defs>',
      '<pattern id="hatch-' + uid + '" width="' + r2(fs * 0.5) + '" height="' + r2(fs * 0.5) +
      '" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">',
      '<line class="hatch" x1="0" y1="0" x2="0" y2="' + r2(fs * 0.5) + '"/>',
      '</pattern>',
      '</defs>'
    ].join('');

    const parts = [];

    // 지반 아래 해칭
    parts.push('<rect class="subgrade" x="' + r2(-fs) + '" y="' + r2(o.G) +
      '" width="' + r2(o.D + fs * 2) + '" height="' + r2(fs * 1.5) +
      '" fill="url(#hatch-' + uid + ')"/>');
    parts.push('<line class="ground" x1="' + r2(-fs) + '" y1="' + r2(o.G) +
      '" x2="' + r2(o.D + fs) + '" y2="' + r2(o.G) + '"/>');

    // 차량 통행로 노면 — 양측 E/2 씩
    [0, right].forEach(function (rx) {
      parts.push('<rect class="road" x="' + r2(rx) + '" y="' + r2(o.G - fs * 0.22) +
        '" width="' + r2(rh) + '" height="' + r2(fs * 0.22) + '"/>');
    });

    // 파일 — 밝은 면 전체 + 우사면 그림자
    parts.push('<polygon class="pile-section" points="' + pts + '" fill="' + sun + '"/>');
    parts.push('<polygon class="pile-shade" points="' + shadePts + '" fill="' + shadow + '"/>');

    // 적치 층선 — 실제 스톡파일이 층을 이뤄 쌓이는 모습
    [0.28, 0.5, 0.72, 0.88].forEach(function (t) {
      const y = o.G * t;
      const half = (o.F / 2) * t;
      parts.push('<line class="layer" x1="' + r2(apexX - half) + '" y1="' + r2(y) +
        '" x2="' + r2(apexX + half) + '" y2="' + r2(y) + '"/>');
    });
    // 능선
    parts.push('<line class="crest-v" x1="' + r2(apexX) + '" y1="0" x2="' + r2(apexX) +
      '" y2="' + r2(o.G) + '" stroke="' + shade(base, 46) + '"/>');
    parts.push('<polygon class="pile-edge" points="' + pts + '"/>');

    // 안식각 — 우측 사면 밑에 호를 그리고 라벨은 바깥에
    const rad = Math.min(o.F * 0.34, fs * 2.6);
    const steps = 10, arc = [];
    for (let i = 0; i <= steps; i++) {
      const th = (o.repose * Math.PI / 180) * (i / steps);
      arc.push(r2(right - rad * Math.cos(th)) + ',' + r2(o.G - rad * Math.sin(th)));
    }
    parts.push('<polyline class="angle-arc" points="' + arc.join(' ') + '"/>');
    parts.push('<text class="ang" x="' + r2(o.D + fs * 0.5) + '" y="' + r2(o.G - rad * 0.55) +
      '" font-size="' + r2(fa) + '" text-anchor="start">안식각 ' + dim(o.repose) + '°</text>');

    // GL 표기
    parts.push('<text class="gl" x="' + r2(-fs * 0.9) + '" y="' + r2(o.G - fs * 0.45) +
      '" font-size="' + r2(fa) + '" text-anchor="start">GL ±0</text>');

    // 치수 — 전부 도형 바깥
    const d1 = o.G + fs * 2.6;
    const d2 = o.G + fs * 4.2;
    parts.push(hDim(left, right, d1, '적치폭 ' + dim(o.F) + ' m', fs, o.G + fs * 1.5));
    parts.push(hDim(0, o.D, d2, '야드폭 ' + dim(o.D) + ' m', fs));
    parts.push(vDim(0, o.G, -fs * 2.4, '적치높이 ' + dim(o.G) + ' m', fs, left));
    // 양측 통행로 — 어느 쪽이 통행로인지 도면에 직접 적는다
    [rh / 2, o.D - rh / 2].forEach(function (tx) {
      parts.push('<text class="road-tag" x="' + r2(tx) + '" y="' + r2(o.G + fs * 1.5) +
        '" font-size="' + r2(fa) + '" text-anchor="middle">통행로 ' + dim(rh) + '</text>');
    });

    const x0 = -fs * 4.8, y0 = -fs * 1.6;
    const vw = (o.D + fs * 5.6) - x0;
    const vh = (d2 + fs * 1.4) - y0;
    return '<svg class="dwg dwg-section" viewBox="' +
      [x0, y0, vw, vh].map(r2).join(' ') +
      '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
      defs + parts.join('') + '</svg>';
  }

  // 드래그 픽셀 이동량을 미터로 환산.
  // pxPerMeter 는 화면에 그려진 SVG 의 실제 축척이다.
  const MIN_YARD_LENGTH = 10;
  function handleDragDelta(startValue, dxPx, pxPerMeter) {
    if (!pxPerMeter || pxPerMeter <= 0) return startValue;
    const next = startValue + dxPx / pxPerMeter;
    return Math.max(MIN_YARD_LENGTH, Math.round(next));
  }

  const api = {
    yardPlanGeometry: yardPlanGeometry,
    drawYardPlan: drawYardPlan,
    drawYardSection: drawYardSection,
    handleDragDelta: handleDragDelta,
    MIN_YARD_LENGTH: MIN_YARD_LENGTH,
    shade: shade,
    esc: esc
  };
  global.RSD = global.RSD || {};
  global.RSD.draw2d = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
