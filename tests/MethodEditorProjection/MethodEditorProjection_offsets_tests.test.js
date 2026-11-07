'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalized,toSourceOffset,toEditorOffset,sourceInsertion}=require('../../extension/media/method-editor-projection');
test('maps every UTF16 boundary between CRLF source and LF editor including astral characters',()=>{
 const source='\r\nname() : String;\r\nbegin\r\n return "🐟";\r\nend;\r\n',editor=normalized(source);
 for(let index=0;index<=editor.length;index++){const original=toSourceOffset(source,index);assert.equal(toEditorOffset(source,original),index);assert.equal(normalized(source.slice(0,original)),editor.slice(0,index));}
 assert.equal(sourceInsertion('one\ntwo',source),'one\r\ntwo');
});
test('keeps LF source unchanged and supports mixed old source ending during typing',()=>{
 assert.equal(toSourceOffset('a\nb',2),2);assert.equal(sourceInsertion('one\ntwo','a\nb'),'one\ntwo');assert.equal(toSourceOffset('a\r\nb\nc',4),5);assert.equal(toEditorOffset('a\r\nb\nc',5),4);
});
