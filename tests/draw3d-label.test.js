const assert = require('assert');
const d3 = require('../js/rsd-draw3d.js');

// dimSpec 은 순수 함수 — THREE 없이도 계산된다
{
  const site = { len: 750, depth: 161, height: 57.6 };
  const list = d3.dimSpec(site);
  const texts = list.map(d => d.text);

  assert.ok(texts.some(t => /750/.test(t)), '총 길이 치수가 있어야 한다');
  assert.ok(texts.some(t => /161/.test(t)), '총 폭 치수가 있어야 한다');
  assert.ok(texts.some(t => /57\.6/.test(t)), '최고 높이 치수가 있어야 한다');

  list.forEach(function (d) {
    assert.strictEqual(d.from.length, 3, 'from 은 3차원 좌표');
    assert.strictEqual(d.to.length, 3, 'to 는 3차원 좌표');
    assert.ok(d.text.length > 0, '라벨이 비어 있으면 안 된다');
    d.from.concat(d.to).forEach(function (v) {
      assert.ok(Number.isFinite(v), '좌표는 유한수여야 한다');
    });
  });
}

// 치수선은 부지 바깥에 놓여 설비와 겹치지 않아야 한다
{
  const site = { len: 750, depth: 161, height: 57.6 };
  const list = d3.dimSpec(site);
  const lenDim = list.find(d => /총 길이/.test(d.text));
  const depthDim = list.find(d => /총 폭/.test(d.text));

  assert.ok(Math.abs(lenDim.from[2]) > site.depth / 2,
    '길이 치수선은 부지 폭 바깥(|z| > depth/2)에 있어야 한다');
  assert.ok(Math.abs(depthDim.from[0]) > site.len / 2,
    '폭 치수선은 부지 길이 바깥(|x| > len/2)에 있어야 한다');
}

// 길이 치수는 실제 부지 길이만큼 뻗는다
{
  const site = { len: 750, depth: 161, height: 57.6 };
  const list = d3.dimSpec(site);
  const lenDim = list.find(d => /총 길이/.test(d.text));
  assert.strictEqual(Math.abs(lenDim.to[0] - lenDim.from[0]), 750, '길이 치수선 길이 = 부지 길이');
  const depthDim = list.find(d => /총 폭/.test(d.text));
  assert.strictEqual(Math.abs(depthDim.to[2] - depthDim.from[2]), 161, '폭 치수선 길이 = 부지 폭');
}

// ===== 원료 표시 필터 =====
{
  const keys = ['coal', 'ironOre', 'flux'];
  assert.deepStrictEqual(d3.visibleFilter(keys, {}), keys, '기본은 전부 표시');
  assert.deepStrictEqual(d3.visibleFilter(keys, { coal: true }), ['ironOre', 'flux'],
    '숨김 지정한 원료는 빠진다');
  assert.deepStrictEqual(d3.visibleFilter(keys, { coal: true, ironOre: true, flux: true }), [],
    '전부 숨기면 빈 배열');
}

console.log('OK: draw3d-label');
