const assert = require('assert');
const xp = require('../js/rsd-export.js');
const app = require('../js/rsd-app.js');

// ===== CSV 한 칸 =====
{
  assert.strictEqual(xp.csvCell('야드'), '야드');
  assert.strictEqual(xp.csvCell(123.45), '123.45');
  assert.strictEqual(xp.csvCell(''), '');
  assert.strictEqual(xp.csvCell(null), '');
  // 쉼표·따옴표·줄바꿈이 있으면 감싼다 — 안 감싸면 열이 밀린다
  assert.strictEqual(xp.csvCell('a,b'), '"a,b"');
  assert.strictEqual(xp.csvCell('그는 "말했다"'), '"그는 ""말했다"""');
  assert.strictEqual(xp.csvCell('첫줄\n둘째줄'), '"첫줄\n둘째줄"');
}

// ===== CSV 전체 =====
{
  const csv = xp.toCsv([['항목', '값'], ['적치폭', 43]]);
  // 엑셀이 한글을 cp949 로 오인하지 않도록 BOM 을 붙인다
  assert.strictEqual(csv.charCodeAt(0), 0xFEFF, 'BOM 이 있어야 엑셀에서 한글이 안 깨진다');
  assert.ok(csv.indexOf('항목,값\r\n적치폭,43') > 0, 'CRLF 로 줄을 나눈다');
}

// ===== 계산서 행: res 의 식·대입·출처까지 옮긴다 =====
{
  const state = app.initialState();
  const r = app.recompute(state);
  const d = r.materials.ironOre.demand;
  const rows = xp.sheetRows('철광석', [
    { label: '일일 사용량', res: d.daily },
    { label: '대상 저장용량', res: d.targetCapacity }
  ]);
  assert.deepStrictEqual(rows[0], ['철광석']);
  assert.deepStrictEqual(rows[1], ['항목', '값', '단위', '계산식', '대입', '출처']);
  assert.strictEqual(rows[2][0], '일일 사용량');
  assert.strictEqual(rows[2][1], d.daily.value);
  assert.ok(rows[2][3].length > 0, '계산식이 실려야 한다');
  assert.ok(rows[2][4].length > 0, '대입값이 실려야 한다');
}

// ===== 파일명 =====
{
  assert.strictEqual(xp.safeName('평면도'), '평면도');
  assert.strictEqual(xp.safeName('철광석 / 평면도'), '철광석___평면도');
  assert.strictEqual(xp.safeName('a:b*c?d"e<f>g|h'), 'a_b_c_d_e_f_g_h');
  assert.ok(/^\d{8}-\d{4}$/.test(xp.stamp(new Date(2026, 7, 2, 9, 5))), 'stamp 형식');
  assert.strictEqual(xp.stamp(new Date(2026, 7, 2, 9, 5)), '20260802-0905');
}

// ===== 시나리오 저장 → 불러오기 왕복 =====
{
  const state = app.initialState();
  state.materials.coal.stockDays = 45;
  state.yard.yardLength = 900;
  const json = xp.stateToJson(state);
  const back = xp.jsonToState(json);
  assert.strictEqual(back.ok, true, '자기가 저장한 파일은 열려야 한다');
  assert.strictEqual(back.state.materials.coal.stockDays, 45);
  assert.strictEqual(back.state.yard.yardLength, 900);
  // 되살린 상태로 계산해도 같은 결과가 나온다
  const a = app.recompute(state).totals.area;
  const b = app.recompute(back.state).totals.area;
  assert.strictEqual(a, b, '왕복 후에도 계산 결과가 같아야 한다');
}

// ===== 불러오기 방어 — 아무 JSON 이나 상태로 앉히면 화면이 통째로 깨진다 =====
{
  assert.strictEqual(xp.jsonToState('이건 JSON이 아님').ok, false);
  assert.ok(/JSON 형식/.test(xp.jsonToState('{{{').error));

  const alien = JSON.stringify({ kind: 'something-else', state: {} });
  assert.strictEqual(xp.jsonToState(alien).ok, false);
  assert.ok(/저장한 파일이 아닙/.test(xp.jsonToState(alien).error));

  const broken = JSON.stringify({ kind: 'rsd-scenario', state: { materials: {} } });
  const r = xp.jsonToState(broken);
  assert.strictEqual(r.ok, false, '필수 항목이 빠진 파일은 거절한다');
  assert.ok(/필수 항목/.test(r.error));
}

