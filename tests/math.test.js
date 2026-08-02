const assert = require('assert');
const m = require('../js/rsd-math.js');

function near(actual, expected, tolPct, label) {
  const diff = Math.abs(actual - expected);
  const tol = Math.abs(expected) * tolPct / 100;
  assert.ok(diff <= tol,
    `${label}: 계산 ${actual} vs 기대 ${expected} — 오차 ${(diff / Math.abs(expected) * 100).toFixed(4)}% > 허용 ${tolPct}%`);
}

// tan — 도 단위
near(m.tan(45), 1, 0.0001, 'tan(45°)');
near(m.tan(35), 0.7002075, 0.0001, 'tan(35°)');
assert.ok(Math.abs(m.tan(0)) < 1e-12, 'tan(0°)은 0이어야 한다');

// 파일 높이 — 적치폭 41 m, 안식각 35° → 14.354 m
near(m.pileHeight(41, 35), 14.354255, 0.001, '파일높이');

// 삼각기둥 부피 — 직선구간: 폭 41 × 높이 14.354255 × 길이 351
near(m.prismVolume(41, 14.354255, 351), 103286.04, 0.01, '삼각기둥 부피');

// 원뿔 부피 — 반경 20.5 × 높이 14.354255
near(m.coneVolume(20.5, 14.354255), 6317.089, 0.01, '원뿔 부피');

// 체적 검산 — 이 두 함수의 합이 예시 야드 A 골든값을 재현하는지
{
  const G = m.pileHeight(41, 35);
  const N = m.prismVolume(41, G, 351) + 9 * m.coneVolume(20.5, G);
  near(N, 160140, 0.01, '최대 적치체적 (골든값)');
}

console.log('OK: math');
