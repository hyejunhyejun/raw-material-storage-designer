(function (global) {
  const req = (typeof require !== 'undefined');
  const c    = req ? require('./rsd-ui-controls.js') : global.RSD.controls;
  const d2   = req ? require('./rsd-draw2d.js')      : global.RSD.draw2d;
  const hlp  = req ? require('./rsd-draw2d-help.js') : global.RSD.draw2dHelp;
  // 민감도 모듈은 이 파일보다 뒤에 로드되므로 지연 해석한다
  function SENS() { return req ? require('./rsd-ui-sensitivity.js') : global.RSD.sensitivity; }

  function renderInputs(state) {
    const y = state.yard;
    return '<div class="panel">' +
      '<h3>야드 설계 파라미터</h3>' +
      '<div class="fields">' +
      c.numberField({ path: 'yard.yardLength',   label: '야드 길이 (A)',   value: y.yardLength,   unit: 'm', step: 10, min: 0 }) +
      c.numberField({ path: 'yard.maintLength',  label: '정비공간 (B)',    value: y.maintLength,  unit: 'm', step: 5,  min: 0, hint: '양 끝단 합계' }) +
      c.numberField({ path: 'yard.yardWidth',    label: '야드 폭 (D)',     value: y.yardWidth,    unit: 'm', step: 1,  min: 0 }) +
      c.numberField({ path: 'yard.roadWidth',    label: '차량 통행로 (E)', value: y.roadWidth,    unit: 'm', step: 1,  min: 0,
        hint: '양측 합계 (한쪽 ' + (y.roadWidth / 2) + ' m)' }) +
      c.numberField({ path: 'yard.operatingEff', label: '운영효율 (적치효율 P)', value: y.operatingEff, unit: '-', step: 0.05, min: 0.01, hint: '0.75 = 75% · ① 탭의 운영효율과 같은 값' }) +
      c.numberField({ path: 'yard.srBandWidth',  label: '이동기기 및 Belt Conveyor 면적 폭', value: y.srBandWidth,  unit: 'm', step: 1,  min: 0 }) +
      '</div>' +
      '<p class="dim">파일 수 (I) · 파일간 간격 (J) 은 원료마다 다르므로 ' +
      '아래 원료별 계산서에서 각각 입력합니다.</p>' +
      '<details class="help"><summary>파라미터가 도면의 어디인지 보기</summary>' +
      '<div class="help-body">' + hlp.drawYardHelp() + hlp.drawYardSectionHelp() + '</div>' +
      '</details></div>';
  }

  // 원료 1종의 계산서 + 도면
  function renderOne(state, entry) {
    const s = entry.sizing;
    const m = entry.material;
    const y = state.yard;

    const sheet = c.resultTable([
      { label: '일일 사용량',            res: entry.demand.daily },
      { label: '대상 저장용량',          res: entry.demand.targetCapacity },
      { label: '설계 대상용량',          res: entry.demand.designCapacity },
      { label: '실제 배치 파일 수',      res: s.pileCount },
      { label: '적치길이 (C)',           res: s.stackLength },
      { label: '적치폭 (F)',             res: s.stackWidth },
      { label: '적치높이 (G)',           res: s.pileHeight },
      { label: '삼각파일길이 (L)',       res: s.prismLength },
      { label: '직선구간 체적',          res: s.prismVolume },
      { label: '원뿔구간 체적',          res: s.coneVolume },
      { label: '최대 적치체적 (N)',      res: s.volume },
      { label: '최대 적치량 (O)',        res: s.maxCapacity },
      { label: '유효 적치량 (Q, 1열)',   res: s.effectiveCapacity },
      { label: '필요 열 수',             res: s.rows },
      { label: '최종 적치가능 용량',     res: s.totalCapacity },
      { label: '최종 적치가능 재고일수', res: s.achievedStockDays },
      { label: '적치면적 (1열)',         res: s.stackArea },
      { label: '점유면적 (1열)',         res: s.footprintArea }
    ]);

    const geo = {
      A: y.yardLength, B: y.maintLength, D: y.yardWidth, E: y.roadWidth,
      I: s.pileCount.value, J: m.pileGap,   // 잘려나간 뒤의 실제 배치 수
      C: s.stackLength.value, F: s.stackWidth.value,
      rows: s.rows.value, srBandWidth: y.srBandWidth,
      color: m.color
    };

    return '<section class="card material-block" data-material="' + c.esc(m.key) + '">' +
      '<h3><span class="swatch" style="background:' + c.esc(m.color) + '"></span>' +
      c.esc(m.label) + '</h3>' +
      // 파일 제원은 원료마다 다르다 — 브랜드 수·혼합 운영에 따라 달라지므로
      // 공통 파라미터가 아니라 원료 단위로 입력받는다
      '<div class="fields"><h4 class="fields-title">' + c.esc(m.label) + ' 파일 제원</h4>' +
      c.numberField({ path: 'materials.' + m.key + '.pileCount', label: '파일 수 (I)',
        value: m.pileCount, unit: '개', step: 1, min: 1, max: 100 }) +
      c.numberField({ path: 'materials.' + m.key + '.pileGap', label: '파일간 간격 (J)',
        value: m.pileGap, unit: 'm', step: 1, min: 0 }) +
      '</div>' +
      '<div class="tiles">' +
      c.statTile({ label: '필요 열 수', value: s.rows.value, unit: '열' }) +
      c.statTile({ label: '최종 적치가능 용량', value: s.totalCapacity.value, unit: 't' }) +
      c.statTile({ label: '최종 재고일수', value: s.achievedStockDays.value, unit: '일' }) +
      c.statTile({ label: '점유면적', value: entry.area, unit: 'm²', sub: '이동기기 면적 포함' }) +
      // 적치가능율 — 계단 어디쯤 서 있는지. 기준선에 가까우면 아슬아슬하고,
      // 크면 한 열이 통으로 남아돈다는 뜻이다.
      c.stackTile(entry) +
      '</div>' +
      holdBox(state, entry) +
      c.warnBox(s.warnings) +
      (s.rows.value === 0
        ? '<p class="dim">저장할 물량이 없어 야드가 필요하지 않습니다 ' +
          '(연간 사용량 또는 목표 재고일수가 0).</p>'
        : '<div class="dwg-wrap"><h4>평면도</h4>' + d2.drawYardPlan(geo) + '</div>') +
      '<div class="dwg-wrap"><h4>파일 단면도</h4>' +
      d2.drawYardSection({
        D: y.yardWidth, E: y.roadWidth, F: s.stackWidth.value,
        G: s.pileHeight.value, repose: m.repose, color: m.color
      }) + '</div>' +
      '<details class="sheet"><summary>계산서 전체 보기</summary>' + sheet + '</details>' +
      '</section>';
  }

  // 지금 구성이 유지되는 구간 — 운영효율·재고일수 두 축으로
  function holdBox(state, entry) {
    try {
      const S = SENS();
      return c.holdNote([
        S.holdRange(state, entry.material.key, 'operatingEff'),
        S.holdRange(state, entry.material.key, 'stockDays')
      ]);
    } catch (e) { return ''; }
  }

  function renderResult(state, result) {
    const blocks = [];
    for (const key of Object.keys(result.materials)) {
      const entry = result.materials[key];
      if (entry.type !== 'yard') continue;
      blocks.push(renderOne(state, entry));
    }
    if (blocks.length === 0) {
      return '<section class="card empty">오픈야드로 지정된 원료가 없습니다. ' +
        '① 원료·용량 탭에서 저장타입을 오픈야드로 바꾸면 여기에 계산서와 도면이 나타납니다.</section>';
    }
    return blocks.join('');
  }

  const api = { renderInputs: renderInputs, renderResult: renderResult };
  global.RSD = global.RSD || {};
  global.RSD.uiYard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
