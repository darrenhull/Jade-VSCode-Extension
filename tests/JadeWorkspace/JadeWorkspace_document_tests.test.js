'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {decodeNotebook,encodeNotebook,workspaceSnapshot,diagnosticOffsets}=require('../../extension/src/jade-workspace-document');

test('notebook round trip preserves Jade, Markdown and schema, without persisting runtime output or arbitrary metadata',()=>{
  const notebook={schema:'Pets',cells:[{kind:'markdown',text:'# Investigation',language:'markdown',outputs:['private']},{kind:'code',text:'begin\n write "Moo";\nend;',language:'jade-nz'}],secret:'no'};
  const bytes=encodeNotebook(notebook),result=decodeNotebook(bytes);
  assert.deepEqual(result,{schema:'Pets',cells:[{kind:'markdown',text:'# Investigation',language:'markdown'},{kind:'code',text:'begin\n write "Moo";\nend;',language:'jade-nz'}]});
  assert.ok(!bytes.toString().includes('private'));assert.ok(!bytes.toString().includes('secret'));
});
test('malformed notebook versions and cells fail clearly rather than losing source',()=>{
  for(const source of ['{','{"version":2,"cells":[]}','{"version":1,"cells":[{"kind":"code","text":42}]}'])assert.throws(()=>decodeNotebook(Buffer.from(source)),/Workspace|JSON/i);
});
test('VS Code can initialize an empty untitled Workspace before applying its initial cells',()=>{
  assert.deepEqual(decodeNotebook(Buffer.alloc(0)),{schema:'',cells:[]});
});
test('execution freezes the exact unsaved selection and maps native UTF-16 diagnostic offsets back into the document',()=>{
  const text='// prefix\r\nbegin\r\n write "🐄";\r\n nope;\r\nend;';
  const start=text.indexOf('begin'),snapshot=workspaceSnapshot(text,{start,end:text.length});
  assert.equal(snapshot.text,text.slice(start));assert.equal(snapshot.offset,start);
  const relative=snapshot.text.indexOf('nope');
  assert.deepEqual(diagnosticOffsets(snapshot,{position:relative,length:4}),{start:text.indexOf('nope'),end:text.indexOf('nope')+4});
});
test('whole-editor and selection snapshots reject empty scripts and preserve line endings',()=>{
  assert.throws(()=>workspaceSnapshot(' \r\n'),/code/i);
  const text='begin\r\n write 42;\r\nend;';assert.deepEqual(workspaceSnapshot(text),{text,offset:0});
  assert.throws(()=>workspaceSnapshot(text,{start:2,end:1}),/selection/i);
});
test('saved Scratch Pad source uses one JSON entry per source line for useful Git diffs and preserves native line endings',()=>{
 const text='begin\r\n    write 42;\r\nend;';
 const bytes=encodeNotebook({schema:'Pets',cells:[{kind:'code',text}]});
 assert.deepEqual(JSON.parse(bytes.toString('utf8')).cells[0].source,['begin\r\n','    write 42;\r\n','end;']);
 assert.equal(decodeNotebook(bytes).cells[0].text,text);
});
