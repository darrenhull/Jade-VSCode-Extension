 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {breakpointPosition}=require('../../extension/src/debug-source');
test('native mapped columns are used while ordinary line breakpoints keep indentation behavior',()=>{
 const source='value();\nbegin\n    write "test";\nend;',method={line:1};
 assert.equal(breakpointPosition(method,source,3),source.indexOf('write'));
 assert.equal(breakpointPosition(method,source,3,7),source.indexOf('write')+2);
});
