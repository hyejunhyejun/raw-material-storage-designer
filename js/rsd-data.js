(function (global) {
  // 원료 성상값 출처 태그
  const SRC_MATERIAL = '공개 벌크재료 물성 대표값 — 프로젝트별로 반드시 재확인할 것';
  const SRC_YARD = '오픈야드 저장량 산정표 (일반식)';
  const SRC_SHED = 'Shed 단면 계산식 (일반 비대칭 단면)';
  const SRC_SILO = '원형 Silo 직선배치 일반식';

  const DEFAULTS = {
    operatingDays: 365,

    // color 는 도면 묘화용 — 실제 원료 색을 도면 팔레트로 채도 낮춰 옮긴 값
    materials: {
      coal:    { label: '석탄',         density: 0.8, repose: 36, stockDays: 30,
                 color: '#2B2B33',
                 types: ['yard', 'shed', 'silo'], source: SRC_MATERIAL },
      ironOre: { label: '철광석',       density: 2.3, repose: 33, stockDays: 15,
                 color: '#8C4A38',
                 types: ['yard', 'shed'],         source: SRC_MATERIAL },
      flux:    { label: '부원료(석회석)', density: 1.5, repose: 37, stockDays: 15,
                 color: '#B0A899',
                 types: ['yard', 'shed', 'silo'], source: SRC_MATERIAL }
    },

    // 오픈야드 — 기호는 산정표를 따름
    yard: {
      yardLength: 750,     // A 야드 길이
      maintLength: 40,     // B 정비공간 (절대값 차감)
      yardWidth: 50,       // D 야드 폭
      roadWidth: 4,        // E 차량 통행로 (절대값 차감)
      pileCount: 10,       // I 파일 수 (Brand 수)
      pileGap: 5,          // J 파일간 간격
      operatingEff: 0.75,  // P 적치효율
      srBandWidth: 10,     // 야드 사이 S/R + B/C 띠 폭
      perimeterRoad: 10,   // 외곽도로 / 배수로 / 유틸리티 (편측)
      srPerBand: 2,        // B/C 1열당 S/R 기수 (최대 2)
      srMode: 'combined',  // combined = 겸용기 / separate = Stacker + Reclaimer 분리
      source: SRC_YARD
    },

    // Shed — 비대칭 단면, 중앙 옹벽 등맞대기
    shed: {
      La: 35,                    // 개방측 적치 수평거리
      Lb: 10.5,                  // 옹벽측 적치 수평거리
      bottomSlope: 8.47,         // 하부 경사각 (도면 7°는 시공경사, 계산 투입값은 8.47°)
      wallThickness: 2.0,        // 셀 간 격벽 두께
      endWallThickness: 2.0,     // 양단벽 두께
      centerWallThickness: 2.0,  // 중앙 옹벽 두께
      slopeSideClear: 0,         // 법면측 여유 (옹벽에 직접 기댐)
      openSideClear: 13.5,       // 개방측 여유 (SPR 주행 + 불출 B/C 2Line + 외벽)
      maintZone: 15.25,          // 정비존 (상·하 각각)
      bays: 2,                   // bay 수 (1 또는 2)
      trippers: 2,               // 중앙 옹벽 상부 적치 Tripper 기수
      sprPerBay: 2,              // Semi Portal Reclaimer — 면당 기수
      cellLength: 37,            // 셀 기본 길이 (add 모드에서 고정값)
      cellsPerBayCount: 6,       // bay 당 셀 수
      sizingMode: 'grow',        // grow = 셀 수 고정·길이를 늘림 / add = 길이 고정·개수를 늘림
      totalHeight: 60.5,         // 전고
      operatingEff: 0.75,
      source: SRC_SHED
    },

    // 원형 Silo
    //
    // 기준 제원 41 m⌀ × 57.6 m 는 5만톤·석탄 0.8 t/m³ 기준이며 스스로 정합적이다.
    // (충전율 0.822 · 세장비 1.405) 다른 용량은 이 두 비를 유지한 상사 확대로 산출한다.
    silo: {
      sizingMode: 'derive', // derive = 용량에서 제원 산출 / manual = 벤더 제원 직접 입력
      capacity: 50000,      // 1기 용량
      fillRatio: 0.82,      // 유효 충전율 — 하부 콘·상부 여유를 뺀 실제 담기는 비율
      slenderness: 1.405,   // 세장비 H/D — 기준 제원에서 역산
      clearance: 10,        // 순이격 (접근·시공 여유, 직경과 함께 커지지 않는다)
      sideMargin: 20,       // 점유폭 여유 = 점유폭 − 직경
      innerDia: 41,         // 내부 직경 (derive 모드에서는 산출값)
      totalHeight: 57.6,    // 전체 높이 (derive 모드에서는 산출값)
      pitch: 51,            // 중심간격 (derive 모드에서는 산출값)
      footprintWidth: 61,   // 점유 폭 (derive 모드에서는 산출값)
      corridorWidth: 5,     // 상부 공급/불출 B/C corridor
      rows: 1,              // 열 수
      trippers: 2,          // 상부 적치 Tripper 기수
      operatingEff: 0.60,
      source: SRC_SILO
    },

    // 마스터플랜
    master: {
      perimeterRoad: 10,    // 외곽도로 / 배수로 (상단)
      inspectionRoad: 5,    // 외곽 점검도로 (하단)
      siloCorridor: 5       // 공용 통행도로 + Silo corridor
    }
  };

  // 검증 프리셋 — 제공된 실제 설계자료의 입력값과 실적 결과
  const PRESETS = {
    exampleYardA: {
      label: '예시 A · 석탄야드',
      source: SRC_YARD,
      input: {
        yardLength: 800, maintLength: 40, yardWidth: 45, roadWidth: 4,
        pileCount: 9, pileGap: 5, density: 0.85, repose: 35, operatingEff: 0.75
      },
      expected: {
        stackLength: 760, stackWidth: 41, pileHeight: 14.35, prismLength: 351,
        volume: 160140, maxCapacity: 136119, effectiveCapacity: 102089,
        stackArea: 34200
      }
    },
    exampleYardB: {
      label: '예시 B · 석탄야드',
      source: SRC_YARD,
      input: {
        yardLength: 1100, maintLength: 40, yardWidth: 45, roadWidth: 4,
        pileCount: 12, pileGap: 5, density: 0.85, repose: 35, operatingEff: 0.75
      },
      expected: {
        stackLength: 1060, stackWidth: 41, pileHeight: 14.35, prismLength: 513,
        volume: 226762, maxCapacity: 192747, effectiveCapacity: 144561,
        stackArea: 47700
      }
    },
    exampleShed: {
      label: 'Shed 예시 (2 bay)',
      source: SRC_SHED,
      input: {
        La: 32, Lb: 11, repose: 35, bottomSlope: 8.5, density: 0.85,
        bays: 2,
        cellsPerBay: [
          [18, 36, 36, 36, 36, 36],
          [18, 36, 36, 36, 36, 36]
        ],
        wallThickness: 2.0, endWallThickness: 2.0, centerWallThickness: 2.0,
        slopeSideClear: 0, openSideClear: 13.5, maintZone: 15.25
      },
      expected: {
        sectionArea: 700.78, tPerM: 595.67, stackLengthPerBay: 198,
        totalCapacity: 235884, length: 242.5, width: 115
      }
    },
    exampleSilo: {
      label: 'Silo 예시 (12기 1열)',
      source: SRC_SILO,
      input: { count: 12, rows: 1, pitch: 50, footprintWidth: 60, innerDia: 40 },
      expected: { bandLength: 610, bandWidth: 60, clearance: 10 }
    },
    exampleMaster: {
      label: '통합 배치 예시',
      source: SRC_SILO,
      // 도면의 띠 구성을 그대로 재현
      input: {
        bands: [
          { label: '외곽도로 / 배수로',                              width: 10, length: 800, kind: 'road' },
          { label: 'Iron Ore Yard ①',                               width: 45, length: 800, kind: 'yard' },
          { label: 'S/R 2기 + Belt Conveyor',                       width: 10, length: 800, kind: 'sr', srPerBand: 2 },
          { label: 'Iron Ore Yard ②',                               width: 45, length: 800, kind: 'yard' },
          { label: 'S/R 2기 + Belt Conveyor',                       width: 10, length: 800, kind: 'sr', srPerBand: 2 },
          { label: 'Flux Yard',                                     width: 45, length: 800, kind: 'yard' },
          { label: '공용 통행도로 + Silo 공급/불출 Conveyor Corridor', width: 5,  length: 800, kind: 'road' },
          { label: 'Coal Silo 1열 직선배치 (12기)',                  width: 60, length: 610, kind: 'silo' },
          { label: '외곽 점검도로 / 배수로 / 유틸리티',               width: 5,  length: 800, kind: 'road' }
        ]
      },
      expected: { totalWidth: 235, totalLength: 800, drawingLength: 800, drawingArea: 188000 }
    }
  };

  function getDefaults() { return JSON.parse(JSON.stringify(DEFAULTS)); }

  const api = { getDefaults: getDefaults, PRESETS: PRESETS };
  global.RSD = global.RSD || {};
  global.RSD.data = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
