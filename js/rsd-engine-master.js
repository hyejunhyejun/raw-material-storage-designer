(function (global) {
  const req = (typeof require !== 'undefined');
  const core = req ? require('./rsd-core.js') : global.RSD.core;
  const res = core.res, fmt = core.fmt;

  const SRC = '마스터플랜 띠 적층 — 총 폭 = Σ띠폭, 총 길이 = max(띠길이)';
  const SR_MAX = 2;  // B/C 1열당 S/R 최대 기수
  const NUM = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

  // 야드 열 수에서 띠 배열 생성.
  // 야드 사이에 S/R + B/C 띠를 공유 배치해 총폭을 최소화한다.
  //   1열 → 야드 · S/R
  //   2열 → 야드① · S/R · 야드②
  //   n열 → 야드① · S/R · 야드② · S/R · … · 야드ⓝ  (S/R 띠 n−1개)
  function buildYardBands(spec) {
    const bands = [];
    const rows = spec.rows;
    const srLabel = `S/R ${spec.srPerBand}기, Belt Conveyor`;

    if (rows <= 0) return bands;

    if (rows === 1) {
      bands.push({
        label: spec.label, kind: 'yard',
        width: spec.yardWidth, length: spec.yardLength, srPerBand: 0
      });
      bands.push({
        label: srLabel, kind: 'sr',
        width: spec.srBandWidth, length: spec.yardLength, srPerBand: spec.srPerBand
      });
      return bands;
    }

    for (let i = 0; i < rows; i++) {
      bands.push({
        label: `${spec.label} ${NUM[i] || '(' + (i + 1) + ')'}`, kind: 'yard',
        width: spec.yardWidth, length: spec.yardLength, srPerBand: 0
      });
      if (i < rows - 1) {
        bands.push({
          label: srLabel, kind: 'sr',
          width: spec.srBandWidth, length: spec.yardLength, srPerBand: spec.srPerBand
        });
      }
    }
    return bands;
  }

  // 밴드 적층: 총 폭 = Σ 띠 폭, 총 길이 = max(띠 길이)
  function computeMaster(input) {
    const src = input.bands || [];
    const warnings = [];

    let totalWidth = 0, totalLength = 0;
    const bands = [];
    for (let i = 0; i < src.length; i++) {
      const b = src[i];
      bands.push(Object.assign({}, b, { offsetY: totalWidth }));
      totalWidth += b.width;
      if (b.length > totalLength) totalLength = b.length;

      if (b.srPerBand && b.srPerBand > SR_MAX) {
        warnings.push(
          `'${b.label}': B/C 1열당 S/R은 최대 ${SR_MAX}기입니다 ` +
          `(현재 ${b.srPerBand}기) — B/C 열을 추가하거나 기수를 줄이십시오`
        );
      }
    }

    const totalArea = totalWidth * totalLength;
    const widthTerms = src.map(b => b.width).join(' + ');

    return {
      bands: bands,
      totalWidth: res(totalWidth, 'm', '총 폭 = Σ 각 띠의 폭',
        src.length ? `= ${widthTerms} = ${fmt(totalWidth)}` : '= 0 (띠 없음)', SRC),
      totalLength: res(totalLength, 'm', '총 길이 = max(각 띠의 길이)',
        `= ${fmt(totalLength)}`, SRC),
      totalArea: res(totalArea, 'm²', '총 부지면적 = 총 폭 × 총 길이',
        `= ${fmt(totalWidth)} × ${fmt(totalLength)} = ${fmt(totalArea)}`, SRC),
      warnings: warnings
    };
  }

  const api = {
    computeMaster: computeMaster, buildYardBands: buildYardBands,
    SR_MAX: SR_MAX, SRC: SRC
  };
  global.RSD = global.RSD || {};
  global.RSD.master = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
