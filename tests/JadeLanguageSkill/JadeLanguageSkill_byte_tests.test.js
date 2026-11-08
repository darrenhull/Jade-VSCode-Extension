'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('bundled guidance includes an explicit numeric-to-Byte initialization and warns that Byte arithmetic returns Integer',()=>{
 const reference=fs.readFileSync(path.resolve(__dirname,'../../extension/skills/jade-language/references/syntax-reference.md'),'utf8'),section=reference.split('### Byte initialization and arithmetic')[1]?.split('\n## ')[0];assert.ok(section,'Native Byte guidance must address the observed 6072 workflow.');assert.match(section,/0.*255/);assert.match(section,/Integer/);assert.match(section,/6072/);assert.match(section,/byteValue := \(7\)\.Byte;/);assert.doesNotMatch(section,/byteValue := 7;/);assert.match(section,/byteValue := \(byteValue \+ 1\)\.Byte;/);
 const example=/```jade\r?\n([\s\S]*?)```/.exec(section)?.[1];assert.equal(example,fs.readFileSync(path.resolve(__dirname,'../../test/fixtures/scratch-pad-byte.jade'),'utf8'),'The standalone native verification fixture must match the shipped guidance.');
});
