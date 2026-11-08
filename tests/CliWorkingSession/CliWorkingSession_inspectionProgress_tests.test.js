'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {CliWorkingSession}=require('../../extension/src/cli-client');
function fixture(){const requests=[];const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.write=text=>requests.push(JSON.parse(text));child.kill=()=>assert.fail('Do not kill the native service during operation cancellation.');const session=new CliWorkingSession({entry:'jade-cli.exe',spawn:()=>child});return{requests,session,emit:packet=>child.stdout.emit('data',Buffer.from(JSON.stringify(packet)+'\n'))};}
test('inspection target forwards native backup and restore output before transport creation',async()=>{
 const f=fixture(),output=[];const pending=f.session.inspectionTarget({schema:'Pets'},'working',text=>output.push(text));const request=f.requests[0];
 f.emit({id:request.id,event:'output',text:'Creating a consistent native backup ...\n'});f.emit({id:request.id,event:'output',text:'Restoring Working ...\n'});f.emit({id:request.id,event:'result',result:{code:0,passed:true,config:{schema:'Pets'}}});
 assert.deepEqual(await pending,{schema:'Pets'});assert.deepEqual(output,['Creating a consistent native backup ...\n','Restoring Working ...\n']);assert.equal(request.command,'inspect.target');
});
test('inspection target cancellation requests only its operation and waits for the original native result',async()=>{
 const f=fixture(),controller=new AbortController();let settled=false;const pending=f.session.inspectionTarget({schema:'Pets',signal:controller.signal},'working').finally(()=>{settled=true;});const original=f.requests[0];controller.abort();await Promise.resolve();
 assert.equal(settled,false);assert.equal(original.config.signal,undefined);assert.equal(f.requests[1].command,'cancel');assert.equal(f.requests[1].operationId,original.id);
 f.emit({id:f.requests[1].id,event:'result',result:{passed:true,code:0}});await Promise.resolve();assert.equal(settled,false);
 f.emit({id:original.id,event:'result',result:{passed:false,code:2,report:{error:'Native operation cancelled after safe backup completion.'}}});await assert.rejects(pending,/safe backup completion/);assert.equal(settled,true);assert.equal(f.requests.length,2);
});
