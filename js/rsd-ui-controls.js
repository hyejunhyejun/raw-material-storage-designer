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

  function statTile(o) {
    const sub = o.sub ? '<div class="tile-sub">' + esc(o.sub) + '</div>' : '';
    return '<div class="tile">' +
      '<div class="tile-label">' + esc(o.label) + '</div>' +
      '<div class="tile-value">' + num(o.value) +
      '<span class="tile-unit">' + esc(o.unit || '') + '</span></div>' +
      sub + '</div>';
  }

  const api = {
    esc: esc, num: num, numberField: numberField, selectField: selectField,
    grouped: grouped, parseNum: parseNum,
    traceCell: traceCell, resultTable: resultTable, warnBox: warnBox, statTile: statTile
  };
  global.RSD = global.RSD || {};
  global.RSD.controls = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
