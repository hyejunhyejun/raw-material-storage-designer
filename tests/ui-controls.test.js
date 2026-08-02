const assert = require('assert');
const c = require('../js/rsd-ui-controls.js');
const core = require('../js/rsd-core.js');

// ===== HTML 이스케이프 =====
assert.strictEqual(c.esc('<b>&"'), '&lt;b&gt;&amp;&quot;');
assert.strictEqual(c.esc('정상 텍스트'), '정상 텍스트');

// ===== 숫자 입력 필드 =====
{
  const h = c.numberField({ path: 'yard.yardLength', label: '야드 길이', value: 750, unit: 'm', step: 10 });
  assert.ok(/data-path="yard\.yardLength"/.test(h), 'data-path 속성이 있어야 한다');
  assert.ok(/type="number"/.test(h), 'number 입력이어야 한다');
  assert.ok(/value="750"/.test(h), '현재 값이 채워져야 한다');
  assert.ok(/step="10"/.test(h), 'step이 반영되어야 한다');
  assert.ok(/야드 길이/.test(h), '라벨이 있어야 한다');
  assert.ok(/>m</.test(h) || /m<\/span>/.test(h), '단위가 표시되어야 한다');
}

// ===== 라벨 이스케이프 =====
{
  const h = c.numberField({ path: 'x', label: '<script>', value: 1, unit: 'm' });
  assert.ok(!/<script>/.test(h), '라벨은 이스케이프되어야 한다');
}

// ===== 선택 필드 =====
{
  const h = c.selectField({
    path: 'materials.coal.storageType', label: '저장타입', value: 'silo',
    options: [{ value: 'yard', label: '오픈야드' }, { value: 'silo', label: 'Silo' }]
  });
  assert.ok(/data-path="materials\.coal\.storageType"/.test(h));
  assert.ok(/<select/.test(h));
  assert.ok(/value="silo"[^>]*selected|selected[^>]*value="silo"/.test(h), '현재 값이 선택되어야 한다');
  assert.ok(/오픈야드/.test(h) && /Silo/.test(h), '모든 선택지가 있어야 한다');
}

// ===== 계산근거 펼침 =====
{
  const r = core.res(90000, 't', '유효 적치량 Q = 최대 적치량 O × 적치효율 P',
    '= 120,000 × 0.75', '예시 야드 A 설계자료');
  const h = c.traceCell(r);
  assert.ok(/<details/.test(h), '네이티브 details를 써야 한다');
  assert.ok(/<summary/.test(h), 'summary가 있어야 한다');
  assert.ok(/90,000/.test(h), '값이 천단위 구분으로 표시되어야 한다');
  assert.ok(/유효 적치량 Q/.test(h), '식이 들어 있어야 한다');
  assert.ok(/120,000/.test(h), '대입값이 들어 있어야 한다');
  assert.ok(/예시 야드 A 설계자료/.test(h), '근거가 들어 있어야 한다');
  assert.ok(/t</.test(h), '단위가 표시되어야 한다');
}

// ===== 소수 자릿수: 정수는 소수점 없이, 소수는 1자리 =====
{
  assert.ok(/700\.8/.test(c.traceCell(core.res(700.78, 'm²', 'f', 's', 'src'))),
    '소수값은 소수 1자리로');
  assert.ok(/^(?!.*247\.0)/.test(c.traceCell(core.res(247, 'm', 'f', 's', 'src'))),
    '정수값에 불필요한 소수점을 붙이지 않는다');
}

// ===== 결과 표 =====
{
  const h = c.resultTable([
    { label: '적치길이 C', res: core.res(710, 'm', '식1', '대입1', '출처1') },
    { label: '적치폭 F', res: core.res(43, 'm', '식2', '대입2', '출처2') }
  ]);
  assert.ok(/<table/.test(h));
  assert.strictEqual((h.match(/<tr/g) || []).length, 2, '행 2개');
  assert.ok(/적치길이 C/.test(h) && /적치폭 F/.test(h));
  assert.ok(/식1/.test(h) && /식2/.test(h), '각 행에 계산근거가 붙어야 한다');
}

