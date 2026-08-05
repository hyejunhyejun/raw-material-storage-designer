(function (global) {
  const req = (typeof require !== 'undefined');
  const core = req ? require('./rsd-core.js') : global.RSD.core;
  const math = req ? require('./rsd-math.js') : global.RSD.math;
  const res = core.res, fmt = core.fmt;

  const SRC = '오픈야드 저장량 산정 일반식 — 삼각기둥 + 양끝 원뿔';

  // 오픈야드 1열 계산 + 필요 열 수 산정
  //
  // 기호는 산정표를 따른다:
  //   A 야드길이 / B 정비공간 / C 적치길이 / D 야드폭 / E 차량통행로
  //   F 적치폭 / G 파일높이 / I 파일수 / J 파일간격 / L 삼각파일길이
  //   K 비중 / N 체적 / O 최대적치량 / P 적치효율 / Q 유효적치량 / R 적치면적
  //
  // 핵심: 파일 1개의 양끝 반원뿔을 합치면 원뿔 1개이며,
  //       길이방향으로 F(= 원뿔 직경)만큼을 잠식한다. L 식의 I×F 항이 이것이다.
  function computeYard(input) {
    const A = input.yardLength;
    const B = input.maintLength;
    const D = input.yardWidth;
    const E = input.roadWidth;
    const I = input.pileCount;
    const J = input.pileGap;
    const K = input.density;
    const H = input.repose;
    const P = input.operatingEff;

    const warnings = [];

    const C = A - B;
    const F = D - E;
    if (C <= 0) warnings.push('적치길이가 0 이하입니다 — 야드길이가 정비공간보다 커야 합니다');
    if (F <= 0) warnings.push('적치폭이 0 이하입니다 — 야드폭이 차량통행로보다 커야 합니다');

    const G = math.pileHeight(F, H);
    const R_cone = F / 2;

    // 파일 1개는 최소한 원뿔 2개(=지름 F) 를 차지하므로
    //   I×F + (I−1)×J ≤ C  ⟺  I ≤ (C + J) / (F + J)
    // 이 한계를 넘으면 물리적으로 배치가 성립하지 않는다.
    //
    // 예전에는 L 만 0 으로 눌렀는데, 그러면 원뿔 체적 I×Vcone 이 파일 수에 비례해
    // 계속 커져서 **파일을 늘릴수록 용량이 늘고 면적이 줄어드는** 거꾸로 된 결과가 나왔다.
    // (I=14 → 4열 / I=30 → 2열) 들어가지 못하는 파일은 세지 않아야 한다.
    const maxPiles = (F + J > 0) ? Math.floor((C + J) / (F + J)) : 0;
    const Ieff = Math.max(0, Math.min(I, maxPiles));
    if (Ieff < I) {
      warnings.push(
        `파일 ${I}개는 적치길이 ${fmt(C)} m 에 들어가지 않습니다 ` +
        `(파일 1개가 최소 ${fmt(F)} m + 간격 ${fmt(J)} m 를 차지 → 최대 ${maxPiles}개). ` +
        `${maxPiles}개로 계산했습니다 — 파일 수를 줄이거나 야드 길이를 늘리십시오`
      );
    }

    const gapOccupied = Math.max(0, (Ieff - 1) * J);
    const coneOccupied = Ieff * F;
    const L = Math.max(0, C - gapOccupied - coneOccupied);

    const vPrism = math.prismVolume(F, G, L);
    const vCone = Ieff * math.coneVolume(R_cone, G);
    const N = vPrism + vCone;
    const O = N * K;
    const Q = O * P;

    const stackArea = C * D;
    const footprintArea = A * D;

    // 정방향: 설계 대상용량이 주어지면 필요 열 수를 산정
    //
    // 설계 대상용량은 이미 '대상용량 ÷ 운영효율'로 부풀린 값이므로
    // 효율을 반영하지 않은 최대 적치량 O 와 비교해야 한다.
    // 유효 적치량 Q(= O × 효율) 와 비교하면 효율이 두 번 적용되어 면적이 과다 산정된다.
    // 담을 것이 없으면 야드도 없다. 최소 1열을 강제하면 사용량 0 인 원료가
    // 부지를 차지해 총 면적이 부풀려진다.
    let rows = 1, totalCapacity = Q;
    if (input.designCapacity !== undefined && input.designCapacity <= 0) {
      rows = 0; totalCapacity = 0;
    } else if (input.designCapacity && input.designCapacity > 0 && O > 0) {
      rows = Math.ceil(input.designCapacity / O);
      totalCapacity = Q * rows;
    }

    // 열은 통으로만 늘어난다 — 1열이 야드 길이 전체를 쓰므로,
    // 필요량이 조금만 넘어도 한 열을 통째로 더 지어 크게 남아돈다.
    // 숫자만 보면 '면적이 이만큼 필요하다' 로 읽히므로 남는다는 걸 알려 준다.
    if (rows > 0 && input.designCapacity > 0) {
      const over = (O * rows) / input.designCapacity;
      if (over >= 1.5) {
        warnings.push(
          `확보 용량이 필요량의 ${over.toFixed(1)}배입니다 ` +
          `(${rows}열 × ${fmt(Math.round(O))} t vs 필요 ${fmt(Math.round(input.designCapacity))} t). ` +
          `열은 통으로만 늘어나므로 야드 길이 A 를 줄이면 면적을 아낄 수 있습니다`
        );
      }
    }

    // 역방향: 일일 사용량이 주어지면 최종 적치가능 재고일수를 역산
    let achievedStockDays = 0;
    if (input.daily && input.daily > 0) {
      achievedStockDays = totalCapacity / input.daily;
    }

    return {
      stackLength: res(C, 'm', '적치길이 C = 야드길이 A − 정비공간 B',
        `= ${fmt(A)} − ${fmt(B)} = ${fmt(C)}`, SRC),
      stackWidth: res(F, 'm', '적치폭 F = 야드폭 D − 차량통행로 E',
        `= ${fmt(D)} − ${fmt(E)} = ${fmt(F)}`, SRC),
      pileHeight: res(G, 'm', '파일높이 G = (적치폭 F ÷ 2) × tan(안식각 H)',
        `= (${fmt(F)} ÷ 2) × tan(${H}°) = ${G.toFixed(2)}`, SRC),
      pileCount: res(Ieff, '개',
        '실제 배치 파일 수 = min(입력 파일수, 적치길이에 들어가는 최대 개수)',
        `= min(${I}, ⌊(${fmt(C)} + ${fmt(J)}) ÷ (${fmt(F)} + ${fmt(J)})⌋ = ${maxPiles}) = ${Ieff}`, SRC),
      prismLength: res(L, 'm', '삼각파일길이 L = C − (파일수−1)×간격 − 파일수×적치폭',
        `= ${fmt(C)} − ${fmt(gapOccupied)} − ${fmt(coneOccupied)} = ${fmt(L)}`, SRC),
      prismVolume: res(vPrism, 'm³', '직선구간 체적 = ½ × F × G × L',
        `= ½ × ${fmt(F)} × ${G.toFixed(2)} × ${fmt(L)} = ${fmt(vPrism)}`, SRC),
      coneVolume: res(vCone, 'm³', '원뿔구간 체적 = 파일수 × ⅓π(F/2)² × G',
        `= ${Ieff} × ⅓π × ${R_cone}² × ${G.toFixed(2)} = ${fmt(vCone)}`, SRC),
      volume: res(N, 'm³', '최대 적치체적 N = 직선구간 + 원뿔구간',
        `= ${fmt(vPrism)} + ${fmt(vCone)} = ${fmt(N)}`, SRC),
      maxCapacity: res(O, 't', '최대 적치량 O = 체적 N × 비중 K',
        `= ${fmt(N)} × ${K} = ${fmt(O)}`, SRC),
      effectiveCapacity: res(Q, 't', '유효 적치량 Q = 최대 적치량 O × 적치효율 P',
        `= ${fmt(O)} × ${P} = ${fmt(Q)}`, SRC),
      stackArea: res(stackArea, 'm²', '적치면적 R = 적치길이 C × 야드폭 D',
        `= ${fmt(C)} × ${fmt(D)} = ${fmt(stackArea)}`, SRC),
      footprintArea: res(footprintArea, 'm²', '점유면적 = 야드길이 A × 야드폭 D',
        `= ${fmt(A)} × ${fmt(D)} = ${fmt(footprintArea)}`, SRC),
      rows: res(rows, '열', '필요 열 수 = ceil(설계 대상용량 ÷ 1열 최대 적치량 O)',
        input.designCapacity
          ? `= ceil(${fmt(input.designCapacity)} ÷ ${fmt(O)}) = ${rows}`
          : '= 1 (설계 대상용량 미입력)', SRC),
      totalCapacity: res(totalCapacity, 't', '최종 적치가능 용량 = 1열 유효적치량 × 열 수',
        `= ${fmt(Q)} × ${rows} = ${fmt(totalCapacity)}`, SRC),
      achievedStockDays: res(achievedStockDays, 'day',
        '최종 적치가능 재고일수 = 최종 적치가능 용량 ÷ 일일 사용량',
        input.daily
          ? `= ${fmt(totalCapacity)} ÷ ${fmt(input.daily)} = ${achievedStockDays.toFixed(1)}`
          : '= 0 (일일 사용량 미입력)', SRC),
      warnings: warnings
    };
  }

  const api = { computeYard: computeYard, SRC: SRC };
  global.RSD = global.RSD || {};
  global.RSD.yard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
