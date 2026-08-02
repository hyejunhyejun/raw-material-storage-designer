const assert = require('assert');
const h = require('../js/rsd-draw2d-help.js');

// 도해는 "이 입력이 도면의 어디를 가리키는가"를 설명해야 한다.
// 새 판의 규칙: **도면 위에는 기호만, 이름은 오른쪽 범례**.
// 그래서 이름은 범례에 있어야 하고, 기호는 배지/치수로 도형 위에 있어야 한다.

const SHEETS = {
  '야드 평면': h.drawYardHelp(),
  '야드 단면': h.drawYardSectionHelp(),
  'Shed 단면': h.drawShedHelp(),
  'Shed 평면': h.drawShedPlanHelp(),
  'Silo 평면': h.drawSiloPlanHelp(),
  'Silo 입면': h.drawSiloElevHelp()
};

// ===== 파라미터 이름이 빠짐없이 등장한다 =====
const NEEDS = {
  '야드 평면': ['야드 길이', '정비공간', '적치길이', '야드 폭', '차량 통행로', '적치폭',
                '파일 수', '파일간 간격'],
  '야드 단면': ['적치높이', '안식각', '적치폭', '야드 폭'],
  'Shed 단면': ['La', 'Lb', '하부 경사각', '중앙 옹벽', '개방측 여유', '전고', 'bay 폭',
                '개방측 삼각형', '옹벽측 사다리꼴', '하부 쐐기'],
  'Shed 평면': ['정비존', '셀 길이', '격벽 두께', '총 길이', 'bay 1', 'bay 2'],
  'Silo 평면': ['내부 직경', '중심간격', '순이격', '점유 폭', 'Corridor'],
  'Silo 입면': ['전체 높이', '공급 B/C', '불출 B/C', 'Tripper', 'RDM']
};
Object.keys(NEEDS).forEach(function (name) {
  NEEDS[name].forEach(function (t) {
    assert.ok(SHEETS[name].indexOf(t) >= 0, name + ' 도해에 "' + t + '" 표기 필요');
  });
});

// ===== 기호는 배지 또는 치수로 도형 위에 있다 =====
// 기호가 범례에만 있고 도형에 없으면 "어디를 가리키는지"를 알 수 없다.
function symbolsOn(svg) {
  // 도형 구역(x < 700)에 찍힌 한두 글자짜리 텍스트만 모은다
  const out = [];
  const re = /<text([^>]*)>([^<]{1,2})<\/text>/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    const xm = m[1].match(/\sx="([\d.]+)"/);
    if (xm && Number(xm[1]) < 700) out.push(m[2]);
  }
  return out;
}
const SYMS = {
  '야드 평면': ['A', 'B', 'C', 'D', 'E', 'F', 'I', 'J'],
  '야드 단면': ['D', 'E', 'F', 'G', 'H'],
  'Shed 단면': ['a', 'b', 'c', 'B', 'H', 'W', 'θ', '①', '②', '③'],
  'Shed 평면': ['L', 'M', 'S', 'T', 'G', '1', '2'],
  'Silo 평면': ['1', '2', '3', '4', '5'],
  'Silo 입면': ['6', '7', '8']
};
Object.keys(SYMS).forEach(function (name) {
  const syms = symbolsOn(SHEETS[name]);
  SYMS[name].forEach(function (s) {
    assert.ok(syms.indexOf(s) >= 0, name + ' 도형에 기호 "' + s + '" 가 있어야 한다');
  });
});

// ===== 지시선을 쓰지 않는다 =====
// 지시선이 도형을 가로지르면 그 자체가 소음이다. 기호는 배지로 직접 얹는다.
Object.keys(SHEETS).forEach(function (name) {
  assert.ok(SHEETS[name].indexOf('hlp-note') < 0,
    name + ': 지시선(hlp-note) 없이 배지로 표기해야 한다');
});

