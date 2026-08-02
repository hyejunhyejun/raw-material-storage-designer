(function (global) {
  // 마스터플랜 띠 구성 — 2D 마스터플랜과 3D 부지가 같은 배선을 쓰도록 한 곳에 모은다.
  //
  // S/R + B/C 배선 규칙 (중요)
  //   연속한 야드 띠는 **원료와 무관하게 하나의 묶음**으로 보고,
  //   인접한 모든 야드 쌍 사이에 S/R + B/C 띠를 넣는다.
  //   S/R 은 붐이 양쪽으로 뻗으므로 띠 하나가 좌우 두 야드를 모두 담당한다 —
  //   이것이 최적이며 총폭도 최소가 된다 (야드 n열 → 띠 n−1개).
  //   야드가 1열뿐이면 한쪽에 띠를 붙여야 적치·불출이 가능하다.
  //
  //   이 규칙을 원료별로 따로 적용하면 서로 다른 원료의 야드가 맞닿는 지점에
  //   하역설비가 없어 그 야드를 쓸 수 없게 된다.

  function srBand(state, length, materialKeys) {
    return {
      label: '이동기기 및 Belt Conveyor 면적',
      note: '이동기기 ' + state.yard.srPerBand + '기',
      width: state.yard.srBandWidth,
      length: length,
      kind: 'sr',
      serves: materialKeys.slice()
    };
  }

  // 야드 n 열에 필요한 이동기기 및 B/C 띠 개수.
  //
  // 배선 규칙(위 주석)과 **같은 곳에서 나와야** 면적 산정과 배치도가 어긋나지 않는다.
  // 예전에는 rsd-app 이 원료별로 (열수−1) 을 따로 세는 바람에,
  // 철광석 3열 + 부원료 1열 = 야드 4열인데 띠를 2개만 세어
  // 실제 배치(3개)보다 부지가 한 띠만큼 작게 잡혔다.
  function srBandCount(yardRows) {
    if (yardRows <= 0) return 0;
    return (yardRows === 1) ? 1 : yardRows - 1;
  }

  function buildBands(state, result) {
    const keys = Object.keys(result.materials);

    // 1) 야드 열을 원료 순서대로 한 줄로 늘어놓는다
    const yardRows = [];
    const others = [];
    keys.forEach(function (k) {
      const e = result.materials[k];
      const m = e.material;
      if (e.type === 'yard') {
        const rows = e.sizing.rows.value;
        for (let r = 0; r < rows; r++) {
          yardRows.push({
            label: m.label + ' Yard ' + (r + 1),
            width: state.yard.yardWidth,
            length: state.yard.yardLength,
            kind: 'yard', color: m.color, materialKey: k,
            sizing: e.sizing, material: m,
            // 도면이 파일을 그리는 데 필요한 제원
            // 엔진이 잘라낸 '실제 배치 파일 수'를 쓴다 — 입력값을 그대로 그리면
            // 도면에는 30개가 있는데 계산은 14개로 된 상태가 된다
            pileCount: e.sizing.pileCount.value, pileGap: m.pileGap,
            maintLength: state.yard.maintLength, roadWidth: state.yard.roadWidth
          });
        }
      } else {
        others.push({ key: k, entry: e, material: m });
      }
    });

    // 부지 길이는 **실제 설비가 차지하는 길이**로 잡는다.
    // 외곽도로 길이를 야드 길이로 고정해 두면, 오픈야드를 하나도 안 쓰는
    // 구성(Shed·Silo 만)에서도 부지가 야드 길이만큼 길어져 버린다.
    const facilityLengths = yardRows.map(function (r) { return r.length; });
    others.forEach(function (o) {
      const e = o.entry;
      if (e.type === 'silo') facilityLengths.push(e.sizing.bandLength.value);
      else if (e.type === 'shed') facilityLengths.push(e.sizing.length.value);
    });
    const siteLength = facilityLengths.length
      ? Math.max.apply(null, facilityLengths)
      : state.yard.yardLength;

    const out = [];
    out.push({
      label: '외곽도로 / 배수로', width: state.master.perimeterRoad,
      length: siteLength, kind: 'road'
    });

    // 2) 야드 사이사이에 S/R 띠. 1열뿐이면 뒤에 하나 붙인다.
    if (yardRows.length === 1) {
      out.push(yardRows[0]);
      out.push(srBand(state, yardRows[0].length, [yardRows[0].materialKey]));
    } else {
      for (let i = 0; i < yardRows.length; i++) {
        out.push(yardRows[i]);
        if (i < yardRows.length - 1) {
          out.push(srBand(state, Math.max(yardRows[i].length, yardRows[i + 1].length),
            [yardRows[i].materialKey, yardRows[i + 1].materialKey]));
        }
      }
    }

    // 3) Silo · Shed 는 야드 묶음 뒤에
    others.forEach(function (o) {
      const e = o.entry, m = o.material;
      if (e.type === 'silo') {
        out.push({
          label: '공용 통행도로 + Silo Corridor', width: state.master.siloCorridor,
          length: siteLength, kind: 'road'
        });
        out.push({
          label: m.label + ' Silo ' + e.sizing.count.value + '기',
          width: e.sizing.bandWidth.value, length: e.sizing.bandLength.value,
          kind: 'silo', color: m.color, materialKey: o.key, sizing: e.sizing, material: m,
          // 산출 모드에서는 state.silo 가 옛 제원을 들고 있다 — 계산 결과를 쓴다
          pitch: e.sizing.pitch.value, innerDia: e.sizing.innerDia.value,
          footprintWidth: e.sizing.footprintWidth.value,
          totalHeight: e.sizing.totalHeight.value
        });
      } else if (e.type === 'shed') {
        out.push({
          label: m.label + ' Shed', width: e.sizing.width.value,
          length: e.sizing.length.value, kind: 'shed', color: m.color,
          materialKey: o.key, sizing: e.sizing, material: m,
          bays: state.shed.bays, wallThickness: state.shed.wallThickness,
          maintZone: state.shed.maintZone
        });
      }
    });

    out.push({
      label: '외곽 점검도로 / 유틸리티', width: state.master.inspectionRoad,
      length: siteLength, kind: 'road'
    });

    return out;
  }

  // 모든 야드가 S/R 띠와 맞닿는지 검증한다.
  // 하나라도 맞닿지 않으면 그 야드는 적치·불출이 불가능하다.
  function srCoverage(bands) {
    const uncovered = [];
    for (let i = 0; i < bands.length; i++) {
      if (bands[i].kind !== 'yard') continue;
      const prev = bands[i - 1], next = bands[i + 1];
      const ok = (prev && prev.kind === 'sr') || (next && next.kind === 'sr');
      if (!ok) uncovered.push(bands[i].label);
    }
    return { covered: uncovered.length === 0, uncovered: uncovered };
  }

  // 띠 배치 좌표 — 2D 마스터플랜과 3D 부지가 **같은 계산**을 쓰게 한다.
  //
  // 2D 는 y=0 에서 아래로 쌓고, 3D 는 부지 중심을 원점에 두고 Z 로 쌓는다.
  // 두 곳에 따로 적어 두면 한쪽만 고쳤을 때 도면과 3D 가 조용히 어긋난다 —
  // 실제로 확인할 방법도 없어서 오래 남는 종류의 결함이다.
  function bandLayout(bands) {
    const depth = totalWidth(bands);
    const out = [];
    let y = 0;
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];
      out.push({
        index: i,
        width: b.width,
        length: b.length,
        y0: y,                       // 2D: 띠 상단
        yc: y + b.width / 2,         // 2D: 띠 중심
        zc: y + b.width / 2 - depth / 2,   // 3D: 부지 중심 기준 Z
        x0: -b.length / 2            // 3D: 길이방향 시작
      });
      y += b.width;
    }
    return out;
  }

  function totalWidth(bands) {
    return bands.reduce(function (t, b) { return t + b.width; }, 0);
  }
  function totalLength(bands) {
    return bands.reduce(function (t, b) { return Math.max(t, b.length); }, 0);
  }

  const api = {
    buildBands: buildBands, srCoverage: srCoverage, srBandCount: srBandCount,
    bandLayout: bandLayout,
    totalWidth: totalWidth, totalLength: totalLength
  };
  global.RSD = global.RSD || {};
  global.RSD.bands = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
