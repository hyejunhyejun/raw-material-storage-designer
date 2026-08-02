(function (global) {
  // 파라미터 도해 — 입력값이 도면의 어느 치수를 가리키는지 보여준다.
  //
  // 설계 원칙 (앞선 판이 지저분했던 이유를 그대로 뒤집은 것)
  //
  //  1. **도면 위에는 기호만.** 긴 이름을 도형 옆에 붙이면 라벨이 도형보다 커져
  //     서로를 침범한다. 도면에는 A·B·① 같은 한 글자만 두고,
  //     이름과 계산식은 오른쪽 범례가 맡는다. 실제 도면의 표제란과 같은 방식이다.
  //
  //  2. **지시선을 쓰지 않는다.** 여러 지시선이 도형을 가로지르면 그 자체가 소음이다.
  //     기호는 가리키려는 자리에 직접 얹고(배지), 치수는 도형 바깥 정해진 단에만 둔다.
  //
  //  3. **모든 도해가 같은 틀.** 가로 1000, 도형 구역 x 120…660, 범례 x 700…990.
  //     여섯 장이 한 벌로 보이고, 같은 font-size 가 같은 크기로 렌더된다.

  const W = 1000;               // 모든 도해의 가로 좌표 폭
  const FS = 22;                // 통일 글씨 크기
  const DX0 = 120, DX1 = 660;   // 도형 구역 좌우
  const VX = 98;                // 세로 치수단 (도형 왼쪽)
  const LSYM = 714;             // 범례 기호 배지 중심
  const LTX = 736;              // 범례 글씨 시작
  const LY0 = 74;               // 범례 첫 줄

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return ESC[ch]; }); }
  function r2(v) { return Math.round(v * 100) / 100; }

  function arrowH(x, y, d) {
    const a = FS * 0.5, t = a * 0.36;
    return '<polygon class="hlp-arrow" points="' + r2(x) + ',' + r2(y) + ' ' +
      r2(x - d * a) + ',' + r2(y - t) + ' ' + r2(x - d * a) + ',' + r2(y + t) + '"/>';
  }
  function arrowV(x, y, d) {
    const a = FS * 0.5, t = a * 0.36;
    return '<polygon class="hlp-arrow" points="' + r2(x) + ',' + r2(y) + ' ' +
      r2(x - t) + ',' + r2(y - d * a) + ' ' + r2(x + t) + ',' + r2(y - d * a) + '"/>';
  }

  // 수평 치수 — 라벨은 기호 한 글자. ext 를 주면 도형에서 치수선까지 보조선을 뻗는다.
  function hd(x1, x2, y, sym, ext) {
    const p = ['<g class="hlp-dim">'];
    if (ext !== undefined) {
      const near = ext < y ? ext + 6 : ext - 6;
      p.push('<line class="hlp-ext" x1="' + r2(x1) + '" y1="' + r2(near) + '" x2="' + r2(x1) + '" y2="' + r2(y) + '"/>');
      p.push('<line class="hlp-ext" x1="' + r2(x2) + '" y1="' + r2(near) + '" x2="' + r2(x2) + '" y2="' + r2(y) + '"/>');
    }
    p.push('<line x1="' + r2(x1) + '" y1="' + r2(y) + '" x2="' + r2(x2) + '" y2="' + r2(y) + '"/>');
    p.push(arrowH(x1, y, -1)); p.push(arrowH(x2, y, 1));
    p.push('<text x="' + r2((x1 + x2) / 2) + '" y="' + r2(y - FS * 0.45) +
      '" font-size="' + FS + '" text-anchor="middle">' + esc(sym) + '</text></g>');
    return p.join('');
  }

  // 수직 치수 — 도형 왼쪽 단에 세운다 (오른쪽은 범례 자리)
  function vd(y1, y2, x, sym, ext) {
    const p = ['<g class="hlp-dim">'];
    if (ext !== undefined) {
      p.push('<line class="hlp-ext" x1="' + r2(x) + '" y1="' + r2(y1) + '" x2="' + r2(ext) + '" y2="' + r2(y1) + '"/>');
      p.push('<line class="hlp-ext" x1="' + r2(x) + '" y1="' + r2(y2) + '" x2="' + r2(ext) + '" y2="' + r2(y2) + '"/>');
    }
    p.push('<line x1="' + r2(x) + '" y1="' + r2(y1) + '" x2="' + r2(x) + '" y2="' + r2(y2) + '"/>');
    p.push(arrowV(x, y1, -1)); p.push(arrowV(x, y2, 1));
    p.push('<text x="' + r2(x - FS * 0.5) + '" y="' + r2((y1 + y2) / 2) +
      '" font-size="' + FS + '" text-anchor="end" dominant-baseline="middle">' +
      esc(sym) + '</text></g>');
    return p.join('');
  }

  // 배지 — 가리키려는 자리에 기호를 직접 얹는다 (지시선 없음)
  function badge(x, y, sym) {
    return '<g class="hlp-badge">' +
      '<circle cx="' + r2(x) + '" cy="' + r2(y) + '" r="' + r2(FS * 0.62) + '"/>' +
      '<text x="' + r2(x) + '" y="' + r2(y) + '" font-size="' + FS +
      '" text-anchor="middle" dominant-baseline="central">' + esc(sym) + '</text></g>';
  }

  // 범례 — [기호, 이름, 보조설명?] 목록. 이름·계산식은 전부 여기 모인다.
  function legendBlock(rows) {
    const p = ['<g class="hlp-legend">'];
    let y = LY0;
    rows.forEach(function (row) {
      p.push('<circle class="hlp-lsym" cx="' + LSYM + '" cy="' + r2(y) + '" r="' + r2(FS * 0.62) + '"/>');
      p.push('<text class="hlp-lsymt" x="' + LSYM + '" y="' + r2(y) + '" font-size="' + FS +
        '" text-anchor="middle" dominant-baseline="central">' + esc(row[0]) + '</text>');
      p.push('<text class="hlp-lname" x="' + LTX + '" y="' + r2(y) + '" font-size="' + FS +
        '" text-anchor="start" dominant-baseline="middle">' + esc(row[1]) + '</text>');
      y += FS * 1.5;
      if (row[2]) {
        p.push('<text class="hlp-lnote" x="' + LTX + '" y="' + r2(y) + '" font-size="' + FS +
          '" text-anchor="start" dominant-baseline="middle">' + esc(row[2]) + '</text>');
        y += FS * 1.35;
      }
    });
    p.push('</g>');
    return { svg: p.join(''), bottom: y };
  }

  // 캔버스 높이 — 도형 아래끝과 범례 아래끝 중 더 내려간 쪽에 맞춘다.
  // 범례 줄 수가 도해마다 다르므로 높이를 손으로 박아 두면 반드시 잘린다.
  function canvasH(drawingBottom, lg) {
    return Math.max(drawingBottom, lg.bottom) + FS * 1.2;
  }

  function wrap(cls, h, body) {
    return '<svg class="dwg hlp ' + cls + '" viewBox="0 0 ' + W + ' ' + r2(h) +
      '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
      '<line class="hlp-split" x1="688" y1="46" x2="688" y2="' + r2(h - 24) + '"/>' +
      body + '</svg>';
  }

  // ---------- ① 오픈야드 평면 ----------
  function drawYardHelp() {
    const yTop = 116, D = 120, yBot = yTop + D;
    const E = 24, eh = E / 2;              // 통행로는 양측 ½씩
    const F = D - E;
    const B = 100, C = (DX1 - DX0) - B;    // 정비공간 합계 / 적치길이
    const I = 3, J = 16;
    const span = (C - (I - 1) * J) / I;
    const p = [];

    p.push('<rect class="hlp-yard" x="' + DX0 + '" y="' + yTop + '" width="' + (DX1 - DX0) + '" height="' + D + '"/>');
    [yTop, yBot - eh].forEach(function (ry) {
      p.push('<rect class="hlp-road" x="' + DX0 + '" y="' + ry + '" width="' + (DX1 - DX0) + '" height="' + eh + '"/>');
    });
    [DX0, DX1 - B / 2].forEach(function (mx) {
      p.push('<rect class="hlp-maint" x="' + mx + '" y="' + (yTop + eh) + '" width="' + (B / 2) + '" height="' + F + '"/>');
    });
    for (let i = 0; i < I; i++) {
      const px = DX0 + B / 2 + i * (span + J);
      p.push('<rect class="hlp-pile" x="' + r2(px) + '" y="' + (yTop + eh) +
        '" width="' + r2(span) + '" height="' + F + '" rx="' + (F / 2) + '" ry="' + (F / 2) + '"/>');
    }

    // 치수 — 위 2단 · 아래 2단 · 왼쪽 1단 · 오른쪽 1단
    const g1 = DX0 + B / 2 + span;
    p.push(hd(g1, g1 + J, 100, 'J', yTop));
    p.push(hd(DX0, DX1, 58, 'A', yTop));
    p.push(hd(DX0 + B / 2, DX0 + B / 2 + C, yBot + 46, 'C', yBot));
    p.push(hd(DX0, DX0 + B / 2, yBot + 92, 'B', yBot));
    p.push(vd(yTop, yBot, VX, 'D', DX0));
    p.push(vd(yTop, yTop + eh, 674, 'E', DX1));
    p.push(vd(yTop + eh, yBot - eh, 674, 'F', DX1));
    p.push(badge(DX0 + B / 2 + span / 2, yTop + D / 2, 'I'));

    const lg = legendBlock([
      ['A', '야드 길이'],
      ['B', '정비공간', '양 끝단 합계'],
      ['C', '적치길이', '= A − B'],
      ['D', '야드 폭'],
      ['E', '차량 통행로', '양측 ½ 씩'],
      ['F', '적치폭', '= D − E'],
      ['I', '파일 수', '그림은 3개'],
      ['J', '파일간 간격']
    ]);
    return wrap('hlp-yard-plan', canvasH(yBot + 92, lg), p.join('') + lg.svg);
  }

  // ---------- ② 오픈야드 단면 ----------
  function drawYardSectionHelp() {
    const gl = 262, G = 150;
    const D = DX1 - DX0, E = 48, eh = E / 2;
    const left = DX0 + eh, right = DX1 - eh;
    const apex = DX0 + D / 2;
    const p = [];

    p.push('<line class="hlp-ground" x1="' + (DX0 - 40) + '" y1="' + gl + '" x2="' + (DX1 + 20) + '" y2="' + gl + '"/>');
    [DX0, right].forEach(function (rx) {
      p.push('<rect class="hlp-road" x="' + rx + '" y="' + (gl - 9) + '" width="' + eh + '" height="9"/>');
    });
    p.push('<polygon class="hlp-pile" points="' + left + ',' + gl + ' ' +
      r2(apex) + ',' + (gl - G) + ' ' + right + ',' + gl + '"/>');
    // 능선 — 최고점이 어디인지 보이게
    p.push('<line class="hlp-crest" x1="' + r2(apex) + '" y1="' + (gl - G) + '" x2="' + r2(apex) + '" y2="' + gl + '"/>');

    // 안식각 호 — 우측 사면과 지반 사이
    const R = 62, th = Math.atan2(G, (right - left) / 2);
    const arc = [];
    for (let i = 0; i <= 12; i++) {
      const a = th * (i / 12);
      arc.push(r2(right - R * Math.cos(a)) + ',' + r2(gl - R * Math.sin(a)));
    }
    p.push('<polyline class="hlp-arc" points="' + arc.join(' ') + '"/>');
    p.push(badge(right - R * 0.60, gl - R * 0.28, 'H'));

    p.push(hd(DX0, DX0 + eh, 96, 'E', gl - 9));
    p.push(hd(left, right, gl + 46, 'F', gl));
    p.push(hd(DX0, DX1, gl + 92, 'D', gl));
    p.push(vd(gl - G, gl, VX, 'G', left));

    const lg = legendBlock([
      ['D', '야드 폭'],
      ['E', '차량 통행로', '양측 ½ 씩'],
      ['F', '적치폭', '= D − E'],
      ['G', '적치높이', '= (F ÷ 2) · tan H'],
      ['H', '안식각', '원료가 무너지지 않는 각']
    ]);
    return wrap('hlp-yard-sec', canvasH(gl + 92, lg), p.join('') + lg.svg);
  }

  // ---------- ③ Shed 단면 ----------
  function drawShedHelp() {
    const cx = (DX0 + DX1) / 2;
    const cw = 12, Lb = 58, La = 138, open = 52;
    const bayW = cw / 2 + Lb + La + open;        // = 254
    const gl = 300, h1 = 112, h3 = 30, wallH = 78;
    const eave = gl - wallH, apexY = eave - 62;
    const p = [];

    p.push('<line class="hlp-ground" x1="' + r2(cx - bayW - 30) + '" y1="' + gl +
      '" x2="' + r2(cx + bayW + 30) + '" y2="' + gl + '"/>');
    p.push('<path class="hlp-roof" d="M ' + r2(cx - bayW) + ' ' + eave + ' L ' + cx + ' ' + apexY +
      ' L ' + r2(cx + bayW) + ' ' + eave + '"/>');
    [cx - bayW, cx + bayW].forEach(function (x) {
      p.push('<line class="hlp-roof" x1="' + r2(x) + '" y1="' + eave + '" x2="' + r2(x) + '" y2="' + gl + '"/>');
    });

    [-1, 1].forEach(function (sg) {
      const a1 = cx + sg * cw / 2;
      const a2 = a1 + sg * Lb;
      const a3 = a2 + sg * La;
      p.push('<polygon class="hlp-a3" points="' + r2(a1) + ',' + gl + ' ' + r2(a1) + ',' + (gl + h3) + ' ' + r2(a3) + ',' + gl + '"/>');
      p.push('<polygon class="hlp-a2" points="' + r2(a1) + ',' + gl + ' ' + r2(a1) + ',' + r2(gl - h1 * 0.62) +
        ' ' + r2(a2) + ',' + r2(gl - h1) + ' ' + r2(a2) + ',' + gl + '"/>');
      p.push('<polygon class="hlp-a1" points="' + r2(a2) + ',' + gl + ' ' + r2(a2) + ',' + r2(gl - h1) +
        ' ' + r2(a3) + ',' + gl + '"/>');
    });
    p.push('<rect class="hlp-cwall" x="' + r2(cx - cw / 2) + '" y="' + r2(gl - h1 - 22) +
      '" width="' + cw + '" height="' + r2(h1 + 22) + '"/>');

    const b1 = cx + cw / 2, b2 = b1 + Lb, b3 = b2 + La;
    // 영역 배지는 각 영역 한가운데 (왼쪽 bay 에만 — 좌우 대칭이라 한 번이면 족하다)
    p.push(badge(cx - cw / 2 - Lb - La * 0.40, gl - h1 * 0.24, '①'));
    p.push(badge(cx - cw / 2 - Lb * 0.5, gl - h1 * 0.46, '②'));
    p.push(badge(cx - cw / 2 - (Lb + La) * 0.30, gl + h3 * 0.52, '③'));
    p.push(badge(cx, apexY + 44, 'W'));
    p.push(badge(cx - cw / 2 - (Lb + La) * 0.74, gl + h3 * 0.30, 'θ'));

    p.push(hd(b1, b2, gl - h1 - 44, 'b', gl - h1));
    p.push(hd(b2, b3, gl - h1 - 44, 'a', gl - h1));
    p.push(hd(b3, cx + bayW, gl + h3 + 46, 'c', gl + h3));
    p.push(hd(cx, cx + bayW, gl + h3 + 92, 'B', gl + h3 + 20));
    p.push(vd(apexY, gl, VX, 'H', cx - bayW));

    const lg = legendBlock([
      ['a', 'La 개방측 적치거리'],
      ['b', 'Lb 옹벽측 적치거리'],
      ['c', '개방측 여유', 'SPR 주행 + 불출 B/C'],
      ['B', 'bay 폭'],
      ['H', '전고'],
      ['W', '중앙 옹벽 두께'],
      ['θ', '하부 경사각'],
      ['①', '개방측 삼각형'],
      ['②', '옹벽측 사다리꼴'],
      ['③', '하부 쐐기']
    ]);
    return wrap('hlp-shed', canvasH(gl + h3 + 92, lg), p.join('') + lg.svg);
  }

  // ---------- ④ Shed 평면 ----------
  function drawShedPlanHelp() {
    const L = DX1 - DX0, yTop = 124, Wd = 150, bayW = Wd / 2;
    const mz = 44, wall = 10, cells = 4;
    const cellLen = (L - mz * 2 - wall * (cells + 1)) / cells;
    const p = [];

    p.push('<rect class="hlp-yard" x="' + DX0 + '" y="' + yTop + '" width="' + L + '" height="' + Wd + '"/>');
    [DX0, DX0 + L - mz].forEach(function (mx) {
      p.push('<rect class="hlp-maint" x="' + mx + '" y="' + yTop + '" width="' + mz + '" height="' + Wd + '"/>');
    });
    // 셀 — 격벽은 양쪽에 모두 (셀 n개 → 격벽 n+1개)
    for (let b = 0; b < 2; b++) {
      let x = DX0 + mz;
      const yb = yTop + b * bayW;
      for (let i = 0; i <= cells; i++) {
        p.push('<rect class="hlp-cwall" x="' + r2(x) + '" y="' + r2(yb + 3) +
          '" width="' + wall + '" height="' + r2(bayW - 6) + '"/>');
        x += wall;
        if (i < cells) {
          p.push('<rect class="hlp-cell" x="' + r2(x) + '" y="' + r2(yb + 3) +
            '" width="' + r2(cellLen) + '" height="' + r2(bayW - 6) + '"/>');
          x += cellLen;
        }
      }
    }
    p.push('<rect class="hlp-gallery" x="' + DX0 + '" y="' + (yTop + bayW - 6) + '" width="' + L + '" height="12"/>');

    p.push(hd(DX0, DX0 + mz, 88, 'M', yTop));
    p.push(hd(DX0 + mz + wall, DX0 + mz + wall + cellLen, 88, 'S', yTop));
    p.push(hd(DX0, DX0 + L, yTop + Wd + 50, 'L', yTop + Wd));
    p.push(vd(yTop, yTop + bayW, VX, '1', DX0));
    p.push(vd(yTop + bayW, yTop + Wd, VX, '2', DX0));
    p.push(badge(DX0 + mz + wall + cellLen + wall / 2, yTop + bayW * 1.5, 'T'));
    p.push(badge(DX0 + L * 0.82, yTop + bayW, 'G'));

    const lg = legendBlock([
      ['L', '총 길이', '= 정비존 + 셀 + 격벽'],
      ['M', '정비존', '양 끝단 각각'],
      ['S', '셀 길이'],
      ['T', '격벽 두께', '셀 양쪽에 모두'],
      ['G', '중앙 옹벽', '+ Tripper 주행로'],
      ['1', 'bay 1'],
      ['2', 'bay 2']
    ]);
    return wrap('hlp-shed-plan', canvasH(yTop + Wd + 50, lg), p.join('') + lg.svg);
  }

  // ---------- ⑤ Silo 평면 ----------
  function drawSiloPlanHelp() {
    const dia = 130, pitch = 162, fw = 190, corr = 40;
    const pyTop = 108, pW = fw + corr;
    const pL = pitch * 2 + fw;
    const cy = pyTop + (pW - corr) / 2;
    const cxs = [DX0 + fw / 2, DX0 + fw / 2 + pitch, DX0 + fw / 2 + pitch * 2];
    const p = [];

    p.push('<rect class="hlp-yard" x="' + DX0 + '" y="' + pyTop + '" width="' + pL + '" height="' + pW + '"/>');
    p.push('<rect class="hlp-corr" x="' + DX0 + '" y="' + (pyTop + pW - corr) + '" width="' + pL + '" height="' + corr + '"/>');
    // 순이격 = 두 원 사이의 빈틈. 색으로 칠해야 "여기다" 가 한눈에 들어온다.
    p.push('<rect class="hlp-gap" x="' + r2(cxs[0] + dia / 2) + '" y="' + r2(cy - dia / 2) +
      '" width="' + r2(pitch - dia) + '" height="' + dia + '"/>');
    cxs.forEach(function (x) {
      p.push('<circle class="hlp-silo" cx="' + r2(x) + '" cy="' + r2(cy) + '" r="' + (dia / 2) + '"/>');
      p.push('<circle class="hlp-siloc" cx="' + r2(x) + '" cy="' + r2(cy) + '" r="4"/>');
    });
    p.push('<line class="hlp-axis" x1="' + (DX0 - 20) + '" y1="' + r2(cy) +
      '" x2="' + r2(DX0 + pL + 20) + '" y2="' + r2(cy) + '"/>');

    p.push(hd(cxs[0] - dia / 2, cxs[0] + dia / 2, 66, '1', cy - dia / 2));
    p.push(hd(cxs[0], cxs[1], pyTop + pW + 50, '2', cy));
    p.push(vd(pyTop, pyTop + pW - corr, VX, '4', DX0));
    p.push(vd(pyTop + pW - corr, pyTop + pW, VX, '5', DX0));
    p.push(badge(cxs[0] + pitch / 2, cy, '3'));

    const lg = legendBlock([
      ['1', '내부 직경'],
      ['2', '중심간격'],
      ['3', '순이격', '= 중심간격 − 내부직경'],
      ['4', '점유 폭'],
      ['5', '상부 Corridor', '공급 / 불출 B/C 통로']
    ]);
    return wrap('hlp-silo-plan', canvasH(pyTop + pW + 50, lg), p.join('') + lg.svg);
  }

  // ---------- ⑥ Silo 입면 ----------
  function drawSiloElevHelp() {
    const dia = 130, pitch = 162, fw = 190;
    const cxs = [DX0 + fw / 2, DX0 + fw / 2 + pitch, DX0 + fw / 2 + pitch * 2];
    const eTop = 118, eH = 170, gl = eTop + eH, roofH = 24;
    const pL = pitch * 2 + fw;
    const p = [];

    p.push('<line class="hlp-ground" x1="' + (DX0 - 20) + '" y1="' + gl +
      '" x2="' + r2(DX0 + pL + 20) + '" y2="' + gl + '"/>');
    // 상부 공급 B/C + Tripper — Silo 중심 위를 지나야 장입이 된다
    p.push('<rect class="hlp-gallery" x="' + (DX0 - 10) + '" y="' + (eTop - 42) +
      '" width="' + (pL + 20) + '" height="14"/>');
    p.push('<rect class="hlp-cwall" x="' + r2(cxs[1] - 26) + '" y="' + (eTop - 60) +
      '" width="52" height="32"/>');
    cxs.forEach(function (x) {
      p.push('<rect class="hlp-silo" x="' + r2(x - dia / 2) + '" y="' + (eTop + roofH) +
        '" width="' + dia + '" height="' + (eH - roofH) + '"/>');
      p.push('<path class="hlp-silo" d="M ' + r2(x - dia / 2) + ' ' + (eTop + roofH) +
        ' Q ' + r2(x) + ' ' + r2(eTop - roofH * 0.6) + ' ' + r2(x + dia / 2) + ' ' + (eTop + roofH) + ' Z"/>');
      // 하부 RDM — 몸통 밑에 들어가 옆의 벨트로 원료를 밀어낸다
      p.push('<rect class="hlp-cwall" x="' + r2(x - dia * 0.15) + '" y="' + (gl - 15) +
        '" width="' + r2(dia * 0.30) + '" height="15"/>');
    });
    // 하부 불출 B/C — Silo 밑이 아니라 바로 옆에 나란히 붙는다
    p.push('<rect class="hlp-gallery" x="' + (DX0 - 10) + '" y="' + (gl + 12) +
      '" width="' + (pL + 20) + '" height="12"/>');

    p.push(vd(eTop, gl, VX, '6', DX0));
    p.push(badge(cxs[2] + dia * 0.66, eTop - 35, '7'));
    p.push(badge(cxs[2] + dia * 0.66, gl + 18, '8'));

    const lg = legendBlock([
      ['6', '전체 높이'],
      ['7', '상부 공급 B/C', '+ Tripper — 적치'],
      ['8', '하부 불출 B/C', '+ RDM — 불출']
    ]);
    return wrap('hlp-silo-elev', canvasH(gl + 40, lg), p.join('') + lg.svg);
  }

  // Silo 도해는 2장 — 평면과 입면을 각각 가로형으로 두어야
  // 다른 도해들과 같은 비례로 보이고 도형도 크게 들어간다.
  function drawSiloHelp() { return drawSiloPlanHelp() + drawSiloElevHelp(); }

  const api = {
    drawYardHelp: drawYardHelp, drawYardSectionHelp: drawYardSectionHelp,
    drawShedHelp: drawShedHelp, drawShedPlanHelp: drawShedPlanHelp,
    drawSiloPlanHelp: drawSiloPlanHelp, drawSiloElevHelp: drawSiloElevHelp,
    drawSiloHelp: drawSiloHelp,
    W: W, FS: FS, DX0: DX0, DX1: DX1
  };
  global.RSD = global.RSD || {};
  global.RSD.draw2dHelp = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