// ===== 저장 파일에 형식 표시와 시각이 들어간다 =====
{
  const o = JSON.parse(xp.stateToJson(app.initialState()));
  assert.strictEqual(o.kind, 'rsd-scenario');
  assert.strictEqual(o.version, 1);
  assert.ok(o.savedAt && !isNaN(Date.parse(o.savedAt)), '저장 시각이 있어야 한다');
}

// ===== 옛 저장파일도 열린다 (깊은 병합) =====
// 형식은 그대로인데 나중에 추가된 항목이 없는 파일 — 실제로 생긴다.
// 얕게 덮으면 materials 가 통째로 갈려서 원료별 파일 수가 undefined 가 되고
// 입력칸에 "undefined" 가 뜬다.
{
  const older = app.initialState();
  Object.keys(older.materials).forEach(function (k) {
    delete older.materials[k].pileCount;
    delete older.materials[k].pileGap;
  });
  delete older.master;
  delete older.shed.sizingMode;
  older.yard.yardLength = 888;                 // 저장된 값은 살아야 한다

  const r = xp.jsonToState(JSON.stringify({ kind: 'rsd-scenario', version: 1, state: older }));
  assert.strictEqual(r.ok, true);

  const store = app.createStore(app.initialState());
  store.replace(r.state);
  const st = store.get();

  assert.strictEqual(st.yard.yardLength, 888, '저장된 값은 그대로 살아야 한다');
  assert.strictEqual(st.materials.ironOre.pileCount, 10, '빠진 항목은 기본값으로 메운다');
  assert.strictEqual(st.shed.sizingMode, 'grow');
  assert.ok(st.master && st.master.perimeterRoad > 0, '통째로 빠진 묶음도 메운다');

  const res = app.recompute(st);
  assert.ok(isFinite(res.totals.area) && res.totals.area > 0, '옛 파일로도 계산이 된다');
  // 화면 입력칸에 undefined 가 뜨지 않는가
  const uiYard = require('../js/rsd-ui-yard.js');
  const html = uiYard.renderResult(st, res);
  assert.ok(html.indexOf('value="undefined"') < 0, '입력칸에 undefined 가 뜨면 안 된다');
}

// ===== 깊은 병합 규칙 =====
{
  const merged = app.deepMerge(
    { a: 1, b: { c: 2, d: 3 }, arr: [1, 2, 3] },
    { b: { c: 9 }, arr: [7], extra: 5 }
  );
  assert.strictEqual(merged.a, 1, '없는 값은 기본값 유지');
  assert.strictEqual(merged.b.c, 9, '있는 값은 덮어쓴다');
  assert.strictEqual(merged.b.d, 3, '중첩된 곳도 메운다');
  // 배열은 원소별로 섞지 않는다 — 셀 6개 + 기본 8개 = 8개 같은 사고를 막는다
  assert.deepStrictEqual(merged.arr, [7], '배열은 통째로 교체');
  assert.strictEqual(merged.extra, 5, '불러온 쪽에만 있는 항목도 살린다');
}

// ===== 내보내기 배율 =====
// 도면 좌표는 미터 단위라 viewBox 폭이 60일 수도, 1500일 수도 있다.
// 배율을 고정하면 단면도가 129 px 짜리 쓸모없는 그림이 된다.
{
  // 가로가 기준 — 결과 폭이 항상 TARGET_W
  const wide = xp.fitScale({ width: 800, height: 300 });
  assert.ok(Math.abs(800 * wide - xp.TARGET_W) < 1e-6, '가로가 목표 폭이 되어야 한다');

  // 아주 좁은 도면(단면도)도 같은 폭으로 커진다
  const narrow = xp.fitScale({ width: 57, height: 23 });
  assert.ok(Math.abs(57 * narrow - xp.TARGET_W) < 1e-6, '작은 도면도 목표 폭까지 키운다');
  assert.ok(narrow > 40, '단면도는 40배 넘게 키워야 쓸 만해진다');

  // 세로로 긴 도면은 높이 상한에 걸린다 (거대한 PNG 방지)
  const tall = xp.fitScale({ width: 100, height: 400 });
  assert.ok(400 * tall <= xp.MAX_H + 1e-6, '세로 상한을 넘지 않는다');
  assert.ok(100 * tall < xp.TARGET_W, '세로에 걸리면 가로는 목표보다 작아진다');

  // 0 방어
  assert.ok(isFinite(xp.fitScale({ width: 0, height: 0 })), '0 크기에도 유한한 배율');
}

console.log('OK: export');