// ===== 경고 박스 =====
{
  assert.strictEqual(c.warnBox([]), '', '경고가 없으면 빈 문자열');
  const h = c.warnBox(['삼각파일 길이가 음수입니다', '두 번째 경고']);
  assert.ok(/삼각파일 길이가 음수입니다/.test(h));
  assert.ok(/두 번째 경고/.test(h));
  assert.strictEqual((h.match(/<li/g) || []).length, 2, '경고 2건');
}

// ===== 대형 수치 타일 =====
{
  const h = c.statTile({ label: '총 부지면적', value: 180720, unit: 'm²', sub: '44.66 acres' });
  assert.ok(/총 부지면적/.test(h));
  assert.ok(/180,720/.test(h), '천단위 구분');
  assert.ok(/m²/.test(h));
  assert.ok(/44\.66 acres/.test(h));
}

// ===== 자동 산정 필드는 잠근다 =====
// 서로를 결정하는 두 입력(셀 개수 ↔ 셀 길이)은 한쪽만 열려 있어야 혼동이 없다.
{
  const on = c.numberField({ path: 'shed.cellLength', label: '셀 길이', value: 37, unit: 'm' });
  assert.ok(!/disabled/.test(on), '기본은 활성');
  assert.ok(!/fld-off/.test(on));

  const off = c.numberField({ path: 'shed.cellLength', label: '셀 길이', value: 42.5, unit: 'm',
    disabled: true, disabledHint: '셀 개수에서 자동 산정' });
  assert.ok(/\sdisabled/.test(off), 'disabled 속성이 붙어야 한다');
  assert.ok(/fld-off/.test(off), '흐리게 표시할 클래스가 붙어야 한다');
  assert.ok(/셀 개수에서 자동 산정/.test(off), '왜 잠겼는지 알려야 한다');
  assert.ok(/value="42.5"/.test(off), '자동 산정된 값이 보여야 한다');
}

console.log('OK: ui-controls');

// ===== 천 단위 쉼표 =====
// 500만 t 을 '5000000' 으로 보여주면 자릿수를 셀 수 없다.
{
  assert.strictEqual(c.grouped(5000000), '5,000,000');
  assert.strictEqual(c.grouped(50000), '50,000');
  assert.strictEqual(c.grouped(750), '750');
  assert.strictEqual(c.grouped(1234.5), '1,234.5');

  // <input type="number"> 는 쉼표를 못 담으므로 text 로 바꾸고 표시를 남긴다
  const h = c.numberField({ path: 'materials.coal.annualUsage', label: '연간 사용량',
    value: 5000000, unit: 't/년', min: 0, group: true });
  assert.ok(/type="text"/.test(h), '쉼표 칸은 text 입력이어야 한다');
  assert.ok(/data-num="1"/.test(h), '숫자 칸임을 표시해야 읽는 쪽이 쉼표를 걷어낸다');
  assert.ok(/value="5,000,000"/.test(h), '쉼표가 찍힌 채로 보여야 한다');
  assert.ok(/inputmode="numeric"/.test(h), '모바일에서 숫자 자판이 뜨도록');

  // 평범한 칸은 그대로 number
  const h2 = c.numberField({ path: 'yard.yardLength', label: '야드 길이', value: 750, unit: 'm', step: 10, min: 0 });
  assert.ok(/type="number"/.test(h2));
  assert.ok(!/data-num/.test(h2));
}

// ===== 쉼표가 섞인 입력 되읽기 =====
{
  assert.strictEqual(c.parseNum('5,000,000'), 5000000);
  assert.strictEqual(c.parseNum('5000000'), 5000000);
  assert.strictEqual(c.parseNum(' 1,234.5 t '), 1234.5);
  assert.strictEqual(c.parseNum('-500'), -500);
  // 읽을 수 없으면 null — 부르는 쪽이 "0" 과 구분해서 이전 값을 지킬 수 있다
  assert.strictEqual(c.parseNum(''), null);
  assert.strictEqual(c.parseNum('abc'), null);
  assert.strictEqual(c.parseNum('-'), null);
  assert.strictEqual(c.parseNum('.'), null);
  assert.strictEqual(c.parseNum('0'), 0, '0 은 유효한 값이다');
}
