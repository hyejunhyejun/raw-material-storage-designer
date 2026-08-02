(function (global) {
  // 도 단위 탄젠트
  function tan(deg) { return Math.tan(deg * Math.PI / 180); }

  // 삼각기둥 부피 = ½ × 밑변폭 × 높이 × 길이
  function prismVolume(width, height, length) {
    return 0.5 * width * height * length;
  }

  // 원뿔 부피 = ⅓ × π × 반경² × 높이
  function coneVolume(radius, height) {
    return (1 / 3) * Math.PI * radius * radius * height;
  }

  // 안식각 스톡파일 적치높이 = (적치폭 / 2) × tan(안식각)
  function pileHeight(stackWidth, reposeDeg) {
    return (stackWidth / 2) * tan(reposeDeg);
  }

  const api = {
    tan: tan,
    prismVolume: prismVolume,
    coneVolume: coneVolume,
    pileHeight: pileHeight
  };
  global.RSD = global.RSD || {};
  global.RSD.math = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