// ===== 라벨이 좌표계 밖으로 넘치지 않는다 =====
// 글자 폭은 한글 ≈ 1.0em, 그 외 ≈ 0.55em 로 어림한다.
function textWidth(str, fs) {
  let w = 0;
  for (const ch of str) w += (/[가-힣]/.test(ch) ? 1.0 : 0.55) * fs;
  return w;
}

function checkBounds(svg, name) {
  const vb = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  assert.ok(vb, name + ': viewBox 형식');
  const VW = Number(vb[1]), VH = Number(vb[2]);
  assert.strictEqual(VW, 1000, name + ': 모든 도해는 가로 1000 좌표계를 쓴다');

  const re = /<text[^>]*\sx="(-?[\d.]+)"[^>]*\sy="(-?[\d.]+)"[^>]*font-size="([\d.]+)"[^>]*text-anchor="(\w+)"[^>]*>([^<]*)</g;
  let m, n = 0;
  while ((m = re.exec(svg)) !== null) {
    n++;
    const x = Number(m[1]), y = Number(m[2]), fs = Number(m[3]);
    const anchor = m[4], txt = m[5];
    const w = textWidth(txt, fs);
    let left = x, right = x;
    if (anchor === 'middle') { left = x - w / 2; right = x + w / 2; }
    else if (anchor === 'end') { left = x - w; }
    else { right = x + w; }

    assert.ok(left >= -2, name + ': "' + txt + '" 왼쪽 넘침 (' + left.toFixed(0) + ')');
    assert.ok(right <= VW + 2, name + ': "' + txt + '" 오른쪽 넘침 (' + right.toFixed(0) + ' > ' + VW + ')');
    assert.ok(y >= 0 && y <= VH, name + ': "' + txt + '" 세로 넘침 (y=' + y + ', H=' + VH + ')');
  }
  assert.ok(n >= 6, name + ': 라벨이 충분히 있어야 한다 (현재 ' + n + ')');
}
Object.keys(SHEETS).forEach(function (name) { checkBounds(SHEETS[name], name); });

// ===== 도형 구역과 범례 구역이 겹치지 않는다 =====
// 도형은 x 120…660, 범례는 x 700 부터. 이 경계가 무너지면 다시 지저분해진다.
Object.keys(SHEETS).forEach(function (name) {
  const svg = SHEETS[name];
  const re = /<text class="hlp-l(?:name|note)"[^>]*\sx="([\d.]+)"/g;
  let m, cnt = 0;
  while ((m = re.exec(svg)) !== null) {
    cnt++;
    assert.ok(Number(m[1]) >= 700, name + ': 범례 글씨가 도형 구역을 침범 (x=' + m[1] + ')');
  }
  assert.ok(cnt >= 3, name + ': 범례 항목이 있어야 한다');
});

// ===== 글씨 크기는 전 도해에서 하나로 통일 =====
{
  const all = Object.keys(SHEETS).map(function (k) { return SHEETS[k]; }).join('');
  const sizes = (all.match(/font-size="([\d.]+)"/g) || [])
    .map(function (t) { return t.match(/[\d.]+/)[0]; })
    .filter(function (v, i, a) { return a.indexOf(v) === i; });
  assert.strictEqual(sizes.length, 1,
    '도해 글씨 크기가 여러 개다: ' + sizes.join(', ') + ' — 좌표계가 통일되면 하나여야 한다');
  assert.strictEqual(Number(sizes[0]), h.FS);
}

// ===== drawSiloHelp 은 평면·입면 두 장을 이어 준다 =====
{
  const both = h.drawSiloHelp();
  assert.strictEqual((both.match(/<svg/g) || []).length, 2, 'Silo 도해는 평면·입면 2장');
  assert.ok(both.indexOf('hlp-silo-plan') >= 0 && both.indexOf('hlp-silo-elev') >= 0);
}

console.log('OK: draw2d-help');
