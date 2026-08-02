const assert = require('assert');
const data = require('../js/rsd-data.js');

const D = data.getDefaults();

// --- 원료 3종 ---
assert.deepStrictEqual(Object.keys(D.materials).sort(), ['coal', 'flux', 'ironOre']);
assert.strictEqual(D.materials.coal.density, 0.8);
assert.strictEqual(D.materials.coal.repose, 36);
assert.strictEqual(D.materials.ironOre.density, 2.3);
assert.strictEqual(D.materials.ironOre.repose, 33);
assert.strictEqual(D.materials.flux.density, 1.5);
assert.strictEqual(D.materials.flux.repose, 37);

// --- 타입 적용 가능 여부 (요구사항 3번) ---
assert.deepStrictEqual(D.materials.coal.types, ['yard', 'shed', 'silo']);
assert.deepStrictEqual(D.materials.ironOre.types, ['yard', 'shed']);
assert.deepStrictEqual(D.materials.flux.types, ['yard', 'shed', 'silo']);

// --- 운영효율 기본값 ---
assert.strictEqual(D.yard.operatingEff, 0.75);
assert.strictEqual(D.shed.operatingEff, 0.75);
assert.strictEqual(D.silo.operatingEff, 0.60);

// --- 야드 기본 파라미터 ---
assert.strictEqual(D.yard.yardWidth, 50);      // D
assert.strictEqual(D.yard.roadWidth, 4);       // E 차량통행로
assert.strictEqual(D.yard.maintLength, 40);    // B 정비공간
assert.strictEqual(D.yard.pileCount, 10);      // I
assert.strictEqual(D.yard.pileGap, 5);         // J
assert.strictEqual(D.yard.srBandWidth, 10);    // S/R + B/C 띠
assert.strictEqual(D.yard.perimeterRoad, 10);  // 외곽도로/배수로

// --- Shed 기본 파라미터 ---
assert.strictEqual(D.shed.La, 35);
assert.strictEqual(D.shed.Lb, 10.5);
assert.strictEqual(D.shed.bottomSlope, 8.47);
assert.strictEqual(D.shed.wallThickness, 2.0);
assert.strictEqual(D.shed.endWallThickness, 2.0);
assert.strictEqual(D.shed.centerWallThickness, 2.0);
assert.strictEqual(D.shed.slopeSideClear, 0);
assert.strictEqual(D.shed.openSideClear, 13.5);
assert.strictEqual(D.shed.maintZone, 15.25);
assert.strictEqual(D.shed.bays, 2);
assert.strictEqual(D.shed.totalHeight, 60.5);

// --- Silo 기본 파라미터 ---
assert.strictEqual(D.silo.capacity, 50000);
assert.strictEqual(D.silo.innerDia, 41);
assert.strictEqual(D.silo.totalHeight, 57.6);
assert.strictEqual(D.silo.pitch, 51);
assert.strictEqual(D.silo.footprintWidth, 61);
assert.strictEqual(D.silo.corridorWidth, 5);
assert.strictEqual(D.silo.rows, 1);

// --- getDefaults()는 깊은 복사본을 반환 (원본 오염 방지) ---
const a = data.getDefaults();
a.yard.yardWidth = 999;
const b = data.getDefaults();
assert.strictEqual(b.yard.yardWidth, 50, 'getDefaults()는 매번 새 복사본이어야 한다');

// --- 검증 프리셋 5종 ---
assert.deepStrictEqual(
  Object.keys(data.PRESETS).sort(),
  ['exampleMaster', 'exampleShed', 'exampleSilo', 'exampleYardA', 'exampleYardB']
);

// 예시 야드 A — 입력값과 골든 결과 (회귀시험용)
const g1 = data.PRESETS.exampleYardA;
assert.strictEqual(g1.input.yardLength, 800);
assert.strictEqual(g1.input.maintLength, 40);
assert.strictEqual(g1.input.yardWidth, 45);
assert.strictEqual(g1.input.roadWidth, 4);
assert.strictEqual(g1.input.pileCount, 9);
assert.strictEqual(g1.input.pileGap, 5);
assert.strictEqual(g1.input.density, 0.85);
assert.strictEqual(g1.input.repose, 35);
assert.strictEqual(g1.input.operatingEff, 0.75);
assert.strictEqual(g1.expected.effectiveCapacity, 102089);
assert.strictEqual(g1.expected.stackArea, 34200);

// 예시 야드 B
const g2 = data.PRESETS.exampleYardB;
assert.strictEqual(g2.input.yardLength, 1100);
assert.strictEqual(g2.input.pileCount, 12);
assert.strictEqual(g2.expected.effectiveCapacity, 144561);
assert.strictEqual(g2.expected.stackArea, 47700);

console.log('OK: data');
