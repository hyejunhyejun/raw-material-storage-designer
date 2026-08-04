// 전 테스트를 순차 실행. 하나라도 실패하면 비정상 종료한다.
const { execFileSync } = require('child_process');
const path = require('path');

const tests = [
  'smoke.test.js',
  'core.test.js',
  'math.test.js',
  'data.test.js',
  'engine-yard.test.js',
  'engine-shed.test.js',
  'engine-silo.test.js',
  'engine-master.test.js',
  'app.test.js',
  'ui-controls.test.js',
  'draw2d.test.js',
  'ui-yard.test.js',
  'bands.test.js',
  'equip.test.js',
  'anim.test.js',
  'draw3d-label.test.js',
  'draw2d-help.test.js',
  'draw2d-shed.test.js',
  'draw2d-silo.test.js',
  'draw2d-master.test.js',
  'compare.test.js',
  'shed-manual.test.js',
  'shed-shared.test.js',
  'wiring.test.js',
  'cross-check.test.js',
  'consistency.test.js',
  'edge-cases.test.js',
  'export.test.js',
  'sensitivity.test.js',
  'verification.test.js'
];

let failed = 0;
for (const t of tests) {
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, t)], { encoding: 'utf8' });
    process.stdout.write(out);
  } catch (e) {
    failed++;
    console.error(`FAIL: ${t}`);
    console.error(e.stdout || '');
    console.error(e.stderr || '');
  }
}

if (failed > 0) {
  console.error(`\n${failed}개 테스트 실패`);
  process.exit(1);
}
console.log('\n전체 통과');
