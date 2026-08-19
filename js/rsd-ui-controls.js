(function (global) {
  const req = (typeof require !== 'undefined');
  const core = req ? require('./rsd-core.js') : global.RSD.core;
  const fmt = core.fmt;

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return ESC[ch]; }); }

  // 소수부가 있는 값만 소수 1자리로 — 소수 자리가 잘리지 않게
  function dp(v) { return (v % 1 === 0) ? 0 : 1; }
  function num(v) { return fmt(v, dp(v)); }

  // 천 단위 쉼표 — 500만 t 을 '5000000' 으로 보여주면 자릿수를 셀 수 없다.
  // <input type="number"> 는 쉼표를 못 담으므로 이런 칸만 text 로 바꾸고
  // 숫자 입력임을 data-num 으로 표시한다 (읽는 쪽에서 쉼표를 걷어낸다).
  function grouped(v) {
    const n = Number(v);
    if (!isFinite(n)) return String(v);
    return n.toLocaleString('ko-KR', { maximumFractionDigits: 3 });
  }

  function numberField(o) {
    const step = (o.step === undefined) ? 'any' : o.step;
    const min = (o.min === undefined) ? '' : ' min="' + o.min + '"';
    const max = (o.max === undefined) ? '' : ' max="' + o.max + '"';
    // 다른 입력에서 자동 산정되는 값은 잠그고, 계산 결과를 그대로 보여준다.
    // 두 입력이 서로를 결정하는 관계라면 한쪽만 열려 있어야 혼동이 없다.
    const off = o.disabled ? ' disabled' : '';
    const hintText = o.disabled ? (o.disabledHint || '자동 산정') : o.hint;
    const hint = hintText ? '<span class="fld-hint">' + esc(hintText) + '</span>' : '';
    const input = o.group
      ? '<input type="text" inputmode="numeric" data-num="1" data-min="' +
        (o.min === undefined ? '' : o.min) + '" data-path="' + esc(o.path) +
        '" value="' + esc(grouped(o.value)) + '"' + off + '>'
      : '<input type="number" data-path="' + esc(o.path) + '" value="' + o.value +
        '" step="' + step + '"' + min + max + off + '>';
    return '<label class="fld' + (o.disabled ? ' fld-off' : '') + '">' +
      '<span class="fld-label">' + esc(o.label) + '</span>' +
      '<span class="fld-input">' + input +
      '<span class="fld-unit">' + esc(o.unit || '') + '</span>' +
      '</span>' + hint +
      '</label>';
  }

  // 쉼표·공백이 섞인 입력을 숫자로. 못 읽으면 null 을 돌려
  // 부르는 쪽이 "값 없음"과 "0"을 구분할 수 있게 한다.
  function parseNum(text) {
    const cleaned = String(text).replace(/[^0-9.\-]/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
    const n = Number(cleaned);
    return isFinite(n) ? n : null;
  }

  function selectField(o) {
    const opts = o.options.map(function (op) {
      const sel = (op.value === o.value) ? ' selected' : '';
      return '<option value="' + esc(op.value) + '"' + sel + '>' + esc(op.label) + '</option>';
    }).join('');
    return '<label class="fld">' +
      '<span class="fld-label">' + esc(o.label) + '</span>' +
      '<span class="fld-input">' +
      '<select data-path="' + esc(o.path) + '">' + opts + '</select>' +
      '</span>' +
      '</label>';
  }

  // 값을 클릭하면 식·대입값·근거가 펼쳐진다.
  // 네이티브 <details>를 쓰므로 JS 없이 동작하고 인쇄 시에도 열어둘 수 있다.
  function traceCell(r) {
    return '<details class="trace">' +
      '<summary><span class="trace-val">' + num(r.value) + '</span>' +
      '<span class="trace-unit">' + esc(r.unit || '') + '</span></summary>' +
      '<div class="trace-body">' +
      '<div class="trace-formula">' + esc(r.formula || '') + '</div>' +
      '<div class="trace-subst">' + esc(r.substitution || '') + '</div>' +
      '<div class="trace-src">' + esc(r.source || '') + '</div>' +
      '</div></details>';
  }

  function resultTable(rows) {
    const body = rows.map(function (row) {
      return '<tr><th class="rt-label">' + esc(row.label) + '</th>' +
        '<td class="rt-val">' + traceCell(row.res) + '</td></tr>';
    }).join('');
    return '<table class="result-table"><tbody>' + body + '</tbody></table>';
  }

  function warnBox(warnings, title) {
    if (!warnings || warnings.length === 0) return '';
    const items = warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('');
    return '<div class="warn">' +
      (title ? '<b class="warn-t">' + esc(title) + '</b>' : '') +
      '<ul>' + items + '</ul></div>';
  }

  // 계단 구간 안내 — "값을 바꿨는데 왜 안 변하지?" 에 화면이 스스로 답한다.
  // 야드·Silo 는 정수 올림이라 경계 전까지 설비 수량이 꿈쩍하지 않는다.
  function holdNote(ranges) {
    const live = (ranges || []).filter(function (r) { return r; });
    if (!live.length) return '';
    const items = live.map(function (r) {
      return '<li><b>' + esc(r.label) + '</b> ' + esc(r.fromText) + ' ~ ' + esc(r.toText) +
        (r.openHigh ? ' <span class="dim">(훑은 범위 끝)</span>' : '') + '</li>';
    }).join('');
    return '<div class="hold"><b class="hold-t">지금 구성(' +
      esc(live[0].units + ' ' + live[0].unitLabel) + ')이 유지되는 구간</b>' +
      '<ul>' + items + '</ul>' +
      '<p class="dim">이 안에서는 값을 바꿔도 설비 수량과 면적이 그대로입니다 — ' +
      '정수로 올림되기 때문입니다. 설계 대상용량과 최종 재고일수는 계속 움직입니다.</p></div>';
  }

  function statTile(o) {
    const sub = o.sub ? '<div class="tile-sub">' + esc(o.sub) + '</div>' : '';
    return '<div class="tile">' +
      '<div class="tile-label">' + esc(o.label) + '</div>' +
      '<div class="tile-value">' + num(o.value) +
      '<span class="tile-unit">' + esc(o.unit || '') + '</span></div>' +
      sub + '</div>';
  }

  // 적치가능율 타일 — 숫자만으로는 판단이 안 되므로 계산식과 기준선을 함께 적는다.
  // 기준선 = 1 ÷ 운영효율. 설비는 "대상량 ÷ 운영효율" 만큼 크게 짓기 때문에,
  // 아무리 딱 맞게 지어도 적치가능율은 이 값 밑으로 내려가지 않는다.
  function stackTile(entry) {
    const r = entry.stackRatio, floor = entry.stackFloor || 0;
    if (!r || !(r.value > 0)) return '';
    const over = (floor > 0) ? r.value / floor : 0;
    const band = (over >= 2) ? ['과다', 'ng'] : (over >= 1.2) ? ['여유', 'mid'] : ['적정', 'ok'];
    return '<div class="tile tile-wide">' +
      '<div class="tile-label">적치가능율 <span class="badge sm ' + band[1] + '">' +
        band[0] + '</span></div>' +
      '<div class="tile-value">' + Math.round(r.value * 100) +
        '<span class="tile-unit">%</span></div>' +
      '<div class="tile-sub">' + esc(r.formula) + '<br>' + esc(r.substitution) + '</div>' +
      '<div class="tile-sub">기준 ' + Math.round(floor * 100) + '% (= 1 ÷ 운영효율) 의 ' +
        over.toFixed(1) + '배 — 설비를 가득 채웠을 때 담기는 양</div>' +
      '</div>';
  }

  const api = {
    holdNote: holdNote,
    esc: esc, num: num, numberField: numberField, selectField: selectField,
    grouped: grouped, parseNum: parseNum,
    traceCell: traceCell, resultTable: resultTable, warnBox: warnBox, statTile: statTile, stackTile: stackTile
  };
  global.RSD = global.RSD || {};
  global.RSD.controls = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
