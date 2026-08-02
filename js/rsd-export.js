(function (global) {
  // 내보내기 — 도면(PNG/SVG) · 계산서(CSV) · 입력값(JSON)
  //
  // 도면 SVG 는 화면의 CSS 클래스에 색·굵기를 맡기고 있다. 그대로 떼어내면
  // 스타일이 없는 흑백 덩어리가 되므로, 복제본의 각 요소에 **계산된 스타일을
  // 인라인으로 박아** 자립형 SVG 로 만든다. (CSS 변수도 계산 시점에 값으로 풀린다)

  const STYLE_PROPS = [
    'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray',
    'stroke-linejoin', 'stroke-linecap', 'stroke-opacity', 'opacity',
    'font-family', 'font-size', 'font-weight', 'letter-spacing',
    'text-anchor', 'dominant-baseline', 'paint-order', 'vector-effect'
  ];

  // ---------- 순수 함수 (node 에서 시험 가능) ----------

  // CSV 한 칸 — 쉼표·따옴표·줄바꿈이 있으면 감싸고 따옴표는 두 번 쓴다
  function csvCell(v) {
    const s = (v === null || v === undefined) ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // 엑셀이 한글을 깨뜨리지 않도록 BOM 을 붙인다 (없으면 cp949 로 읽어버린다)
  function toCsv(rows) {
    return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }

  // 계산서 → CSV 행. res 객체는 값뿐 아니라 식·대입·출처까지 들고 있으므로
  // 그대로 옮겨야 "이 숫자가 어디서 나왔나"를 파일만 보고도 따라갈 수 있다.
  function sheetRows(title, items) {
    const rows = [[title], ['항목', '값', '단위', '계산식', '대입', '출처']];
    items.forEach(function (it) {
      const r = it.res;
      if (!r) { rows.push([it.label, it.value, it.unit || '', '', '', '']); return; }
      rows.push([it.label, r.value, r.unit || '', r.formula || '', r.substitution || '', r.source || '']);
    });
    return rows;
  }

  // 파일명에 쓸 수 없는 문자를 바꾼다
  function safeName(s) {
    return String(s).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
  }

  function stamp(d) {
    const t = d || new Date();
    const p = function (n) { return (n < 10 ? '0' : '') + n; };
    return t.getFullYear() + p(t.getMonth() + 1) + p(t.getDate()) + '-' +
      p(t.getHours()) + p(t.getMinutes());
  }

  // 저장 파일 = 상태 + 버전 + 시각. 버전을 넣어야 나중에 형식이 바뀌어도 걸러낼 수 있다.
  function stateToJson(state, version) {
    return JSON.stringify({
      kind: 'rsd-scenario',
      version: version || 1,
      savedAt: new Date().toISOString(),
      state: state
    }, null, 2);
  }

  // 불러오기 — 남의 JSON 을 그대로 상태로 앉히면 화면이 통째로 깨진다.
  // 형식 표시와 필수 키를 확인하고, 아니면 이유를 들고 거절한다.
  function jsonToState(text) {
    let o;
    try { o = JSON.parse(text); }
    catch (e) { return { ok: false, error: 'JSON 형식이 아닙니다' }; }
    if (!o || o.kind !== 'rsd-scenario') {
      return { ok: false, error: '이 도구가 저장한 파일이 아닙니다 (kind ≠ rsd-scenario)' };
    }
    const s = o.state;
    if (!s || !s.materials || !s.yard || !s.shed || !s.silo) {
      return { ok: false, error: '필수 항목이 빠져 있습니다 (materials / yard / shed / silo)' };
    }
    return { ok: true, state: s, savedAt: o.savedAt || '' };
  }

  // ---------- 브라우저 전용 ----------

  // scale 배로 키워 내보낼 때, `vector-effect: non-scaling-stroke` 선은
  // viewBox 축척을 무시하고 화면 픽셀 폭을 그대로 쓴다. 그래서 큰 그림에서는
  // 선만 상대적으로 가늘어진다 — 그 선들만 굵기를 함께 키워준다.
  function inlineStyles(svg, scale) {
    const k = scale || 1;
    const clone = svg.cloneNode(true);
    const src = svg.querySelectorAll('*');
    const dst = clone.querySelectorAll('*');
    for (let i = 0; i < src.length; i++) {
      const cs = getComputedStyle(src[i]);
      const fixed = cs.getPropertyValue('vector-effect') === 'non-scaling-stroke';
      let css = '';
      for (let j = 0; j < STYLE_PROPS.length; j++) {
        const prop = STYLE_PROPS[j];
        let v = cs.getPropertyValue(prop);
        if (!v) continue;
        if (prop !== 'fill' && (v === 'normal' || v === 'auto' || v === 'none')) continue;
        if (prop === 'stroke-width' && fixed && k !== 1) {
          const n = parseFloat(v);
          if (!isNaN(n)) v = (n * k) + 'px';
        }
        css += prop + ':' + v + ';';
      }
      dst[i].setAttribute('style', css);
      dst[i].removeAttribute('class');
    }
    clone.removeAttribute('class');
    return clone;
  }

  // 도면 좌표는 미터 단위라 viewBox 폭이 60일 수도, 1500일 수도 있다.
  // 배율을 고정하면 단면도는 129 px 짜리 쓸모없는 그림이 나온다.
  // 그래서 **결과 가로 픽셀**을 기준으로 배율을 역산한다.
  const TARGET_W = 2400;      // 보고서·PPT 에 붙여도 깨지지 않는 폭
  const MAX_H = 2400;
  function fitScale(vb) {
    let k = TARGET_W / Math.max(1, vb.width);
    if (vb.height * k > MAX_H) k = MAX_H / Math.max(1, vb.height);
    return k;
  }

  function svgString(svg, scale) {
    const vb = svg.viewBox.baseVal;
    const k = scale || 1;
    const clone = inlineStyles(svg, k);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', Math.round(vb.width * k));
    clone.setAttribute('height', Math.round(vb.height * k));
    // 배경 — 투명 PNG 를 문서에 붙이면 글씨가 안 보인다. 화면 배경색을 깔아준다.
    const bg = getComputedStyle(document.body).backgroundColor;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', vb.x); rect.setAttribute('y', vb.y);
    rect.setAttribute('width', vb.width); rect.setAttribute('height', vb.height);
    rect.setAttribute('fill', bg);
    clone.insertBefore(rect, clone.firstChild);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function downloadText(text, filename, mime) {
    downloadBlob(new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' }), filename);
  }

  // SVG 는 벡터라 크기를 지정해도 화질이 안 변하지만,
  // 문서에 붙였을 때의 기본 크기를 쓸 만하게 잡아준다.
  function exportSvg(svg, name) {
    downloadText(svgString(svg, fitScale(svg.viewBox.baseVal)),
      safeName(name) + '_' + stamp() + '.svg', 'image/svg+xml');
  }

  function exportPng(svg, name) {
    const vb = svg.viewBox.baseVal;
    const k = fitScale(vb);
    const w = Math.round(vb.width * k), h = Math.round(vb.height * k);
    const str = svgString(svg, k);
    const img = new Image();
    img.onload = function () {
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      cv.toBlob(function (b) { downloadBlob(b, safeName(name) + '_' + stamp() + '.png'); });
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
  }

  // 3D 는 WebGL 캔버스라 SVG 가 아니다 — 캔버스를 그대로 굽는다
  function exportCanvas(canvas, name) {
    canvas.toBlob(function (b) { downloadBlob(b, safeName(name) + '_' + stamp() + '.png'); });
  }

  const api = {
    // 순수
    csvCell: csvCell, toCsv: toCsv, sheetRows: sheetRows, safeName: safeName, stamp: stamp,
    stateToJson: stateToJson, jsonToState: jsonToState,
    // 브라우저
    inlineStyles: inlineStyles, svgString: svgString, fitScale: fitScale,
    TARGET_W: TARGET_W, MAX_H: MAX_H,
    downloadBlob: downloadBlob, downloadText: downloadText,
    exportSvg: exportSvg, exportPng: exportPng, exportCanvas: exportCanvas,
    STYLE_PROPS: STYLE_PROPS
  };
  global.RSD = global.RSD || {};
  global.RSD.exporter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
