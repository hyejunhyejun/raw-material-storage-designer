const assert = require('assert');
const d2 = require('../js/rsd-draw2d.js');

function near(actual, expected, tol, label) {
  assert.ok(Math.abs(actual - expected) <= tol,
    `${label}: ${actual} vs ${expected} (허용 ±${tol})`);
}

// 시험용 야드 형상
const G1 = { A: 750, B: 40, D: 47, E: 4, I: 8, J: 5, C: 710, F: 43, rows: 1, srBandWidth: 10 };

// ===== 파일 개수가 입력과 일치하는가 (고정 삽화가 아님을 보장) =====
{
  const g = d2.yardPlanGeometry(G1);
  assert.strictEqual(g.piles.length, 8, '파일 8개 입력 → 8개 생성');

  const g12 = d2.yardPlanGeometry(Object.assign({}, G1, { I: 12 }));
  assert.strictEqual(g12.piles.length, 12, '파일 12개 입력 → 12개 생성');
}

// ===== 파일 점유가 적치길이 C 를 정확히 채우는가 =====
{
  const g = d2.yardPlanGeometry(G1);
  const first = g.piles[0];
  const last = g.piles[g.piles.length - 1];
  near(first.x, G1.B / 2, 0.001, '첫 파일은 정비공간 절반 뒤에서 시작');
  near(last.x + last.w, G1.B / 2 + G1.C, 0.001, '마지막 파일 끝 = 정비공간½ + 적치길이');
  // 양 끝 여백이 대칭인가
  near(G1.A - (last.x + last.w), G1.B / 2, 0.001, '오른쪽 여백 = 정비공간 절반');
}

// ===== 파일 1개 점유 길이 = (C − (I−1)J) / I =====
{
  const g = d2.yardPlanGeometry(G1);
  const expected = (G1.C - (G1.I - 1) * G1.J) / G1.I;   // (710 − 35) / 8 = 84.375
  near(g.piles[0].w, expected, 0.001, '파일 1개 점유 길이');
  near(g.piles[0].w, 84.375, 0.001, '파일 1개 점유 길이 84.375 m');
}

// ===== 파일 간격이 J 인가 =====
{
  const g = d2.yardPlanGeometry(G1);
  const gap = g.piles[1].x - (g.piles[0].x + g.piles[0].w);
  near(gap, G1.J, 0.001, '파일 사이 간격 = J');
}

// ===== 파일 형상: 폭 방향으로 적치폭 F, 스타디움 반경 F/2 =====
{
  const g = d2.yardPlanGeometry(G1);
  near(g.piles[0].h, G1.F, 0.001, '파일 높이 = 적치폭 F');
  near(g.piles[0].rx, G1.F / 2, 0.001, '스타디움 반경 = F/2');
  // 차량 통행로는 양측 E/2 씩이므로 파일은 야드 중앙에 놓인다
  near(g.piles[0].y, G1.E / 2, 0.001, '파일 상단 = 위쪽 통행로 폭 E/2');
  near(g.piles[0].y + g.piles[0].h, G1.D - G1.E / 2, 0.001,
    '파일 하단 = 야드폭 − 아래쪽 통행로 폭 E/2');
  // 파일 중심 = 야드 중심
  near(g.piles[0].y + g.piles[0].h / 2, G1.D / 2, 0.001, '파일 중심 = 야드 중심');
}

// ===== 차량 통행로는 양측 2 m 씩 = 합계 4 m =====
// 한쪽에 4 m 를 몰아 그리면 파일이 야드 한쪽으로 치우쳐 실제 배치와 다르다.
{
  const g = d2.yardPlanGeometry(G1);
  near(g.roadHalf, 2, 0.001, '통행로 한쪽 = E ÷ 2');
  const svg = d2.drawYardPlan(G1);
  assert.strictEqual((svg.match(/class="road"/g) || []).length, 2,
    '1열 평면도에 통행로가 위·아래 2개 그려진다');
  const sec = d2.drawYardSection({ D: 47, E: 4, F: 43, G: 15.62, repose: 36 });
  assert.strictEqual((sec.match(/class="road"/g) || []).length, 2,
    '단면도에도 통행로가 좌·우 2개');
}

