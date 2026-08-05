const assert = require('assert');
const app = require('../js/rsd-app.js');
const uiYard = require('../js/rsd-ui-yard.js');
const uiFac = require('../js/rsd-ui-facility.js');

// 입력 방어 — 0·음수·문자가 계산 엔진까지 내려가면 예외가 나고 화면이 죽는다.
// 상태는 localStorage 에 자동 저장되므로 한 번 들어간 잘못된 값은
// 새로고침해도 되살아난다. 그래서 두 겹으로 막는다:
//   ① 입력 단에서 min 으로 자르고  ② 불러온 상태를 sanitize 로 되돌린다.

// 화면이 실제로 뿌리는 min 을 읽어 온다 — 코드에 적힌 값과 어긋나면 의미가 없다
function minsOf(html) {
  const out = {};
  const re = /data-path="([^"]+)"([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[2];
    const mm = attrs.match(/\bmin="([^"]*)"/) || attrs.match(/data-min="([^"]*)"/);
    if (mm) out[m[1]] = Number(mm[1]);
  }
  return out;
}

// 입력 처리기와 같은 규칙 (rsd-app.js 의 change 처리)
function clamp(raw, min) {
  const n = Number(raw);
  if (!isFinite(n)) return null;            // 문자 → 이전 값 유지
  return (min !== undefined && isFinite(min)) ? Math.max(min, n) : n;
}

// ===== 0 을 넣으면 계산이 깨지는 칸에 0 이 허용되면 안 된다 =====
{
  const state = app.initialState();
  const result = app.recompute(state);
  const html = uiYard.renderInputs(state, result) +
    uiFac.renderShedInputs(state, result) +
    uiFac.renderSiloInputs(state, result);
  const mins = minsOf(html);

  ['yard.operatingEff', 'shed.operatingEff', 'silo.operatingEff'].forEach(function (p) {
    assert.ok(mins[p] !== undefined, p + ' 에 min 이 있어야 한다');
    assert.ok(mins[p] > 0, p + ' 의 min 은 0보다 커야 한다 (현재 ' + mins[p] + ') — ' +
      '운영효율 0 은 0 나눗셈이라 계산이 성립하지 않는다');
    assert.strictEqual(clamp(0, mins[p]), mins[p], p + ': 0 을 넣어도 min 으로 잘려야 한다');
    assert.strictEqual(clamp(-5, mins[p]), mins[p], p + ': 음수도 min 으로 잘려야 한다');
  });
  // 문자는 값을 바꾸지 않는다
  assert.strictEqual(clamp('abc', 0.01), null, '문자는 반영하지 않는다');
}

// ===== 잘린 값으로는 계산이 실제로 성립하는가 =====
{
  const s = app.initialState();
  [0.01, 0.5, 1].forEach(function (eff) {
    ['yard', 'shed', 'silo'].forEach(function (t) {
      const st = app.initialState();
      st[t].operatingEff = eff;
      assert.doesNotThrow(function () { app.recompute(st); },
        t + ' 운영효율 ' + eff + ' 에서 계산이 터지면 안 된다');
    });
  });
  assert.ok(app.recompute(s).totals.area > 0);
}

// ===== 이미 저장된 잘못된 값은 sanitize 가 되돌린다 =====
// 입력 단만 막으면 옛 localStorage 에 남은 0 을 구제할 수 없다.
{
  const seed = app.initialState();
  const poisoned = JSON.parse(JSON.stringify(seed));
  poisoned.yard.operatingEff = 0;
  poisoned.shed.operatingEff = -3;
  poisoned.silo.operatingEff = NaN;
  poisoned.operatingDays = 0;

  const fixed = app.sanitize(poisoned, seed);
  assert.strictEqual(fixed.yard.operatingEff, seed.yard.operatingEff, '적치효율 복구');
  assert.strictEqual(fixed.shed.operatingEff, seed.shed.operatingEff, 'Shed 운영효율 복구');
  assert.strictEqual(fixed.silo.operatingEff, seed.silo.operatingEff, 'Silo 운영효율 복구');
  assert.strictEqual(fixed.operatingDays, seed.operatingDays, '가동일수 복구');
  assert.doesNotThrow(function () { app.recompute(fixed); }, '복구 후에는 계산이 된다');
}

// ===== 멀쩡한 값은 건드리지 않는다 =====
{
  const seed = app.initialState();
  const s = JSON.parse(JSON.stringify(seed));
  s.yard.operatingEff = 0.62;
  s.operatingDays = 350;
  const out = app.sanitize(s, seed);
  assert.strictEqual(out.yard.operatingEff, 0.62, '정상값은 그대로');
  assert.strictEqual(out.operatingDays, 350, '정상값은 그대로');
}

// ===== 불러오기 경로가 sanitize 를 태우는가 =====
// store.replace 는 불러오기·자동복원·시나리오 되돌리기가 모두 지나는 길목이다.
{
  const store = app.createStore(app.initialState());
  const bad = JSON.parse(JSON.stringify(app.initialState()));
  bad.shed.operatingEff = 0;
  store.replace(bad);
  assert.ok(store.get().shed.operatingEff > 0, '불러온 상태의 0 이 복구돼야 한다');
  assert.doesNotThrow(function () { app.recompute(store.get()); },
    '불러온 뒤에도 계산이 된다');
}

console.log('OK: input-guard');
