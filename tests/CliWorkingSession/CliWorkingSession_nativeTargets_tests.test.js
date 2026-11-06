'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {CliWorkingSession}=require('../../extension/src/cli-client');
function fixture(handler){const requests=[];const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.write=text=>{const request=JSON.parse(text);requests.push(request);queueMicrotask(()=>child.stdout.emit('data',Buffer.from(JSON.stringify({id:request.id,event:'result',result:handler(request)})+'\n')));};child.kill=()=>{};return {session:new CliWorkingSession({entry:'native-cli.exe',spawn:()=>child}),requests};}
test('debug and inspection use the native working identity rather than recomputing a JavaScript path',async()=>{
 const working={root:'C:/private/native-identity',databasePath:'C:/private/native-identity/system',iniPath:'C:/private/native-identity/working.ini'};
 const f=fixture(request=>({code:0,passed:true,...(request.command==='inspect.target'?{config:{...working,readOnly:true,selection:request.target}}:{working})}));
 try{assert.deepEqual(await f.session.workingLocation({schema:'Pets'}),working);assert.deepEqual(await f.session.prepareWorking({schema:'Pets'}),working);assert.equal((await f.session.inspectionTarget({schema:'Pets'},'working')).databasePath,working.databasePath);assert.deepEqual(f.requests.map(value=>value.command),['working.location','working.prepare','inspect.target']);assert.equal(f.requests[2].target,'working');}finally{f.session.dispose();}
});
test('native target resolution failures cannot fall back to a guessed working database',async()=>{
 const f=fixture(()=>({code:2,passed:false,report:{error:'Working database belongs to another source'}}));
 try{await assert.rejects(f.session.inspectionTarget({},'working'),/another source/);await assert.rejects(f.session.prepareWorking({}),/another source/);}finally{f.session.dispose();}
});