// ===== 다열 배치: 캔버스와 각 열 위치 =====
{
  const g1 = d2.yardPlanGeometry(G1);
  near(g1.canvas.w, 750, 0.001, '캔버스 폭 = 야드 길이');
  // 1열이어도 이동기기 및 B/C 면적 띠가 하나 붙는다 (없으면 적치·불출 불가)
  near(g1.canvas.h, 57, 0.001, '1열 = 야드폭 47 + 이동기기 띠 10');
  assert.deepStrictEqual(g1.rowsY, [0]);
  assert.deepStrictEqual(g1.bandsY, [47], '띠는 야드 아래');
  assert.strictEqual((d2.drawYardPlan(G1).match(/class="sr-band"/g) || []).length, 1,
    '1열이어도 이동기기 띠가 그려진다');

  const g3 = d2.yardPlanGeometry(Object.assign({}, G1, { rows: 3 }));
  // 47 × 3 + 10 × 2 = 161
  near(g3.canvas.h, 161, 0.001, '3열 캔버스 높이 = 야드폭×3 + S/R띠×2');
  assert.deepStrictEqual(g3.rowsY, [0, 57, 114], '각 열의 y 시작 위치');
  assert.deepStrictEqual(g3.bandsY, [47, 104], '띠는 야드 사이');
  assert.strictEqual(g3.piles.length, 8 * 3, '3열이면 파일도 3배');
}

// ===== 평면도 SVG =====
{
  const svg = d2.drawYardPlan(G1);
  assert.ok(/^<svg/.test(svg.trim()), 'svg 요소로 시작');
  assert.ok(/viewBox=/.test(svg), 'viewBox가 있어야 한다');
  // 파일 8개가 rect 로 그려지는가
  assert.strictEqual((svg.match(/class="pile"/g) || []).length, 8, '파일 8개가 그려져야 한다');
  assert.ok(/class="road"/.test(svg), '차량통행로가 그려져야 한다');
  assert.ok(/class="yard-outline"/.test(svg), '야드 외곽선이 그려져야 한다');
  assert.ok(/750/.test(svg), '야드 길이 치수가 표기되어야 한다');
}

// ===== 다열 평면도에 S/R 띠가 그려지는가 =====
{
  const svg = d2.drawYardPlan(Object.assign({}, G1, { rows: 3 }));
  assert.strictEqual((svg.match(/class="sr-band"/g) || []).length, 2, '3열이면 S/R 띠 2개');
  assert.strictEqual((svg.match(/class="pile"/g) || []).length, 24, '3열 × 8파일');
}

// ===== 단면도 =====
{
  const svg = d2.drawYardSection({ D: 47, E: 4, F: 43, G: 15.62, repose: 36 });
  assert.ok(/^<svg/.test(svg.trim()));
  assert.ok(/class="pile-section"/.test(svg), '파일 단면 삼각형이 그려져야 한다');
  assert.ok(/36/.test(svg), '안식각이 표기되어야 한다');
  assert.ok(/15\.6/.test(svg), '파일 높이가 표기되어야 한다');
  assert.ok(/class="ground"/.test(svg), '지반선이 그려져야 한다');
}

// ===== 단면 삼각형 좌표가 실제 기하와 맞는가 =====
{
  const svg = d2.drawYardSection({ D: 47, E: 4, F: 43, G: 15.62, repose: 36 });
  // 통행로가 양측 E/2 씩이므로
  //   삼각형: 좌하(E/2, G) 정점(D/2, 0) 우하(D − E/2, G)
  const m = svg.match(/class="pile-section"[^>]*points="([^"]+)"/);
  assert.ok(m, 'polygon points 속성이 있어야 한다');
  const pts = m[1].trim().split(/\s+/).map(p => p.split(',').map(Number));
  near(pts[0][0], 2, 0.01, '좌하 x = 왼쪽 통행로 폭 E/2');
  near(pts[0][1], 15.62, 0.01, '좌하 y = 파일 높이(지반)');
  near(pts[1][0], 47 / 2, 0.01, '정점 x = 야드 폭의 중앙');
  near(pts[1][1], 0, 0.01, '정점 y = 0 (최상단)');
  near(pts[2][0], 45, 0.01, '우하 x = D − E/2');
  // 밑변 길이가 곧 적치폭 F
  near(pts[2][0] - pts[0][0], 43, 0.01, '밑변 = 적치폭 F = D − E');
}

