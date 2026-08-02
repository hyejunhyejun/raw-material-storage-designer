(function (global) {
  // 마스터플랜 평면도 — 밴드 적층
  //
  // 총 폭 = Σ 띠 폭, 총 길이 = max(띠 길이).
  // 띠 순서는 사용자가 드래그로 바꿀 수 있고, 순서가 바뀌어도 총폭은 변하지 않는다
  // (같은 띠들의 합이므로). 바뀌는 것은 S/R 공유 가능성과 동선이다.
  //
  // 각 띠는 단색 사각형이 아니라 실제 내용을 축소해 그린다 —
  // 야드는 파일, Silo 는 원 배열, Shed 는 셀 격자, S/R 띠는 레일·B/C·설비 심볼.
  // 그래야 "이 배치로 운용이 되는가"를 도면에서 바로 판단할 수 있다.

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return ESC[ch]; }); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function dim(v) { return (v % 1 === 0) ? String(v) : v.toFixed(1); }
  // 글자 폭 어림 — 한글 ≈ 1.0em, 그 외 ≈ 0.55em (em 단위)
  function textUnits(t) {
    let x = 0;
    for (const ch of String(t)) x += (/[가-힣]/.test(ch) ? 1.0 : 0.55);
    return x;
  }
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

  // 띠 상단의 누적 y 좌표
  function bandOffsets(bands) {
    const out = [];
    let y = 0;
    for (let i = 0; i < bands.length; i++) { out.push(y); y += bands[i].width; }
    return out;
  }

  // 순서 교체 — 원본을 건드리지 않는다
  function reorderBands(bands, from, to) {
    if (from === to) return bands;
    if (from < 0 || from >= bands.length) return bands;
    if (to < 0 || to >= bands.length) return bands;
    const a = bands.slice();
    const item = a.splice(from, 1)[0];
    a.splice(to, 0, item);
    return a;
  }

  // 드래그한 y 좌표(미터)가 어느 띠 자리인지
  function dropIndex(bands, y) {
    const offs = bandOffsets(bands);
    for (let i = 0; i < bands.length; i++) {
      if (y < offs[i] + bands[i].width) return i;
    }
    return bands.length - 1;
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

  // ---------- 띠 내용 ----------

  // 야드 — 실제 파일 수만큼 스타디움을 그린다
  function yardContent(b, y, uid) {
    const p = [];
    const s = b.sizing;
    if (!s) return '';
    const C = s.stackLength.value, F = s.stackWidth.value;
    const I = b.pileCount || 0, J = b.pileGap || 0, B = b.maintLength || 0;
    if (I <= 0 || C <= 0) return '';
    const span = (C - (I - 1) * J) / I;
    if (span <= 0) return '';
    const py = y + (b.width - F) / 2;
    for (let i = 0; i < I; i++) {
      const x = B / 2 + i * (span + J);
      p.push('<rect class="mp-pile" x="' + r2(x) + '" y="' + r2(py) +
        '" width="' + r2(span) + '" height="' + r2(F) +
        '" rx="' + r2(F / 2) + '" ry="' + r2(F / 2) +
        '" fill="url(#mg-' + uid + '-' + (b.materialKey || 'x') + ')"/>');
    }
    return p.join('');
  }

  // S/R 띠 — 레일 2줄 + B/C 중심선 + S/R 기계 심볼
  function srContent(b, y, fs) {
    const p = [];
    const w = b.width, L = b.length;
    p.push('<line class="mp-rail" x1="0" y1="' + r2(y + w * 0.22) + '" x2="' + r2(L) + '" y2="' + r2(y + w * 0.22) + '"/>');
    p.push('<line class="mp-rail" x1="0" y1="' + r2(y + w * 0.78) + '" x2="' + r2(L) + '" y2="' + r2(y + w * 0.78) + '"/>');
    p.push('<line class="mp-bc" x1="0" y1="' + r2(y + w * 0.5) + '" x2="' + r2(L) + '" y2="' + r2(y + w * 0.5) + '"/>');
    // S/R 기계 — 대차 + 좌우로 뻗은 붐
    [0.3, 0.7].forEach(function (t) {
      const cx = L * t;
      p.push('<rect class="mp-sr" x="' + r2(cx - w * 0.7) + '" y="' + r2(y + w * 0.2) +
        '" width="' + r2(w * 1.4) + '" height="' + r2(w * 0.6) + '" rx="' + r2(w * 0.15) + '"/>');
      p.push('<line class="mp-boom" x1="' + r2(cx) + '" y1="' + r2(y + w * 0.5) +
        '" x2="' + r2(cx) + '" y2="' + r2(y - w * 2.2) + '"/>');
      p.push('<line class="mp-boom" x1="' + r2(cx) + '" y1="' + r2(y + w * 0.5) +
        '" x2="' + r2(cx) + '" y2="' + r2(y + w + w * 2.2) + '"/>');
    });
    return p.join('');
  }

  // Silo — 원 배열
  function siloContent(b, y) {
    const p = [];
    const s = b.sizing;
    if (!s) return '';
    const n = s.count.value, perRow = s.perRow.value;
    const rows = Math.max(1, Math.ceil(n / perRow));
    const pitch = b.pitch || 51, d = b.innerDia || 41, fw = b.footprintWidth || 61;
    let placed = 0;
    for (let rr = 0; rr < rows && placed < n; rr++) {
      for (let ii = 0; ii < perRow && placed < n; ii++, placed++) {
        const cx = fw / 2 + ii * pitch;
        const cy = y + b.width / 2 + (rr - (rows - 1) / 2) * pitch;
        p.push('<circle class="mp-silo" cx="' + r2(cx) + '" cy="' + r2(cy) + '" r="' + r2(d / 2) + '"/>');
      }
    }
    return p.join('');
  }

  // Shed — 셀 격자
  function shedContent(b, y) {
    const p = [];
    const s = b.sizing;
    if (!s || !s.cells) return '';
    const bays = b.bays || 1;
    const bayW = b.width / bays;
    const byBay = {};
    s.cells.forEach(function (c) {
      const i = c.bay - 1;
      if (!byBay[i]) byBay[i] = [];
      byBay[i].push(c);
    });
    const mz = b.maintZone || 0, wt = b.wallThickness || 2;
    for (let bb = 0; bb < bays; bb++) {
      const list = byBay[bb] || [];
      let x = mz + wt;
      list.forEach(function (c, i) {
        const len = c.length.value;
        p.push('<rect class="mp-cell" x="' + r2(x) + '" y="' + r2(y + bb * bayW + 1.5) +
          '" width="' + r2(len) + '" height="' + r2(bayW - 3) + '"/>');
        x += len + wt;
      });
    }
    return p.join('');
  }

  const KIND_FILL = { road: 'var(--dwg-road)', sr: 'var(--dwg-srband)' };

  function drawMasterPlan(o) {
    const bands = o.bands || [];
    const L = o.totalLength || 100;
    const W = o.totalWidth || 60;
    // 오른쪽 라벨이 여백을 다 먹으므로 fs 를 정하기 전에 라벨 폭부터 잰다.
    // 이렇게 해야 viewBox 폭의 1/46 이 유지되어 다른 도면과 글씨 크기가 맞는다.
    const labelUnits = bands.reduce(function (w, b) {
      const sub = (b.note ? b.note + ' · ' : '') + '폭 ' + dim(b.width) + ' m';
      return Math.max(w, textUnits(b.label), textUnits(sub));
    }, 8) * 0.8 + 2.2;
    const fs = fsFor(L, 5.6 + labelUnits);
    const fa = fs * 0.8;        // 주기용 — 치수 fs / 주기 fa
    const offs = bandOffsets(bands);
    const uid = 'mp' + Math.abs(Math.round(L * 3 + W * 7 + bands.length)).toString(36);

    // 원료별 그라데이션 — 야드 파일에 입체감을 준다
    const grads = [];
    const seen = {};
    bands.forEach(function (b) {
      if (!b.color || !b.materialKey || seen[b.materialKey]) return;
      seen[b.materialKey] = true;
      grads.push('<linearGradient id="mg-' + uid + '-' + b.materialKey + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="' + shade(b.color, -22) + '"/>' +
        '<stop offset="0.48" stop-color="' + shade(b.color, 26) + '"/>' +
        '<stop offset="0.52" stop-color="' + shade(b.color, 26) + '"/>' +
        '<stop offset="1" stop-color="' + shade(b.color, -22) + '"/>' +
        '</linearGradient>');
    });
    const defs = '<defs>' + grads.join('') +
      '<pattern id="rd-' + uid + '" width="' + r2(fs * 0.55) + '" height="' + r2(fs * 0.55) +
      '" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<line class="hatch" x1="0" y1="0" x2="0" y2="' + r2(fs * 0.55) + '"/></pattern></defs>';

    const parts = [];
    const thin = [];    // 얇은 띠 — 라벨을 바깥으로 뺀다

    bands.forEach(function (b, i) {
      const y = offs[i];
      const isMat = !!b.color;
      const fill = isMat ? shade(b.color, 66)
        : (b.kind === 'road' ? 'url(#rd-' + uid + ')' : (KIND_FILL[b.kind] || 'var(--dwg-apron)'));

      const g = ['<g class="band" data-band="' + i + '">'];
      g.push('<rect class="band-fill" x="0" y="' + r2(y) + '" width="' + r2(b.length) +
        '" height="' + r2(b.width) + '" fill="' + esc(fill) + '"/>');

      if (b.kind === 'yard') g.push(yardContent(b, y, uid));
      else if (b.kind === 'sr') g.push(srContent(b, y, fs));
      else if (b.kind === 'silo') g.push(siloContent(b, y));
      else if (b.kind === 'shed') g.push(shedContent(b, y));

      g.push('<rect class="band-edge" x="0" y="' + r2(y) + '" width="' + r2(b.length) +
        '" height="' + r2(b.width) + '"/>');
      // 드래그 손잡이 — 잡기 쉽게 크게
      g.push('<rect class="band-grip" x="' + r2(-fs * 2.0) + '" y="' + r2(y + b.width * 0.12) +
        '" width="' + r2(fs * 1.5) + '" height="' + r2(Math.max(b.width * 0.76, fs * 0.7)) +
        '" rx="' + r2(fs * 0.3) + '"/>');
      g.push('</g>');
      parts.push(g.join(''));

      // 라벨은 전부 오른쪽 바깥에 — 띠 안에 넣으면 파일·사일로 위에 겹쳐 읽히지 않는다
      thin.push({
        y: y + b.width / 2, len: b.length, kind: b.kind,
        label: b.label,
        // 기수·폭은 부제로 내린다 — 한 줄로 붙이면 도면 밖으로 밀려난다
        sub: (b.note ? b.note + ' · ' : '') + '폭 ' + dim(b.width) + ' m'
      });
    });

    // 라벨을 오른쪽 바깥에 세로로 겹치지 않게 쌓는다
    let lastY = -Infinity, stackBottom = 0;
    thin.forEach(function (t) {
      const y = Math.max(t.y, lastY + fs * 2.4);
      stackBottom = y;
      lastY = y;
      const lx = L + fs * 1.2;
      parts.push('<polyline class="leader" points="' + r2(t.len) + ',' + r2(t.y) + ' ' +
        r2(lx - fs * 0.4) + ',' + r2(y) + ' ' + r2(lx) + ',' + r2(y) + '"/>');
      parts.push('<circle class="leader-dot" cx="' + r2(t.len) + '" cy="' + r2(t.y) +
        '" r="' + r2(fs * 0.12) + '"/>');
      parts.push('<text class="band-tag' + (t.kind === 'road' ? ' road-tag' : '') +
        '" x="' + r2(lx + fs * 0.25) + '" y="' + r2(y - fa * 0.75) +
        '" font-size="' + r2(fa) + '" text-anchor="start">' + esc(t.label) + '</text>');
      parts.push('<text class="band-sub" x="' + r2(lx + fs * 0.25) + '" y="' + r2(y + fa * 0.85) +
        '" font-size="' + r2(fa) + '" text-anchor="start">' + esc(t.sub) + '</text>');
    });

    // 치수 · 축척 · 방위
    parts.push(hDim(0, L, -fs * 1.9, '총 길이 ' + dim(L) + ' m', fs));
    parts.push(vDim(0, W, -fs * 3.0, '총 폭 ' + dim(W) + ' m', fs));
    parts.push('<g class="north"><circle cx="' + r2(L - fs * 1.4) + '" cy="' + r2(-fs * 4.0) +
      '" r="' + r2(fs * 0.95) + '"/><polygon points="' +
      r2(L - fs * 1.4) + ',' + r2(-fs * 4.9) + ' ' +
      r2(L - fs * 1.75) + ',' + r2(-fs * 3.7) + ' ' +
      r2(L - fs * 1.05) + ',' + r2(-fs * 3.7) + '"/>' +
      '<text x="' + r2(L - fs * 1.4) + '" y="' + r2(-fs * 2.7) + '" font-size="' + r2(fa) +
      '" text-anchor="middle">N</text></g>');

    const x0 = -fs * 5.6, y0 = -fs * 5.4;
    const vw = (L + fs * labelUnits) - x0;
    const vh = (Math.max(W, stackBottom + fa * 1.6) + fs * 1.8) - y0;
    return '<svg class="dwg dwg-master" viewBox="' + [x0, y0, vw, vh].map(r2).join(' ') +
      '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
      defs + parts.join('') + '</svg>';
  }

  const api = {
    drawMasterPlan: drawMasterPlan, reorderBands: reorderBands,
    bandOffsets: bandOffsets, dropIndex: dropIndex
  };
  global.RSD = global.RSD || {};
  global.RSD.draw2dMaster = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
