(function (global) {
  // 하역설비 수량·배치 산정 — 형상과 무관한 순수 로직
  //
  //   야드  : Stacker(적치) / Reclaimer(불출) / Stacker-Reclaimer(겸용)
  //   Silo  : 상부 Tripper 적치, 하부 RDM 불출
  //   Shed  : 중앙 옹벽 상부 Tripper 적치, 면당 SPR 2기 불출
  const SR_MAX = 2;   // B/C 1열당 S/R 최대 기수

  // 야드 S/R 배치.
  //
  // 같은 레일 위를 도는 기계끼리 충돌하면 안 되므로, 야드를 기수만큼 담당 구역으로
  // 나누고 각 기계는 자기 구역 안에서만 왕복한다. 구역 경계에는 여유(guard)를 둬서
  // 이웃 기계와 물리적으로 만나지 않게 한다.
  //   겸용(combined) : 전부 Stacker-Reclaimer
  //   분리(separate) : 첫 기는 Stacker, 나머지는 Reclaimer
  //
  // zoneFrom/zoneTo/travelRatio 는 야드 길이에 대한 비율(0~1)이다.
  const ZONE_GUARD = 0.16;   // 구역 폭의 16% 는 비워 둔다 (양끝 8% 씩)

  function yardEquipment(spec) {
    const n = Math.max(0, Math.min(SR_MAX, spec.perBand | 0));
    const out = [];
    for (let i = 0; i < n; i++) {
      const type = (spec.mode === 'separate') ? (i === 0 ? 'stacker' : 'reclaimer') : 'sr';
      const zoneFrom = i / n;
      const zoneTo = (i + 1) / n;
      const zoneW = zoneTo - zoneFrom;
      out.push({
        type: type,
        xRatio: zoneFrom + zoneW / 2,            // 구역 중앙에 선다
        zoneFrom: zoneFrom, zoneTo: zoneTo,
        travelRatio: zoneW * (1 - ZONE_GUARD)    // 구역 안에서만 왕복
      });
    }
    return out;
  }

  // Silo — 상부 Tripper 적치, 하부 RDM 불출 (Silo 1기당 RDM 1기)
  //
  // 상부 공급 B/C 는 Silo 중심 위를 지나야 장입이 된다. 따라서 열이 2열 이상이면
  // 열마다 공급 라인과 Tripper 가 최소 1기씩 필요하다.
  // Tripper 총 기수가 열 수보다 적으면 장입 불가한 열이 생긴다.
  function siloEquipment(spec) {
    const count = Math.max(0, spec.count | 0);
    const rows = Math.max(1, spec.rows | 0);
    const asked = Math.max(0, spec.trippers | 0);
    const trippers = Math.max(rows, asked);        // 열마다 최소 1기는 확보
    const perRow = Math.floor(trippers / rows);
    const warnings = [];
    if (asked < rows) {
      warnings.push('Silo ' + rows + '열은 열마다 공급 B/C 와 Tripper 가 필요합니다. ' +
        'Tripper 를 ' + asked + '기로 두면 장입되지 않는 열이 생기므로 ' +
        rows + '기로 올려 계산했습니다');
    }
    return {
      trippers: trippers, askedTrippers: asked,
      rows: rows, trippersPerRow: perRow,
      feedLines: rows,                              // 열마다 공급 B/C 1줄
      rdmPerSilo: 1, rdmTotal: count,
      warnings: warnings
    };
  }

  // Shed — 중앙 옹벽 상부 Tripper 적치, 면당 SPR 2기 불출
  function shedEquipment(spec) {
    const bays = Math.max(1, spec.bays | 0);
    const per = Math.max(0, spec.sprPerBay | 0);
    return {
      trippers: Math.max(0, spec.trippers | 0),
      sprPerBay: per,
      sprTotal: bays * per
    };
  }

  // ---------- Silo 3D 배치 좌표 ----------
  //
  // 좌표를 그리는 코드 안에 흩어 두면 확인할 방법이 없다.
  // 실제로 '하부 불출 B/C 가 Silo 밑을 가로지르는' 결함이 여기서 나왔다 —
  // 벨트를 띠 중심(zc)에 한 줄만 놓아 2열 이상일 때 안쪽 열이 불출 경로를 잃었다.
  //
  // 규칙
  //   · Silo 는 열마다 pitch 간격, 전체가 띠 중심에 대칭
  //   · RDM 배출부는 Silo 몸통 **안쪽 가장자리** (밑에 들어간다)
  //   · 불출 B/C 는 열마다 Silo **바깥 옆** — 몸통과 겹치지 않아야 한다
  //   · 공급 갤러리·Tripper 는 열마다 Silo **중심 바로 위**라야 장입이 된다
  function siloLayout(o) {
    const n = Math.max(0, o.count | 0);
    const perRow = Math.max(1, o.perRow | 0);
    const rows = Math.max(1, Math.ceil(n / perRow));
    const pitch = o.pitch, dia = o.innerDia;
    const x0 = -o.length / 2;

    const rowZ = [];
    for (let r = 0; r < rows; r++) rowZ.push((r - (rows - 1) / 2) * pitch);

    const silos = [];
    let placed = 0;
    for (let r = 0; r < rows && placed < n; r++) {
      for (let i = 0; i < perRow && placed < n; i++, placed++) {
        silos.push({
          row: r, index: placed,
          x: x0 + o.footprintWidth / 2 + i * pitch,
          z: rowZ[r],
          rdmZ: rowZ[r] + dia * 0.34          // 몸통 안쪽 — 밑에 들어간다
        });
      }
    }
    const feedZ = rowZ.slice();                // 공급 갤러리 = 열 중심 바로 위
    const outZ = rowZ.map(function (z) {       // 불출 B/C = 몸통 바깥 옆
      return z + dia / 2 + (o.beltClear === undefined ? 3.5 : o.beltClear);
    });
    return { rows: rows, perRow: perRow, rowZ: rowZ, silos: silos, feedZ: feedZ, outZ: outZ, x0: x0 };
  }

  // ---------- Shed 내부 배치 좌표 ----------
  //
  // 3D 에서 셀별 원료 더미·격벽을 어디에 놓을지. 그리는 코드 안에 흩어 두면
  // 확인할 방법이 없다 — 실제로 압출 방향 부호를 잘못 잡아 더미가 중앙 옹벽
  // 속으로 파고드는 결함이 났다.
  //
  // 좌표계: 건물 중심이 원점, x = 길이방향, z = 폭방향
  //   · 2 bay — 중앙 옹벽이 건물 한가운데(z=0), 원료가 양쪽으로
  //   · 1 bay — 옹벽이 건물 **한쪽 끝**에 붙고 원료는 한 방향으로만.
  //     (bay 폭에 옹벽 절반이 이미 들어 있으므로 옹벽을 가운데 두면
  //      원료가 건물 밖으로 절반이나 튀어나간다)
  //   · 더미는 옹벽면에서 개방측으로 (Lb + La) 만큼 뻗는다
  //   · dir = +1 이면 +z 방향, −1 이면 −z 방향
  function shedLayout(o) {
    const bays = Math.max(1, o.bays);
    const L = o.length, W = o.width;
    const cw = o.centerWall, mz = o.maintZone, wt = o.wallThickness;
    const reach = o.Lb + o.La;                 // 옹벽면에서 개방측 끝까지
    // 중앙 옹벽 중심 — 2 bay 면 한가운데, 1 bay 면 한쪽 끝
    const wallCenter = (bays === 1) ? (-W / 2 + cw / 2) : 0;

    const byBay = {};
    (o.cells || []).forEach(function (c) {
      const b = c.bay || 1;
      if (!byBay[b]) byBay[b] = [];
      byBay[b].push(c);
    });

    const piles = [], partitions = [], outBelts = [];
    for (let bay = 0; bay < bays; bay++) {
      const dir = (bays === 1) ? 1 : (bay === 0 ? -1 : 1);
      const wallFace = wallCenter + dir * cw / 2;
      const list = byBay[bay + 1] || [];
      let x = -L / 2 + mz;
      list.forEach(function (c, i) {
        const len = (c.length && c.length.value !== undefined) ? c.length.value : c.length;
        piles.push({
          bay: bay + 1, index: i, key: c.key || null,
          x: x, len: len,
          z: wallFace, dir: dir,
          zFar: wallFace + dir * reach       // 개방측 끝
        });
        partitions.push({ x: x - wt / 2, zCenter: wallFace + dir * reach / 2, depth: reach,
                          z: wallFace, dir: dir });
        x += len + wt;
      });
      if (list.length) {
        partitions.push({ x: x - wt / 2, zCenter: wallFace + dir * reach / 2, depth: reach,
                          z: wallFace, dir: dir });
      }
      // 하부 불출 B/C — 개방측 바깥
      outBelts.push({ bay: bay + 1, z: wallFace + dir * (reach + o.openSideClear * 0.5) });
    }
    return { bays: bays, piles: piles, partitions: partitions, outBelts: outBelts,
             wallCenter: wallCenter, wallThickness: cw,
             halfWidth: W / 2, halfLength: L / 2, reach: reach };
  }

  const api = {
    shedLayout: shedLayout,
    siloLayout: siloLayout,
    yardEquipment: yardEquipment, siloEquipment: siloEquipment,
    shedEquipment: shedEquipment, SR_MAX: SR_MAX, ZONE_GUARD: ZONE_GUARD
  };
  global.RSD = global.RSD || {};
  global.RSD.equip = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
