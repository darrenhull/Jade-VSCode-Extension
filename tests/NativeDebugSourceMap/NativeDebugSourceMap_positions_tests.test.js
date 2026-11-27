 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {NativeDebugSourceMap}=require('../../extension/src/NativeDebugSourceMap');
const range=(sl,sc,el,ec)=>({start:{line:sl,character:sc},end:{line:el,character:ec}});
test('native UTF16 runs map XML entities and CDATA without line-only guessing',()=>{
 const map=new NativeDebugSourceMap([{rawRange:range(9,12,9,16),projectionRange:range(0,0,0,4)},{rawRange:range(9,16,9,21),projectionRange:range(0,4,0,5)},{rawRange:range(10,0,10,11),projectionRange:range(1,0,1,11)}]);
 assert.deepEqual(map.toProjection({line:9,character:18}),{line:0,character:4});
 assert.deepEqual(map.toEditor({line:0,character:4}),{line:9,character:16});
 assert.deepEqual(map.toEditor({line:1,character:8}),{line:10,character:8});
 assert.deepEqual(map.toProjection({line:10,character:8}),{line:1,character:8});
 assert.equal(map.toProjection({line:8,character:0}),undefined);
 assert.deepEqual(map.breakpointLine(11),{line:2,column:1});
 assert.equal(map.breakpointLine(9),undefined);
});
test('malformed, overlapping or unordered maps are refused rather than misplacing breakpoints',()=>{
 assert.throws(()=>new NativeDebugSourceMap([{rawRange:range(0,0,0,4),projectionRange:range(0,0,0,4)},{rawRange:range(0,3,0,8),projectionRange:range(0,4,0,9)}]),/overlap/i);
 assert.throws(()=>new NativeDebugSourceMap([{rawRange:range(-1,0,0,4),projectionRange:range(0,0,0,4)}]),/mapping/i);
});

test('UTF16 surrogate pairs and CRLF editor lines retain native run coordinates',()=>{
 const map=new NativeDebugSourceMap([{rawRange:range(3,8,3,10),projectionRange:range(0,0,0,2)},{rawRange:range(4,0,4,4),projectionRange:range(1,0,1,4)}]);
 assert.deepEqual(map.toProjection({line:3,character:9}),{line:0,character:1});
 assert.deepEqual(map.toEditor({line:0,character:1}),{line:3,character:9});
 assert.deepEqual(map.toEditor({line:1,character:2}),{line:4,character:2});
});

test('line-only breakpoints skip half-open previous-line runs and use first mapped column',()=>{
 const map=new NativeDebugSourceMap([{rawRange:range(1,4,2,0),projectionRange:range(0,4,1,0)},{rawRange:range(2,7,2,12),projectionRange:range(1,3,1,8)}]);
 assert.deepEqual(map.breakpointLine(3),{line:2,column:4});
 assert.deepEqual(map.breakpointLine(3,10),{line:2,column:6});
 assert.equal(map.breakpointLine(3,1),undefined);
 assert.deepEqual(new NativeDebugSourceMap([{rawRange:range(1,4,2,3),projectionRange:range(0,4,1,3)}]).breakpointLine(3),{line:2,column:1});
 assert.equal(new NativeDebugSourceMap([{rawRange:range(1,4,2,0),projectionRange:range(0,4,1,0)}]).breakpointLine(3),undefined);
});