// ===== 성립 불가 배치 표시 =====
// 파일 1개 점유폭이 적치폭보다 좁으면 양끝 원뿔조차 들어가지 못한다.
// 도면이 정상 배치처럼 보이면 안 된다.
{
  const ok = d2.yardPlanGeometry(G1);
  assert.strictEqual(ok.invalid, false, '정상 형상은 invalid가 아니다');
  assert.strictEqual(ok.piles[0].invalid, false);
  assert.ok(!/invalid/.test(d2.drawYardPlan(G1)), '정상 도면에는 invalid 표시가 없다');

  // 야드 425 m, 파일 10개 → 적치길이 385, span = (385−45)/10 = 34 < 적치폭 43
  const bad = Object.assign({}, G1, { A: 425, C: 385, I: 10 });
  const g = d2.yardPlanGeometry(bad);
  assert.strictEqual(g.invalid, true, '점유폭 < 적치폭이면 성립 불가');
  assert.ok(g.piles.every(p => p.invalid), '모든 파일이 성립 불가로 표시된다');
  const svg = d2.drawYardPlan(bad);
  assert.ok(/class="pile invalid"/.test(svg), '도면에 invalid 클래스가 붙어야 한다');
  assert.ok(/성립 불가 배치/.test(svg), '도면에 경고 문구가 표기되어야 한다');
}

// ===== 0 입력 방어 =====
{
  const g = d2.yardPlanGeometry(Object.assign({}, G1, { I: 0 }));
  assert.strictEqual(g.piles.length, 0, '파일 0개면 빈 배열');
  const svg = d2.drawYardPlan(Object.assign({}, G1, { I: 0 }));
  assert.ok(/^<svg/.test(svg.trim()), '파일이 없어도 SVG는 생성된다');
}

// ===== 드래그 핸들 =====
{
  const svg = d2.drawYardPlan(G1);
  assert.ok(/class="drag-handle"/.test(svg), '길이 조정 드래그 핸들이 있어야 한다');
  assert.ok(/data-drag="yard\.yardLength"/.test(svg), '핸들은 조정 대상 경로를 알려야 한다');
  // 핸들은 야드 오른쪽 끝에 있어야 한다.
  // \s 앵커가 없으면 rx="..." 의 x= 를 잡으므로 주의.
  const m = svg.match(/class="drag-handle"[^>]*\sx="([\d.]+)"/);
  assert.ok(m, '핸들 x 좌표가 있어야 한다');
  near(Number(m[1]), G1.A - 4, 8, '핸들은 야드 오른쪽 끝 부근');
}

// ===== 드래그 환산 =====
{
  // 화면에서 1 m 가 2 px 인 축척에서 100 px 끌면 +50 m
  near(d2.handleDragDelta(750, 100, 2), 800, 0.001, '드래그 100px → +50m');
  near(d2.handleDragDelta(750, -100, 2), 700, 0.001, '반대로 끌면 감소');
  // 최소값 방어 — 0 이하로는 내려가지 않는다
  near(d2.handleDragDelta(50, -1000, 2), 10, 0.001, '최소 10 m 로 하한');
  // 1 m 단위로 반올림
  near(d2.handleDragDelta(750, 33, 2), 767, 0.001, '1 m 단위 반올림');
  // 축척이 0이면 원래 값 유지 (0 나눗셈 방어)
  near(d2.handleDragDelta(750, 100, 0), 750, 0.001, '축척 0이면 변화 없음');
}

console.log('OK: draw2d');
