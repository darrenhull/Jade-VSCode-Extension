'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {registerFormatting}=require('../../extension/src/jade-formatter');
test('document and range providers register, respect actual API argument order, and dispose with the extension',()=>{
  const providers={},context={subscriptions:[]},selector=[{language:'jade-nz'}];
  const vscode={languages:{registerDocumentFormattingEditProvider(s,p){assert.equal(s,selector);providers.document=p;return 'document';},registerDocumentRangeFormattingEditProvider(s,p){assert.equal(s,selector);providers.range=p;return 'range';}},Range:class{constructor(start,end){this.start=start;this.end=end;}},TextEdit:{replace:(range,text)=>({range,text})}};
  registerFormatting(vscode,context,selector);
  const text='run();\nbegin\nreturn;\nend;',doc={getText:()=>text,uri:{scheme:'file',fsPath:'run.jade'},offsetAt:p=>p,positionAt:p=>p};
  assert.deepEqual(context.subscriptions,['document','range']);
  assert.equal(providers.document.provideDocumentFormattingEdits(doc,{insertSpaces:true,tabSize:2},{}).at(0).text,'  ');
  const range={start:text.indexOf('return;'),end:text.indexOf('return;')+7};
  assert.equal(providers.range.provideDocumentRangeFormattingEdits(doc,range,{insertSpaces:true,tabSize:3},{}).at(0).text,'   ');
  assert.deepEqual(providers.document.provideDocumentFormattingEdits(doc,{}, {isCancellationRequested:true}),[]);
  assert.deepEqual(providers.range.provideDocumentRangeFormattingEdits(doc,range,{}, {isCancellationRequested:true}),[]);
});
