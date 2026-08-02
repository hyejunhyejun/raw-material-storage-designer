const assert = require('assert');
const uiYard = require('../js/rsd-ui-yard.js');
const app = require('../js/rsd-app.js');

const state = app.initialState();
const result = app.recompute(state);

// ===== 입력 패널 =====
{
  const h = uiYard.renderInputs(state);
  for (const path of ['yard.yardLength', 'yard.maintLength', 'yard.yardWidth',
                      'yard.roadWidth',
                      'yard.operatingEff', 'yard.srBandWidth']) {
    assert.ok(h.indexOf('data-path="' + path + '"') >= 0, path + ' 입력이 있어야 한다');
  }
  assert.ok(/750/.test(h), '야드 길이 기본값이 채워져야 한다');
  // 파일 제원은 공통 패널이 아니라 원료별로 입력한다
  assert.ok(h.indexOf('data-path="yard.pileCount"') < 0, '파일 수는 공통 파라미터가 아니다');
  assert.ok(h.indexOf('data-path="yard.pileGap"') < 0, '파일간 간격은 공통 파라미터가 아니다');
}

// ===== 결과: 계산서 + 도면 =====
{
  const h = uiYard.renderResult(state, result);
  // 야드로 저장하는 원료(철광석·부원료)가 모두 나오는가
  assert.ok(/철광석/.test(h), '철광석 결과가 있어야 한다');
  assert.ok(/석회석/.test(h), '부원료 결과가 있어야 한다');
  // Silo로 지정된 석탄은 야드 탭에 나오지 않는다
  assert.ok(h.indexOf('data-material="coal"') < 0, 'Silo 저장 원료는 야드 탭에 나오지 않는다');

  // 계산서 주요 항목
  for (const label of ['적치길이', '적치폭', '적치높이', '삼각파일길이',
                       '최대 적치체적', '최대 적치량', '유효 적치량',
                       '필요 열 수', '최종 적치가능 재고일수']) {
    assert.ok(h.indexOf(label) >= 0, '계산서에 "' + label + '" 행이 있어야 한다');
  }

  // 계산근거 펼침이 붙어 있는가
  assert.ok(/<details class="trace"/.test(h), '계산근거 펼침이 있어야 한다');

  // 도면 2종
  assert.ok(/class="dwg dwg-plan"/.test(h), '평면도가 있어야 한다');
  assert.ok(/class="dwg dwg-section"/.test(h), '단면도가 있어야 한다');
  assert.ok(/class="pile"/.test(h), '파일이 그려져야 한다');
}

// ===== 파일 수를 바꾸면 도면의 파일 개수가 바뀌는가 (실비례 보장) =====
{
  const s2 = app.initialState();
  s2.materials.ironOre.pileCount = 6;
  s2.materials.flux.pileCount = 6;
  const r2 = app.recompute(s2);
  const h = uiYard.renderResult(s2, r2);
  // 야드 저장 원료 2종 × 각 원료의 열 수만큼 파일이 그려진다
  const ore = r2.materials.ironOre.sizing.rows.value;
  const flux = r2.materials.flux.sizing.rows.value;
  const expected = 6 * ore + 6 * flux;
  assert.strictEqual((h.match(/class="pile"/g) || []).length, expected,
    '도면의 파일 개수는 입력 파일수 × 열수와 일치해야 한다');
}

// ===== 파일 제원은 원료마다 독립이다 =====
// 철광석 10개 / 부원료 5개처럼 서로 다른 값을 줬을 때
// 계산·도면이 각각의 값을 따라가야 한다.
{
  const s = app.initialState();
  s.materials.ironOre.pileCount = 10;
  s.materials.ironOre.pileGap = 5;
  s.materials.flux.pileCount = 5;
  s.materials.flux.pileGap = 8;
  const r = app.recompute(s);

  // 엔진에 서로 다른 값이 들어갔는가 — 삼각파일길이 L 은 I·J 에 좌우된다
  const oreL = r.materials.ironOre.sizing.prismLength.value;
  const fluxL = r.materials.flux.sizing.prismLength.value;
  assert.ok(oreL !== fluxL, '원료별 파일 제원이 다르면 계산 결과도 달라야 한다');

  // 도면의 파일 개수도 원료별로 따로
  const h = uiYard.renderResult(s, r);
  const oreBlock = h.split('data-material="ironOre"')[1].split('</section>')[0];
  const fluxBlock = h.split('data-material="flux"')[1].split('</section>')[0];
  assert.strictEqual((oreBlock.match(/class="pile"/g) || []).length,
    10 * r.materials.ironOre.sizing.rows.value, '철광석 파일 10개');
  assert.strictEqual((fluxBlock.match(/class="pile"/g) || []).length,
    5 * r.materials.flux.sizing.rows.value, '부원료 파일 5개');

  // 입력란도 원료별 경로여야 한다
  assert.ok(h.indexOf('data-path="materials.ironOre.pileCount"') >= 0);
  assert.ok(h.indexOf('data-path="materials.flux.pileGap"') >= 0);
}

// ===== 야드 저장 원료가 하나도 없으면 안내 =====
{
  const s3 = app.initialState();
  s3.materials.ironOre.storageType = 'silo';
  s3.materials.flux.storageType = 'shed';
  const r3 = app.recompute(s3);
  const h = uiYard.renderResult(s3, r3);
  assert.ok(/오픈야드로 지정된 원료가 없습니다/.test(h), '빈 상태 안내가 있어야 한다');
}

console.log('OK: ui-yard');
