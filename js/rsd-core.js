(function (global) {
  const VERSION = '1.0.0';

  // 천단위 구분 포맷 — 대입값 문자열 가독성용
  function fmt(n, digits) {
    const d = (digits === undefined) ? 0 : digits;
    return Number(n).toLocaleString('ko-KR', {
      minimumFractionDigits: d, maximumFractionDigits: d
    });
  }

  // 계산 추적 객체: 값 + 단위 + 식 + 대입값 + 근거
  function res(value, unit, formula, substitution, source) {
    return {
      value: value,
      unit: unit,
      formula: formula,
      substitution: substitution,
      source: source
    };
  }

  // 공통 수요 파이프라인 (정방향)
  //   연간사용량 ÷ 가동일수 → 일일사용량
  //   일일사용량 × 재고일수 → 대상 저장용량
  //   대상 저장용량 ÷ 운영효율 → 설계 대상용량
  function computeDemand(input) {
    const days = input.operatingDays;
    const eff = input.operatingEff;
    if (!days || days <= 0) throw new Error('가동일수는 0보다 커야 합니다');
    if (!eff || eff <= 0) throw new Error('운영효율은 0보다 커야 합니다');

    const SRC = input.label ? (input.label + ' 사용자 입력') : '사용자 입력';
    const daily = input.annualUsage / days;
    const target = daily * input.stockDays;
    const design = target / eff;

    return {
      daily: res(daily, 't/day', '일일 사용량 = 연간 사용량 ÷ 가동일수',
        `= ${fmt(input.annualUsage)} ÷ ${fmt(days)} = ${fmt(daily)}`, SRC),
      targetCapacity: res(target, 't', '대상 저장용량 = 일일 사용량 × 목표 재고일수',
        `= ${fmt(daily)} × ${fmt(input.stockDays)} = ${fmt(target)}`, SRC),
      designCapacity: res(design, 't', '설계 대상용량 = 대상 저장용량 ÷ 운영효율',
        `= ${fmt(target)} ÷ ${eff} = ${fmt(design)}`, SRC)
    };
  }

  const api = { VERSION: VERSION, res: res, fmt: fmt, computeDemand: computeDemand };
  global.RSD = global.RSD || {};
  global.RSD.core = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
