const assert = require('assert');
const core = require('../js/rsd-core.js');

assert.strictEqual(typeof core.VERSION, 'string', 'VERSION은 문자열이어야 한다');
assert.ok(core.VERSION.length > 0, 'VERSION은 비어있지 않아야 한다');

console.log('OK: smoke');
