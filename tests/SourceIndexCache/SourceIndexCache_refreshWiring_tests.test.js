'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
for(const rescan of [true,false])test('Class View '+(rescan?'explicit refresh delegates native once before browsing':'source-pull UI refresh adds no native preparation'),async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../extension/src/class-view.js'),'utf8'),start=source.indexOf('  async function refresh({rescan=true}={}){'),end=source.indexOf('  const children =',start),calls=[];
 const sandbox={resources:undefined,systemReadyProjects:new Set(),language:{refreshSourceIndex:async()=>calls.push('native refresh'),index:{rescan:async()=>calls.push('browser rescan')}},catalogue:{panel:false},pendingFiles:new Set(),previewController:{},events:{fire:()=>calls.push('UI')}};
 vm.runInNewContext(source.slice(start,end)+'\nthis.run=refresh;',sandbox);await sandbox.run({rescan});assert.deepEqual(calls,rescan?['native refresh','browser rescan','UI']:['UI']);
});
