const assert = require('assert');
const e3 = require('../js/rsd-equip3d.js');

function near(a, b, tol, label) {
  assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} vs ${b} (허용 ±${tol})`);
}

// stepAnimation 은 THREE 없이도 도는 순수 로직이다 (position/rotation 만 건드린다)
function fake() { return { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }; }

// ===== travel: 사인 왕복 =====
{
  const o = fake();
  const list = [{ obj: o, anim: { kind: 'travel', axis: 'x', center: 100, range: 400, period: 20, phase: 0 } }];

  e3.stepAnimation(list, 0);
  near(o.position.x, 100, 0.001, 't=0 은 중앙');

  e3.stepAnimation(list, 5);          // 1/4 주기 → sin(π/2) = 1
  near(o.position.x, 300, 0.001, '1/4 주기에 +range/2');

  e3.stepAnimation(list, 15);         // 3/4 주기 → sin(3π/2) = −1
  near(o.position.x, -100, 0.001, '3/4 주기에 −range/2');

  e3.stepAnimation(list, 20);         // 1주기 → 원위치
  near(o.position.x, 100, 0.001, '1주기 후 원위치');

  // 주행 범위를 벗어나지 않는다
  for (let t = 0; t < 40; t += 0.37) {
    e3.stepAnimation(list, t);
    assert.ok(o.position.x >= -100.001 && o.position.x <= 300.001,
      '주행 범위 이탈: ' + o.position.x);
  }
}

// ===== spin: 등각속도 =====
{
  const o = fake();
  const list = [{ obj: o, anim: { kind: 'spin', axis: 'x', speed: 2 } }];
  e3.stepAnimation(list, 0);
  near(o.rotation.x, 0, 0.001, 't=0');
  e3.stepAnimation(list, 3);
  near(o.rotation.x, 6, 0.001, '각속도 2 rad/s × 3s');
}

// ===== slew: 기준각 중심 왕복 =====
{
  const o = fake();
  const list = [{ obj: o, anim: { kind: 'slew', axis: 'y', base: 0.2, amp: 0.1, period: 8 } }];
  e3.stepAnimation(list, 0);
  near(o.rotation.y, 0.2, 0.001, 't=0 은 기준각');
  e3.stepAnimation(list, 2);
  near(o.rotation.y, 0.3, 0.001, '1/4 주기에 +amp');
  for (let t = 0; t < 20; t += 0.31) {
    e3.stepAnimation(list, t);
    assert.ok(o.rotation.y >= 0.0999 && o.rotation.y <= 0.3001, '슬루 범위 이탈');
  }
}

// ===== flow: 벨트 위를 흐르다 반대편으로 되감김 =====
{
  const o = fake();
  const list = [{ obj: o, anim: { kind: 'flow', axis: 'x', len: 600, speed: 30, start: 0 } }];
  e3.stepAnimation(list, 0);
  near(o.position.x, -300, 0.001, '시작은 벨트 뒤끝');
  e3.stepAnimation(list, 10);        // 300 m 이동
  near(o.position.x, 0, 0.001, '중앙');
  e3.stepAnimation(list, 20);        // 600 m → 되감김
  near(o.position.x, -300, 0.001, '한 바퀴 돌면 뒤끝으로 되감긴다');

  // 항상 벨트 길이 안에 머문다
  for (let t = 0; t < 120; t += 0.7) {
    e3.stepAnimation(list, t);
    assert.ok(o.position.x >= -300.001 && o.position.x <= 300.001, '벨트 이탈');
  }
}

// ===== 알 수 없는 kind 는 조용히 무시 =====
{
  const o = fake();
  e3.stepAnimation([{ obj: o, anim: { kind: 'nope' } }], 5);
  assert.strictEqual(o.position.x, 0);
}

console.log('OK: anim');
