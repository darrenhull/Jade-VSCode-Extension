'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {WorkspaceRunHistory}=require('../../extension/src/WorkspaceRunHistory');
test('comparison keeps exact previous/current executed snapshots, independently per cell',()=>{
 const history=new WorkspaceRunHistory();const first=history.record('cell1',{sourceText:'first',output:'42',schema:'Pets',status:'Passed',duration:12});
 const original={sourceText:'second',output:'43',schema:'Pets',status:'Passed',duration:10};const second=history.record('cell1',original);original.sourceText='unsaved later edit';
 history.record('cell2',{sourceText:'other',output:'moo'});assert.equal(history.pair('cell2'),undefined);
 assert.equal(history.pair('cell1').previous.sourceText,'first');assert.equal(history.pair('cell1').current.sourceText,'second');
 assert.match(history.text(first.id),/Schema: Pets/);assert.match(history.text(second.id),/43/);
 history.record('cell1',{sourceText:'third',output:'44'});assert.equal(history.find(first.id),undefined);assert.equal(history.pair('cell1').previous.id,second.id);
});
test('history bounds retained cells/bytes and evicts complete old pairs instead of leaking source/output',()=>{
 const history=new WorkspaceRunHistory({maxCells:2,maxBytes:600});
 for(let i=0;i<10;i++)history.record('cell'+i,{sourceText:'begin write '+i+'; end;',output:'x'.repeat(100)});
 assert.equal(history.pair('cell0'),undefined);assert.ok(history.size<=2);assert.ok(history.bytes<=600);
 history.clear();assert.equal(history.size,0);assert.equal(history.bytes,0);
});
test('large output comparisons identify an excerpt and retain valid Unicode boundaries',()=>{
 const history=new WorkspaceRunHistory();const row=history.record('script',{sourceText:'write lots;',output:'x'.repeat(100)+'🐄'+'a'.repeat(32767)});
 assert.equal(row.output.startsWith('\udc04'),false);assert.match(history.text(row.id),/excerpt|omitted/i);
});
test('comparison records distinguish database targets even when the schema name and code are unchanged',()=>{
 const history=new WorkspaceRunHistory();const first=history.record('pad',{sourceText:'write 42;',schema:'Pets',workingDatabase:'C:/working/A'}),second=history.record('pad',{sourceText:'write 42;',schema:'Pets',workingDatabase:'C:/working/B'});
 assert.match(history.text(first.id),/C:\/working\/A/);assert.match(history.text(second.id),/C:\/working\/B/);
});
