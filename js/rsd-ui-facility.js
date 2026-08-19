(function (global) {
  // Shed · Silo · 마스터플랜 · 타입비교 탭 화면
  const req = (typeof require !== 'undefined');
  const c   = req ? require('./rsd-ui-controls.js')   : global.RSD.controls;
  const ds  = req ? require('./rsd-draw2d-shed.js')   : global.RSD.draw2dShed;
  const dsl = req ? require('./rsd-draw2d-silo.js')   : global.RSD.draw2dSilo;
  const dm  = req ? require('./rsd-draw2d-master.js') : global.RSD.draw2dMaster;
  const cmp = req ? require('./rsd-ui-compare.js')    : global.RSD.compare;
  const EQ  = req ? require('./rsd-equip.js')         : global.RSD.equip;
  const BD  = req ? require('./rsd-bands.js')         : global.RSD.bands;
  const hlp = req ? require('./rsd-draw2d-help.js')   : global.RSD.draw2dHelp;
  // 민감도 모듈은 이 파일보다 뒤에 로드되므로 지연 해석한다
  function SENS() { return req ? require('./rsd-ui-sensitivity.js') : global.RSD.sensitivity; }

  // 지금 구성이 유지되는 구간. 야드·Silo 는 정수 올림이라 경계 전까지
  // 설비 수량이 꿈쩍하지 않는다 — 화면이 그 이유를 스스로 말하게 한다.
  function holdBox(state, entry) {
    try {
      const S = SENS();
      return c.holdNote([
        S.holdRange(state, entry.material.key, 'operatingEff'),
        S.holdRange(state, entry.material.key, 'stockDays')
      ]);
    } catch (e) { return ''; }
  }

  // ---------- ④ Shed ----------
  function renderShedInputs(state, result) {
    const s = state.shed;
    // 자동 산정되는 쪽은 실제 계산 결과를 보여준다 (빈 칸이 아니라 값이 보이게)
    let autoLen = s.cellLength, autoCells = s.cellsPerBayCount;
    if (result) {
      const k = Object.keys(result.materials).filter(function (x) {
        return result.materials[x].type === 'shed';
      })[0];
      if (k) {
        const cells = result.materials[k].sizing.cells;
        if (cells.length) {
          autoLen = cells[0].length.value;
          autoCells = Math.round(cells.length / Math.max(1, s.bays));
        }
      }
    }
    return '<div class="panel"><h3>Shed 설계 파라미터</h3><div class="fields">' +
      c.numberField({ path: 'shed.La', label: '개방측 적치거리 (La)', value: s.La, unit: 'm', step: 1, min: 1 }) +
      c.numberField({ path: 'shed.Lb', label: '옹벽측 적치거리 (Lb)', value: s.Lb, unit: 'm', step: 0.5, min: 0 }) +
      c.numberField({ path: 'shed.bottomSlope', label: '하부 경사각', value: s.bottomSlope, unit: '°', step: 0.1, min: 0 }) +
      c.numberField({ path: 'shed.bays', label: 'bay 수', value: s.bays, unit: '열', step: 1, min: 1, max: 2 }) +
      c.selectField({ path: 'shed.buildingMode', label: '건물 구성', value: s.buildingMode,
        options: [{ value: 'separate', label: '원료별로 따로 짓기' },
                  { value: 'shared',   label: '한 동에 모아 짓기 (공용 Shed)' }] }) +
      c.selectField({ path: 'shed.sizingMode', label: '용량 확보 방식', value: s.sizingMode,
        options: [{ value: 'grow',   label: '셀 개수 고정 · 셀 길이 자동' },
                  { value: 'add',    label: '셀 길이 고정 · 셀 개수 자동' },
                  { value: 'manual', label: '셀별 길이 직접 입력' }] }) +
      c.numberField({ path: 'shed.cellsPerBayCount', label: 'bay 당 셀 수',
        value: (s.sizingMode === 'add' ? autoCells : s.cellsPerBayCount), unit: '개', step: 1, min: 1,
        disabled: (s.sizingMode === 'add'), disabledHint: '셀 길이에서 자동 산정', max: 60 }) +
      c.numberField({ path: 'shed.cellLength',
        label: (s.sizingMode === 'manual' ? '새 셀 기본 길이' : '셀 길이'),
        value: (s.sizingMode === 'grow' ? autoLen : s.cellLength), unit: 'm', step: 0.5, min: 1,
        disabled: (s.sizingMode === 'grow'), disabledHint: '셀 개수에서 자동 산정',
        hint: (s.sizingMode === 'manual' ? '셀을 늘릴 때 채워 넣는 길이' : undefined) }) +
      c.numberField({ path: 'shed.wallThickness', label: '격벽 두께', value: s.wallThickness, unit: 'm', step: 0.5, min: 0 }) +
      c.numberField({ path: 'shed.centerWallThickness', label: '중앙 옹벽 두께', value: s.centerWallThickness, unit: 'm', step: 0.5, min: 0 }) +
      c.numberField({ path: 'shed.openSideClear', label: '개방측 여유', value: s.openSideClear, unit: 'm', step: 0.5, min: 0 }) +
      c.numberField({ path: 'shed.maintZone', label: '정비존 (편측)', value: s.maintZone, unit: 'm', step: 0.25, min: 0 }) +
      c.numberField({ path: 'shed.totalHeight', label: '전고', value: s.totalHeight, unit: 'm', step: 0.5, min: 1 }) +
      c.numberField({ path: 'shed.operatingEff', label: '운영효율', value: s.operatingEff, unit: '-', step: 0.05, min: 0.01, hint: '0.75 = 75%' }) +
      c.numberField({ path: 'shed.sprPerBay', label: 'SPR (면당)', value: s.sprPerBay, unit: '기', step: 1, min: 0, max: 20 }) +
      '</div>' +
      renderCellEditor(state, result) +
      '<details class="help"><summary>파라미터가 도면의 어디인지 보기</summary>' +
      '<div class="help-body">' + hlp.drawShedHelp() + hlp.drawShedPlanHelp() + '</div>' +
      '</details></div>';
  }

  // 셀별 길이 직접 입력 — 첫 칸만 짧게 가는 배치를
  // 그대로 재현하려면 셀마다 길이를 따로 줄 수 있어야 한다.
  function renderCellEditor(state, result) {
    const s = state.shed;
    if (s.sizingMode !== 'manual') return '';
    const bays = Math.max(1, s.bays);
    const cells = Array.isArray(s.cellsPerBay) ? s.cellsPerBay : [];

    // 지금 셀 구성으로 담기는 용량 — 목표를 넘겼는지 바로 보여야 손으로 맞출 수 있다
    let need = 0, have = 0;
    Object.keys(result ? result.materials : {}).forEach(function (k) {
      const e = result.materials[k];
      if (e.type !== 'shed') return;
      need = e.demand.designCapacity.value;
      have = e.sizing.totalCapacity.value;
    });

    const rows = [];
    for (let b = 0; b < bays; b++) {
      const row = Array.isArray(cells[b]) ? cells[b] : [];
      const inputs = row.map(function (len, i) {
        return c.numberField({
          path: 'shed.cellsPerBay.' + b + '.' + i,
          label: 'bay ' + (b + 1) + ' · 셀 ' + (i + 1),
          value: len, unit: 'm', step: 0.5, min: 1
        });
      }).join('');
      const sum = row.reduce(function (t, v) { return t + Number(v || 0); }, 0);
      rows.push('<div class="cell-bay"><h4 class="fields-title">bay ' + (b + 1) +
        ' — 셀 ' + row.length + '개 · 적치길이 합계 ' + Math.round(sum * 10) / 10 + ' m</h4>' +
        '<div class="fields">' + inputs + '</div></div>');
    }

    const ok = (need > 0 && have >= need);
    const gap = need > 0
      ? '<p class="' + (ok ? 'dim' : 'cell-short') + '">설계 대상용량 ' +
        Math.round(need).toLocaleString('ko-KR') + ' t / 현재 구성 ' +
        Math.round(have).toLocaleString('ko-KR') + ' t' +
        (ok ? ' — 충족' : ' — ' + Math.round(need - have).toLocaleString('ko-KR') + ' t 부족') + '</p>'
      : '';

    return '<div class="cell-editor"><h4>셀별 길이</h4>' +
      '<p class="dim">셀 개수는 위의 “bay 당 셀 수”로 늘리고 줄입니다. ' +
      '길이를 바꾸면 총 길이·용량·도면이 바로 따라갑니다.</p>' +
      gap + rows.join('') + '</div>';
  }

  // 공용 Shed — 건물 하나에 여러 원료. 원료별 카드 대신 한 장으로 보여준다.
  //
  // 핵심은 "같은 크기 셀이라도 원료마다 담기는 양이 다르다"는 것.
  // 안식각이 크면 더 높이 쌓이고, 비중이 크면 같은 부피에 더 많은 톤이 들어간다.
  // 철광석은 석탄의 2.6배가 담기므로 이 표가 곧 셀 배분의 근거다.
  function renderSharedShed(state, result) {
    const sh = result.sharedShed;
    const s = sh.sizing;
    const she = EQ.shedEquipment({
      bays: state.shed.bays, sprPerBay: state.shed.sprPerBay, trippers: state.shed.trippers
    });
    const bayW = s.width.value / Math.max(1, state.shed.bays);
    const totalLen = sh.keys.reduce(function (t, k) {
      const e = s.byMaterial[k];
      return t + (e ? e.length : 0);
    }, 0);

    const rows = sh.keys.map(function (k) {
      const e = s.byMaterial[k] || { cellCount: 0, length: 0, capacity: 0, tPerM: 0 };
      const m = result.materials[k].material;
      const need = result.materials[k].demand.designCapacity.value;
      const share = totalLen > 0 ? e.length / totalLen : 0;
      const ok = e.capacity >= need - 1e-6;
      const tgt = result.materials[k].demand.targetCapacity.value;
      const sr = (tgt > 0) ? e.capacity / tgt : 0;
      return '<tr><td><span class="swatch" style="background:' + c.esc(m.color) + '"></span> ' +
        c.esc(m.label) + '</td>' +
        '<td class="n">' + m.repose + '°</td>' +
        '<td class="n">' + m.density + '</td>' +
        '<td class="n">' + c.num(Math.round(e.tPerM)) + '</td>' +
        '<td class="n">' + e.cellCount + '</td>' +
        '<td class="n">' + c.num(Math.round(e.length)) + '</td>' +
        '<td class="n">' + c.num(Math.round(need)) + '</td>' +
        '<td class="n">' + c.num(Math.round(e.capacity)) +
        (ok ? '' : ' <span class="cell-short">부족</span>') + '</td>' +
        // 적치가능율 = 확보(운영효율 미반영) ÷ 대상 저장용량. 계산식은 표 아래 각주에 적는다.
        '<td class="n">' + Math.round(sr * 100) + ' %</td>' +
        '<td class="n">' + (share * 100).toFixed(1) + ' %</td></tr>';
    }).join('');

    return '<section class="card material-block" data-material="shared-shed">' +
      '<h3>공용 Shed — ' + sh.keys.map(function (k) {
        return '<span class="swatch" style="background:' +
          c.esc(result.materials[k].material.color) + '"></span>' +
          c.esc(result.materials[k].material.label);
      }).join(' + ') + '</h3>' +
      '<div class="tiles">' +
      c.statTile({ label: '건물 치수', value: Math.round(s.length.value), unit: 'm',
        sub: '× ' + Math.round(s.width.value) + ' m × ' + state.shed.totalHeight + ' m' }) +
      c.statTile({ label: '총 셀 수', value: s.cells.length, unit: '개' }) +
      c.statTile({ label: '총 저장용량', value: s.totalCapacity.value, unit: 't' }) +
      c.statTile({ label: '점유면적', value: s.area.value, unit: 'm²' }) +
      '</div>' +
      '<p class="dim">적치 Tripper ' + she.trippers + '기 (중앙 옹벽 상부) · ' +
      '불출 Semi Portal Reclaimer ' + she.sprTotal + '기 (면당 ' + she.sprPerBay + '기)</p>' +
      c.warnBox(s.warnings) +
      '<h4 class="fields-title">원료별 셀 배분</h4>' +
      '<p class="dim">같은 크기의 셀이라도 <b>원료마다 담기는 양이 다릅니다</b> — ' +
      '안식각이 크면 더 높이 쌓이고, 비중이 크면 같은 부피에 더 많은 톤이 들어갑니다.</p>' +
      '<table class="sheet-table"><thead><tr>' +
      '<th>원료</th><th class="n">안식각</th><th class="n">비중</th>' +
      '<th class="n">단위길이 용량 (t/m)</th><th class="n">셀 수</th><th class="n">적치길이 (m)</th>' +
      '<th class="n">필요 (t)</th><th class="n">확보 (t)</th>' +
      '<th class="n">적치가능율</th><th class="n">면적 배분</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p class="dim">적치가능율 = 확보 ÷ 대상 저장용량 (운영효율 미반영). 기준은 ' +
      '1 ÷ 운영효율 = ' + Math.round(1 / state.shed.operatingEff * 100) + ' % 이며, ' +
      '이보다 클수록 여유가 있다는 뜻입니다.</p>' +
      '<div class="dwg-wrap"><h4>단면도</h4>' +
      ds.drawShedSection({
        La: state.shed.La, Lb: state.shed.Lb,
        repose: result.materials[sh.keys[0]].material.repose,
        bottomSlope: state.shed.bottomSlope, bays: state.shed.bays,
        centerWall: state.shed.centerWallThickness, openClear: state.shed.openSideClear,
        slopeClear: state.shed.slopeSideClear, totalHeight: state.shed.totalHeight,
        color: result.materials[sh.keys[0]].material.color, section: s.section
      }) + '</div>' +
      '<p class="dim">단면은 ' + c.esc(result.materials[sh.keys[0]].material.label) +
      ' 기준입니다 — 건물 기하는 공통이고 안식각만 원료마다 달라집니다.</p>' +
      '<div class="dwg-wrap"><h4>평면도 — 원료별 구역</h4>' +
      ds.drawShedPlan({
        cells: s.cells, bays: state.shed.bays, bayWidth: bayW,
        wallThickness: state.shed.wallThickness, endWall: state.shed.endWallThickness,
        maintZone: state.shed.maintZone,
        trippers: state.shed.trippers, sprPerBay: state.shed.sprPerBay,
        length: s.length.value, width: s.width.value,
        color: result.materials[sh.keys[0]].material.color
      }) + '</div>' +
      '<details class="sheet"><summary>계산서 전체 보기</summary>' +
      c.resultTable([
        { label: 'bay당 적치길이', res: s.stackLengthPerBay },
        { label: '총 저장용량', res: s.totalCapacity },
        { label: '유효 저장용량', res: s.effectiveCapacity },
        { label: '건물 길이', res: s.length },
        { label: '건물 폭', res: s.width },
        { label: '점유면적', res: s.area }
      ]) + '</details></section>';
  }

  function renderShedResult(state, result) {
    // 공용 Shed 는 건물이 하나 — 원료별 카드 대신 한 장으로
    if (result.sharedShed) return renderSharedShed(state, result);
    const blocks = [];
    Object.keys(result.materials).forEach(function (k) {
      const e = result.materials[k];
      if (e.type !== 'shed') return;
      const s = e.sizing, m = e.material;
      if (!s.cells.length) {
        blocks.push('<section class="card material-block" data-material="' + c.esc(k) + '">' +
          '<h3><span class="swatch" style="background:' + c.esc(m.color) + '"></span>' +
          c.esc(m.label) + ' Shed</h3>' +
          '<p class="dim">저장할 물량이 없어 Shed 가 필요하지 않습니다 ' +
          '(연간 사용량 또는 목표 재고일수가 0).</p></section>');
        return;
      }
      const she = EQ.shedEquipment({
        bays: state.shed.bays, sprPerBay: state.shed.sprPerBay, trippers: state.shed.trippers
      });
      const bayW = s.width.value / Math.max(1, state.shed.bays);

      blocks.push('<section class="card material-block" data-material="' + c.esc(k) + '">' +
        '<h3><span class="swatch" style="background:' + c.esc(m.color) + '"></span>' +
        c.esc(m.label) + ' Shed</h3>' +
        '<div class="tiles">' +
        c.statTile({ label: '총 저장용량', value: s.totalCapacity.value, unit: 't' }) +
        c.statTile({ label: '셀 수', value: s.cells.length, unit: '개' }) +
        c.statTile({ label: '건물 치수', value: Math.round(s.length.value), unit: 'm',
          sub: '× ' + Math.round(s.width.value) + ' m × ' + state.shed.totalHeight + ' m' }) +
        c.statTile({ label: '점유면적', value: s.area.value, unit: 'm²' }) +
        c.stackTile(e) +
        '</div>' +
        '<p class="dim">적치 Tripper ' + she.trippers + '기 (중앙 옹벽 상부) · ' +
        '불출 Semi Portal Reclaimer ' + she.sprTotal + '기 (면당 ' + she.sprPerBay + '기)</p>' +
        holdBox(state, e) +
        c.warnBox(s.warnings) +
        '<div class="dwg-wrap"><h4>단면도</h4>' +
        ds.drawShedSection({
          La: state.shed.La, Lb: state.shed.Lb, repose: m.repose,
          bottomSlope: state.shed.bottomSlope, bays: state.shed.bays,
          centerWall: state.shed.centerWallThickness, openClear: state.shed.openSideClear,
          slopeClear: state.shed.slopeSideClear, totalHeight: state.shed.totalHeight,
          color: m.color, section: s.section
        }) + '</div>' +
        '<div class="dwg-wrap"><h4>평면도</h4>' +
        ds.drawShedPlan({
          cells: s.cells, bays: state.shed.bays, bayWidth: bayW,
          wallThickness: state.shed.wallThickness, endWall: state.shed.endWallThickness,
          maintZone: state.shed.maintZone,
          trippers: state.shed.trippers, sprPerBay: state.shed.sprPerBay,
          length: s.length.value, width: s.width.value, color: m.color
        }) + '</div>' +
        '<details class="sheet"><summary>계산서 전체 보기</summary>' +
        c.resultTable([
          { label: 'h1 (적치높이)', res: s.section.h1 },
          { label: '① 개방측 단면적', res: s.section.A1 },
          { label: '옹벽측 높이', res: s.section.wallHeight },
          { label: '② 옹벽측 단면적', res: s.section.A2 },
          { label: 'h3 (하부 쐐기 높이)', res: s.section.h3 },
          { label: '③ 하부 단면적', res: s.section.A3 },
          { label: '총 단면적', res: s.section.sectionArea },
          { label: '단위길이 용량', res: s.section.tPerM },
          { label: 'bay당 적치길이', res: s.stackLengthPerBay },
          { label: '총 저장용량', res: s.totalCapacity },
          { label: '유효 저장용량', res: s.effectiveCapacity },
          { label: '건물 길이', res: s.length },
          { label: '건물 폭', res: s.width },
          { label: '점유면적', res: s.area },
          { label: '최종 적치가능 재고일수', res: s.achievedStockDays }
        ]) + '</details></section>');
    });

    if (!blocks.length) {
      return '<section class="card empty">Shed 로 지정된 원료가 없습니다. ' +
        '① 원료·용량 탭에서 저장타입을 Shed 로 바꾸면 여기에 계산서와 도면이 나타납니다.</section>';
    }
    return blocks.join('');
  }

  // ---------- ⑤ Silo ----------
  function renderSiloInputs(state, result) {
    const s = state.silo;
    const derive = (s.sizingMode === 'derive');

    // 산출 모드에서는 실제 계산 결과를 그대로 보여준다 (빈 칸이 아니라 값이 보이게).
    // Silo 를 쓰는 원료가 있으면 그 원료의 비중으로 나온 값이다.
    let dim = { innerDia: s.innerDia, totalHeight: s.totalHeight,
                pitch: s.pitch, footprintWidth: s.footprintWidth };
    let basis = '';
    if (derive && result) {
      const k = Object.keys(result.materials).filter(function (x) {
        return result.materials[x].type === 'silo';
      })[0];
      if (k) {
        const z = result.materials[k].sizing;
        dim = { innerDia: z.innerDia.value, totalHeight: z.totalHeight.value,
                pitch: z.pitch.value, footprintWidth: z.footprintWidth.value };
        basis = result.materials[k].material.label + ' 비중 ' +
                result.materials[k].material.density + ' t/m³ 기준';
      }
    }
    const autoHint = derive ? ('용량에서 산출' + (basis ? ' · ' + basis : '')) : undefined;

    return '<div class="panel"><h3>Silo 설계 파라미터</h3>' +
      '<p class="dim">기준 제원 <b>41 m⌀ × 57.6 m</b> 는 5만톤·석탄 0.8 t/m³ 기준이며 ' +
      '스스로 정합적입니다 (충전율 0.82 · 세장비 1.405). ' +
      '다른 용량은 이 두 비를 유지한 <b>상사 확대</b>로 산출합니다 — ' +
      '벤더 제원이 있으면 “제원 직접 입력”으로 바꾸십시오.</p>' +
      '<div class="fields">' +
      c.selectField({ path: 'silo.sizingMode', label: '제원 결정 방식', value: s.sizingMode,
        options: [{ value: 'derive', label: '용량에서 제원 산출' },
                  { value: 'manual', label: '제원 직접 입력 (벤더 자료)' }] }) +
      c.numberField({ path: 'silo.capacity', label: '1기 용량', value: s.capacity, unit: 't', step: 5000, min: 1, group: true }) +
      c.numberField({ path: 'silo.innerDia', label: '내부 직경', value: dim.innerDia, unit: 'm', step: 1, min: 1,
        disabled: derive, disabledHint: autoHint }) +
      c.numberField({ path: 'silo.totalHeight', label: '전체 높이', value: dim.totalHeight, unit: 'm', step: 0.5, min: 1,
        disabled: derive, disabledHint: autoHint }) +
      c.numberField({ path: 'silo.pitch', label: '중심간격', value: dim.pitch, unit: 'm', step: 1, min: 1,
        disabled: derive, disabledHint: derive ? '직경 + 순이격' : undefined }) +
      c.numberField({ path: 'silo.footprintWidth', label: '점유 폭', value: dim.footprintWidth, unit: 'm', step: 1, min: 1,
        disabled: derive, disabledHint: derive ? '직경 + 시공 여유' : undefined }) +
      c.numberField({ path: 'silo.fillRatio', label: '유효 충전율', value: s.fillRatio, unit: '-', step: 0.01, min: 0.1,
        disabled: !derive, disabledHint: '제원 직접 입력 모드에서는 쓰이지 않음',
        hint: derive ? '하부 콘·상부 여유를 뺀 실제 담기는 비율' : undefined }) +
      c.numberField({ path: 'silo.slenderness', label: '세장비 H/D', value: s.slenderness, unit: '-', step: 0.05, min: 0.5,
        disabled: !derive, disabledHint: '제원 직접 입력 모드에서는 쓰이지 않음',
        hint: derive ? '기준 제원에서 역산한 값' : undefined }) +
      c.numberField({ path: 'silo.clearance', label: '순이격', value: s.clearance, unit: 'm', step: 1, min: 0,
        disabled: !derive, disabledHint: '중심간격에서 역산됨',
        hint: derive ? '접근·시공 여유 — 직경과 함께 커지지 않음' : undefined }) +
      c.numberField({ path: 'silo.sideMargin', label: '점유폭 여유', value: s.sideMargin, unit: 'm', step: 1, min: 0,
        disabled: !derive, disabledHint: '점유 폭에서 역산됨' }) +
      c.numberField({ path: 'silo.corridorWidth', label: '상부 Corridor', value: s.corridorWidth, unit: 'm', step: 1, min: 0 }) +
      c.numberField({ path: 'silo.rows', label: '배치 열 수', value: s.rows, unit: '열', step: 1, min: 1, max: 20 }) +
      c.numberField({ path: 'silo.trippers', label: 'Tripper', value: s.trippers, unit: '기', step: 1, min: 0, max: 20 }) +
      c.numberField({ path: 'silo.operatingEff', label: '운영효율', value: s.operatingEff, unit: '-', step: 0.05, min: 0.01, hint: '0.60 = 60%' }) +
      '</div>' +
      '<details class="help"><summary>파라미터가 도면의 어디인지 보기</summary>' +
      '<div class="help-body">' + hlp.drawSiloHelp() + '</div>' +
      '</details></div>';
  }

  function renderSiloResult(state, result) {
    const blocks = [];
    Object.keys(result.materials).forEach(function (k) {
      const e = result.materials[k];
      if (e.type !== 'silo') return;
      const s = e.sizing, m = e.material;
      if (s.count.value <= 0) {
        blocks.push('<section class="card material-block" data-material="' + c.esc(k) + '">' +
          '<h3><span class="swatch" style="background:' + c.esc(m.color) + '"></span>' +
          c.esc(m.label) + ' Silo</h3>' +
          '<p class="dim">저장할 물량이 없어 Silo 가 필요하지 않습니다 ' +
          '(연간 사용량 또는 목표 재고일수가 0).</p></section>');
        return;
      }
      const se = EQ.siloEquipment({ trippers: state.silo.trippers, count: s.count.value });

      blocks.push('<section class="card material-block" data-material="' + c.esc(k) + '">' +
        '<h3><span class="swatch" style="background:' + c.esc(m.color) + '"></span>' +
        c.esc(m.label) + ' Silo</h3>' +
        '<div class="tiles">' +
        c.statTile({ label: '설계 기수', value: s.count.value, unit: '기',
          sub: '수학적 필요 ' + s.countExact.value.toFixed(2) + '기' }) +
        c.statTile({ label: '유효 저장용량', value: s.totalCapacity.value, unit: 't' }) +
        c.statTile({ label: '배치', value: Math.round(s.bandLength.value), unit: 'm',
          sub: '× ' + Math.round(s.bandWidth.value) + ' m · ' + state.silo.rows + '열' }) +
        c.statTile({ label: '점유면적', value: s.area.value, unit: 'm²' }) +
        c.stackTile(e) +
        '</div>' +
        '<p class="dim">적치 Tripper ' + se.trippers + '기 (상부 주행) · ' +
        '불출 RDM ' + se.rdmTotal + '기 (Silo 1기당 1기) → 하부 B/C</p>' +
        holdBox(state, e) +
        c.warnBox(s.warnings) +
        c.warnBox(EQ.siloEquipment({ trippers: state.silo.trippers,
          count: s.count.value, rows: state.silo.rows }).warnings) +
        arrangeTable(state, s) +
        '<div class="dwg-wrap"><h4>평면도</h4>' +
        dsl.drawSiloPlan({
          count: s.count.value, rows: state.silo.rows, perRow: s.perRow.value,
          pitch: s.pitch.value, innerDia: s.innerDia.value,
          footprintWidth: s.footprintWidth.value, corridorWidth: state.silo.corridorWidth,
          bandLength: s.bandLength.value, bandWidth: s.bandWidth.value, color: m.color
        }) + '</div>' +
        '<div class="dwg-wrap"><h4>입면도</h4>' +
        dsl.drawSiloElevation({
          count: s.count.value, pitch: s.pitch.value, innerDia: s.innerDia.value,
          totalHeight: s.totalHeight.value, color: m.color
        }) + '</div>' +
        '<details class="sheet"><summary>계산서 전체 보기</summary>' +
        c.resultTable([
          { label: '일일 사용량', res: e.demand.daily },
          { label: '대상 저장용량', res: e.demand.targetCapacity },
          { label: '설계 대상용량', res: e.demand.designCapacity },
          { label: '수학적 필요 기수', res: s.countExact },
          { label: '설계 기수', res: s.count },
          { label: '열당 기수', res: s.perRow },
          { label: '순수 이격거리', res: s.clearance },
          { label: '배치 길이', res: s.bandLength },
          { label: '배치 폭', res: s.bandWidth },
          { label: '점유면적', res: s.area },
          { label: '유효 총 저장용량', res: s.totalCapacity },
          { label: '최종 적치가능 재고일수', res: s.achievedStockDays }
        ]) + '</details></section>');
    });

    if (!blocks.length) {
      return '<section class="card empty">Silo 로 지정된 원료가 없습니다. ' +
        '① 원료·용량 탭에서 저장타입을 Silo 로 바꾸면 여기에 계산서와 도면이 나타납니다.</section>';
    }
    return blocks.join('');
  }

  // Silo 열 배치 대안 — 같은 기수를 몇 열로 놓느냐에 따라 부지 모양과 면적이 달라진다
  function arrangeTable(state, s) {
    const SILO = req ? require('./rsd-engine-silo.js') : global.RSD.silo;
    const list = SILO.arrangements(s.count.value, s.pitch.value,
      s.footprintWidth.value, state.silo.corridorWidth, 4);
    if (list.length < 2) return '';
    const minArea = Math.min.apply(null, list.map(function (a) { return a.area; }));
    const rows = list.map(function (a) {
      const cur = (a.rows === state.silo.rows);
      return '<tr class="' + (cur ? 'arr-cur' : '') + '">' +
        '<td><button class="arr-pick" data-rows="' + a.rows + '">' + a.rows + '열</button></td>' +
        '<td>' + a.split.join(' + ') + '</td>' +
        '<td class="num">' + Math.round(a.length) + ' × ' + Math.round(a.width) + '</td>' +
        '<td class="num">' + c.num(Math.round(a.area)) + '</td>' +
        '<td class="num">' + a.ratio.toFixed(2) + '</td>' +
        '<td>' + (a.area === minArea ? '<span class="cmp-tag">최소 면적</span>' : '') +
        (cur ? '<span class="arr-now">현재</span>' : '') + '</td></tr>';
    }).join('');
    return '<details class="sheet arr" open><summary>열 배치 대안 비교</summary>' +
      '<table class="arr-table"><thead><tr>' +
      '<th>배치</th><th>열별 기수</th><th class="num">부지 (m)</th>' +
      '<th class="num">면적 (m²)</th><th class="num">종횡비</th><th></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></details>';
  }

  // ---------- ⑥ 마스터플랜 ----------
  // 띠 구성은 rsd-bands 가 담당한다 (3D 와 동일 배선)

  // ① 탭의 '총 점유면적' 과 ⑥ 의 '총 부지면적' 은 서로 다른 값이다.
  // 둘 다 화면에서 '면적' 이라 불리는데 값이 다르면, 보고 자리에서
  // "아까는 21만이라더니?" 한마디에 신뢰를 잃는다. 차이를 분해해 보인다.
  function areaBridge(bands, result, siteArea) {
    const facility = bands.filter(function (b) { return b.kind !== 'road'; })
      .reduce(function (t, b) { return t + b.width * b.length; }, 0);
    const roads = bands.filter(function (b) { return b.kind === 'road'; })
      .reduce(function (t, b) { return t + b.width * b.length; }, 0);
    const slack = siteArea - facility - roads;   // 짧은 띠가 부지 길이에 못 미치는 몫

    const row = function (label, v, note) {
      return '<tr><td>' + c.esc(label) + '</td><td class="n">' +
        c.num(Math.round(v)) + '</td><td class="dim">' + c.esc(note || '') + '</td></tr>';
    };
    return '<details class="sheet"><summary>① 탭의 총 점유면적과 왜 다른가</summary>' +
      '<table class="sheet-table"><tbody>' +
      row('설비 점유면적', facility, '① 탭의 총 점유면적과 같은 값') +
      row('+ 외곽도로 · 통행도로', roads, '부지에는 있지만 설비 면적이 아님') +
      row('+ 여유', slack, '짧은 띠가 부지 길이에 못 미치는 몫') +
      '<tr class="total-row"><td>= 총 부지면적</td><td class="n">' +
      c.num(Math.round(siteArea)) + '</td><td class="dim">총 폭 × 총 길이</td></tr>' +
      '</tbody></table>' +
      '<p class="dim">① 탭은 <b>설비가 차지하는 면적</b>, ⑥ 은 <b>부지로 확보해야 하는 면적</b>입니다. ' +
      '용지 매입·조성 물량은 ⑥ 을 쓰십시오.</p></details>';
  }

  function renderMaster(state, result, order) {
    let bands = BD.buildBands(state, result);
    // 사용자가 드래그로 바꾼 순서를 적용 (개수가 맞을 때만)
    if (order && order.length === bands.length) {
      bands = order.map(function (i) { return bands[i]; });
    }
    const totalWidth = BD.totalWidth(bands);
    const totalLength = BD.totalLength(bands);
    const cov = BD.srCoverage(bands);
    const area = totalWidth * totalLength;

    return '<div class="panel"><h3>통합 마스터플랜</h3>' +
      '<p class="dim">띠 왼쪽 손잡이를 위아래로 끌면 배치 순서를 바꿀 수 있습니다. ' +
      '총 폭은 띠 폭의 합이므로 순서를 바꿔도 변하지 않지만, 이동기기 공유와 동선이 달라집니다.</p>' +
      '<div class="tiles">' +
      c.statTile({ label: '총 폭', value: totalWidth, unit: 'm' }) +
      c.statTile({ label: '총 길이', value: totalLength, unit: 'm' }) +
      c.statTile({ label: '총 부지면적', value: area, unit: 'm²',
        sub: (area / 4046.86).toFixed(2) + ' acres' }) +
      c.statTile({ label: '띠 수', value: bands.length, unit: '개' }) +
      '</div>' +
      areaBridge(bands, result, area) +
      (cov.covered ? '' : c.warnBox(['적치·불출 설비가 닿지 않는 야드가 있습니다: ' +
        cov.uncovered.join(', ') + '. 이동기기 및 Belt Conveyor 면적을 인접시켜야 운용이 가능합니다'])) +
      '<div class="dwg-wrap" id="master-dwg">' +
      dm.drawMasterPlan({ bands: bands, totalWidth: totalWidth, totalLength: totalLength }) +
      '</div></div>';
  }

  // ---------- ⑦ 타입 비교 ----------
  function renderCompare(state, result, materialKey) {
    const keys = Object.keys(state.materials);
    const key = (keys.indexOf(materialKey) >= 0) ? materialKey : keys[0];
    const r = cmp.compareTypes(state, key);

    const picker = keys.map(function (k) {
      const m = state.materials[k];
      return '<button class="view-btn' + (k === key ? ' active' : '') +
        '" data-cmp="' + c.esc(k) + '">' + c.esc(m.label) + '</button>';
    }).join('');

    const feas = cmp.TYPES.filter(function (t) { return r[t].feasible; });
    const areas = feas.map(function (t) { return r[t].area; });
    const maxArea = areas.length ? Math.max.apply(null, areas) : 1;
    const maxCost = feas.length
      ? Math.max.apply(null, feas.map(function (t) { return r[t].cost.total.value; })) : 0;
    // 세 타입을 같은 축척으로 그리려면 가장 큰 부지를 기준으로 삼는다
    const maxL = Math.max.apply(null, feas.map(function (t) { return r[t].footprint ? r[t].footprint.L : 1; }).concat([1]));
    const maxW = Math.max.apply(null, feas.map(function (t) { return r[t].footprint ? r[t].footprint.W : 1; }).concat([1]));

    // 부지 실루엣 — 세 카드가 같은 viewBox 를 쓰므로 크기 비교가 그대로 눈에 들어온다
    function silhouette(d) {
      if (!d.footprint) return '';
      const f = d.footprint;
      return '<svg class="cmp-fp" viewBox="0 0 ' + Math.round(maxL) + ' ' + Math.round(maxW) +
        '" preserveAspectRatio="xMidYMid meet">' +
        '<rect class="cmp-fp-max" x="0" y="0" width="' + Math.round(maxL) + '" height="' + Math.round(maxW) + '"/>' +
        '<rect class="cmp-fp-me" x="0" y="0" width="' + Math.round(f.L) + '" height="' + Math.round(f.W) + '"/>' +
        '</svg>' +
        '<div class="cmp-fp-cap">' + Math.round(f.L) + ' × ' + Math.round(f.W) +
        ' m · 높이 ' + (f.H % 1 === 0 ? f.H : f.H.toFixed(1)) + ' m</div>';
    }

    const cards = cmp.TYPES.map(function (t) {
      const d = r[t];
      const pct = d.feasible ? Math.max(2, d.area / maxArea * 100) : 0;
      const isBest = (r.best === t);
      const isCheap = (r.cheapest === t);
      return '<div class="cmp-card' + (d.feasible ? '' : ' cmp-na') + (isBest ? ' cmp-best' : '') + '">' +
        '<div class="cmp-head">' + c.esc(d.label) +
        (isBest ? '<span class="cmp-tag">최소 면적</span>' : '') +
        (isCheap ? '<span class="cmp-tag cmp-tag-cost cost-only">최소 투자비</span>' : '') + '</div>' +
        (d.feasible
          ? '<div class="cmp-area">' + c.num(Math.round(d.area)) + '<span class="tile-unit">m²</span></div>' +
            (d.vsYardPct === null ? '' :
              '<div class="cmp-vs' + (t === 'yard' ? ' cmp-vs-base' : '') + '">' +
              (t === 'yard' ? '오픈야드 기준 100 %'
                : '오픈야드 대비 ' + d.vsYardPct.toFixed(1) + ' %' +
                  ' (' + (d.vsYardPct < 100 ? '−' : '+') +
                  Math.abs(100 - d.vsYardPct).toFixed(1) + ' %p)') +
              '</div>') +
            '<div class="cmp-bar"><span style="width:' + pct.toFixed(1) + '%"></span></div>' +
            '<div class="cmp-dens">' + d.tPerM2.toFixed(2) +
            '<span class="tile-unit">t/m²</span>' +
            '<span class="cmp-dens-lbl">면적당 저장량</span></div>' +
            // 투자비 — 면적만으로는 결론이 안 난다. Silo 는 면적이 가장 작지만
            // 톤당 투자비는 가장 비싸다. 두 축을 나란히 놔야 판단이 된다.
            '<div class="cmp-cost cost-only">' + c.num(Math.round(d.cost.total.value)) +
            '<span class="tile-unit">억원</span>' +
            (maxCost > 0
              ? '<div class="cmp-bar cmp-bar-cost"><span style="width:' +
                Math.max(1, d.cost.total.value / maxCost * 100).toFixed(1) + '%"></span></div>'
              : '') +
            '<span class="cmp-dens-lbl">톤당 ' +
            c.num(Math.round(d.cost.perTon.value)) + ' 원/t</span></div>' +
            silhouette(d) +
            '<dl class="cmp-list">' +
            '<dt>구성</dt><dd>' + c.esc(d.spec) + '</dd>' +
            '<dt>운영효율</dt><dd>' + (d.eff * 100).toFixed(0) + ' %</dd>' +
            '<dt>대상 저장용량</dt><dd>' + c.num(Math.round(d.targetCapacity)) + ' t</dd>' +
            '<dt>설계 대상용량</dt><dd>' + c.num(Math.round(d.designCapacity)) + ' t</dd>' +
            '<dt>최대 저장용량</dt><dd>' + c.num(Math.round(d.physicalCapacity)) + ' t' +
            '<span class="cmp-note">운영효율 미반영 · 가득 채웠을 때</span></dd>' +
            // 적치가능율 — 타입마다 기준선(1÷운영효율)이 다르므로 계산식을 붙여 둔다.
            // 붙이지 않으면 Silo 170% 와 야드 133% 가 같은 뜻이라는 걸 알 수 없다.
            '<dt>적치가능율</dt><dd>' + Math.round(d.stackRatio * 100) + ' %' +
            '<span class="cmp-note">' + c.num(Math.round(d.physicalCapacity)) + ' ÷ ' +
            c.num(Math.round(d.targetCapacity)) + ' · 기준 ' + Math.round(d.stackFloor * 100) +
            '% (= 1 ÷ 운영효율) 의 ' + (d.stackFloor > 0 ? (d.stackRatio / d.stackFloor).toFixed(1) : '—') +
            '배</span></dd>' +
            '<dt class="cost-only">설비 1' + c.esc(d.cost.unitCount.unit) + ' 투자비</dt>' +
            '<dd class="cost-only">' + c.num(Math.round(d.cost.unitCost.value)) + ' 억원' +
            '<span class="dim"> (규모지수 ' + d.cost.scaleFactor.value.toFixed(3) + ')</span></dd>' +
            '</dl>'
          : '<p class="cmp-note">' + c.esc(d.note) + '</p>') +
        '</div>';
    }).join('');

    // 투자비는 기준 단가가 가정값이라 늘 보일 것이 아니다 — 켤 때만 나온다.
    const showCost = !!state.showCost;
    return '<div class="panel' + (showCost ? '' : ' cmp-nocost') + '">' +
      '<h3 class="cmp-title">저장타입 비교' +
      '<label class="use-toggle cost-sw"><input type="checkbox" data-cost-toggle' +
      (showCost ? ' checked' : '') + '><span>투자비 함께 보기</span></label></h3>' +
      '<p class="dim">같은 원료·같은 재고일수를 세 타입으로 했을 때의 소요 면적' +
      (showCost ? '과 투자비' : '') + '입니다. ' +
      '대상 저장용량은 같지만 운영효율이 달라(야드·Shed 75 %, Silo 60 %) 설계 대상용량이 달라집니다.</p>' +
      '<div class="view-btns cmp-picker">' + picker + '</div>' +
      '<div class="cmp-grid">' + cards + '</div></div>' +
      (showCost ? renderCostInputs(state) : '');
  }

  // 기준 투자비 0 은 '싸다' 가 아니라 '안 넣었다' 다. 그런데 화면에는
  // 그냥 최소 투자비로 뜨므로, 0 인 타입이 있으면 그 사실을 먼저 말해 준다.
  function costWarnings(k) {
    const out = ['기준 투자비는 가정값입니다 — 실제 견적으로 반드시 교체하십시오'];
    const zero = ['yard', 'shed', 'silo'].filter(function (t) {
      return !((k[t] || {}).baseCost > 0);
    }).map(function (t) { return ({ yard: '오픈야드', shed: 'Shed', silo: 'Silo' })[t]; });
    if (zero.length) {
      out.push(zero.join(' · ') + ' 의 기준 투자비가 0 이라 항상 최소 투자비로 표시됩니다. ' +
        '오픈야드도 정지·포장·배수·우수처리 비용이 들므로, 0 인 채로는 투자비 비교가 성립하지 않습니다');
    }
    return out;
  }

  // ---------- 투자비 가정 ----------
  function renderCostInputs(state) {
    const k = state.cost || {};
    const row = function (type, label, unit) {
      const cfg = k[type] || {};
      return c.numberField({ path: 'cost.' + type + '.baseCost',
        label: label + ' 기준 투자비', value: cfg.baseCost, unit: '억원', step: 10, min: 0, group: true,
        hint: '설비 1' + unit + ' 기준' }) +
        c.numberField({ path: 'cost.' + type + '.basisCapacity',
          label: label + ' 기준 용량', value: cfg.basisCapacity, unit: 't', step: 10000, min: 1, group: true,
          hint: '이 용량에서 위 투자비가 성립' });
    };
    return '<div class="panel"><h3>투자비 가정</h3>' +
      '<p class="dim">설비 크기가 바뀌면 투자비는 <b>0.6승법(규모지수법)</b>으로 환산합니다 — ' +
      '용량은 부피(3승)로 늘지만 비용은 표면적(2승)에 가깝게 늘기 때문입니다.</p>' +
      '<p class="dim"><b>지수는 설비 1기의 크기에만</b> 적용합니다. ' +
      '5만톤 Silo 를 2기 지으면 그냥 2배이고, 10만톤 Silo 1기여야 2<sup>0.6</sup> = 1.52배가 됩니다. ' +
      '기수에까지 먹이면 “많이 지을수록 싸진다”는 잘못된 결론이 나옵니다.</p>' +
      c.warnBox(costWarnings(k)) +
      '<div class="fields">' +
      c.numberField({ path: 'cost.exponent', label: '규모지수 n', value: k.exponent,
        unit: '-', step: 0.05, min: 0.1, max: 2, hint: '0.6 = 화공·플랜트 표준 (0.4~1.0)' }) +
      '</div>' +
      '<div class="fields">' + row('yard', '오픈야드', '열') + '</div>' +
      '<div class="fields">' + row('shed', 'Shed', '동') + '</div>' +
      '<div class="fields">' + row('silo', 'Silo', '기') + '</div>' +
      '</div>';
  }

  const api = {
    renderShedInputs: renderShedInputs, renderShedResult: renderShedResult,
    renderSiloInputs: renderSiloInputs, renderSiloResult: renderSiloResult,
    renderMaster: renderMaster,
    renderCompare: renderCompare
  };
  global.RSD = global.RSD || {};
  global.RSD.uiFacility = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
