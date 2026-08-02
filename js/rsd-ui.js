(function (global) {
  const req = (typeof require !== 'undefined');
  const core   = req ? require('./rsd-core.js')          : global.RSD.core;
  const data   = req ? require('./rsd-data.js')          : global.RSD.data;
  const yard   = req ? require('./rsd-engine-yard.js')   : global.RSD.yard;
  const shed   = req ? require('./rsd-engine-shed.js')   : global.RSD.shed;
  const silo   = req ? require('./rsd-engine-silo.js')   : global.RSD.silo;
  const master = req ? require('./rsd-engine-master.js') : global.RSD.master;
  const fmt = core.fmt;

  // 허용오차 (%) — 사양서 §8.1
  const TOL = {
    yard: 0.1, shed: 0.1, silo: 0, masterWidth: 0, masterLength: 1
  };

  function row(caseName, item, calculated, actual, tolPct) {
    const errorPct = (actual === 0)
      ? (calculated === 0 ? 0 : 100)
      : Math.abs(calculated - actual) / Math.abs(actual) * 100;
    return {
      case: caseName, item: item,
      calculated: calculated, actual: actual,
      errorPct: errorPct, tolPct: tolPct,
      pass: errorPct <= tolPct + 1e-9
    };
  }

  // 전 프리셋을 실제로 계산해 실적값과 대조한다
  function buildVerification() {
    const rows = [];
    const P = data.PRESETS;

    // 예시 A · 석탄야드
    {
      const r = yard.computeYard(P.exampleYardA.input);
      const e = P.exampleYardA.expected;
      rows.push(row('예시 A · 석탄야드', '유효적치량 (t)', r.effectiveCapacity.value, e.effectiveCapacity, TOL.yard));
      rows.push(row('예시 A · 석탄야드', '적치면적 (m²)', r.stackArea.value, e.stackArea, TOL.yard));
    }

    // 예시 B · 석탄야드
    {
      const r = yard.computeYard(P.exampleYardB.input);
      const e = P.exampleYardB.expected;
      rows.push(row('예시 B · 석탄야드', '유효적치량 (t)', r.effectiveCapacity.value, e.effectiveCapacity, TOL.yard));
      rows.push(row('예시 B · 석탄야드', '적치면적 (m²)', r.stackArea.value, e.stackArea, TOL.yard));
    }

    // Shed 예시
    {
      const r = shed.computeShed(P.exampleShed.input);
      const e = P.exampleShed.expected;
      rows.push(row('Shed 예시', '단면적 (m²)', r.section.sectionArea.value, e.sectionArea, TOL.shed));
      rows.push(row('Shed 예시', '총 저장용량 (t)', r.totalCapacity.value, e.totalCapacity, TOL.shed));
      rows.push(row('Shed 예시', '길이 (m)', r.length.value, e.length, TOL.shed));
      rows.push(row('Shed 예시', '폭 (m)', r.width.value, e.width, TOL.shed));
    }

    // Silo 예시
    {
      const i = P.exampleSilo.input;
      const r = silo.computeSilo({
        count: i.count, rows: i.rows, pitch: i.pitch,
        footprintWidth: i.footprintWidth, innerDia: i.innerDia,
        capacity: 50000, operatingEff: 0.6, corridorWidth: 0
      });
      const e = P.exampleSilo.expected;
      rows.push(row('Silo 예시', '배치 길이 (m)', r.bandLength.value, e.bandLength, TOL.silo));
      rows.push(row('Silo 예시', '배치 폭 (m)', r.bandWidth.value, e.bandWidth, TOL.silo));
    }

    // 마스터플랜
    // 길이·면적은 도면 표기값(720 m / 180,720 m²)과 대조한다.
    // 툴은 max(띠 길이) = 724 m 를 쓰므로 +0.56% 차이가 나며, 이는 도면의 길이 표기
    // 반올림에서 온다 (사양서 §2.5.1). 우리 계산값끼리 비교하면 검증이 아니라
    // 동어반복이 되므로 반드시 도면값을 실적값 자리에 둔다.
    {
      const r = master.computeMaster(P.exampleMaster.input);
      const e = P.exampleMaster.expected;
      rows.push(row('마스터플랜', '총 폭 (m)', r.totalWidth.value, e.totalWidth, TOL.masterWidth));
      rows.push(row('마스터플랜', '총 길이 (m)', r.totalLength.value, e.drawingLength, TOL.masterLength));
      rows.push(row('마스터플랜', '총 면적 (m²)', r.totalArea.value, e.drawingArea, TOL.masterLength));
    }

    return rows;
  }

  // --- 브라우저 전용 묘화 ---
  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function renderVerification() {
    const rows = buildVerification();
    const passed = rows.filter(r => r.pass).length;
    const allPass = passed === rows.length;

    const html = [
      '<section class="card">',
      '<div class="badge ' + (allPass ? 'ok' : 'ng') + '">',
      allPass ? '실적 검증 통과' : '검증 실패 있음',
      '</div>',
      '<h2>계산 엔진 검증</h2>',
      '<p class="dim">실제 설계자료의 수치를 계산 엔진이 재현하는지 대조합니다. ' +
        `${passed} / ${rows.length} 항목 통과.</p>`,
      '<table><thead><tr>',
      '<th>케이스</th><th>항목</th><th class="num">계산값</th>',
      '<th class="num">실적값</th><th class="num">오차</th><th>판정</th>',
      '</tr></thead><tbody>'
    ];

    // 소수부가 있는 값만 소수 1자리로 — 소수 자리가 잘리지 않게
    const dp = v => (v % 1 === 0 ? 0 : 1);

    for (const r of rows) {
      html.push(
        '<tr>',
        '<td>' + esc(r.case) + '</td>',
        '<td>' + esc(r.item) + '</td>',
        '<td class="num">' + fmt(r.calculated, dp(r.calculated)) + '</td>',
        '<td class="num">' + fmt(r.actual, dp(r.actual)) + '</td>',
        '<td class="num">' + r.errorPct.toFixed(3) + '%</td>',
        '<td class="' + (r.pass ? 'ok' : 'ng') + '">' + (r.pass ? '통과' : '실패') + '</td>',
        '</tr>'
      );
    }
    html.push('</tbody></table></section>');
    return html.join('');
  }

  // 부팅은 RSD.app.boot() 이 담당한다 — 여기서는 문자열만 만든다
  const api = {
    buildVerification: buildVerification,
    renderVerification: renderVerification,
    TOL: TOL
  };
  global.RSD = global.RSD || {};
  global.RSD.ui = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
