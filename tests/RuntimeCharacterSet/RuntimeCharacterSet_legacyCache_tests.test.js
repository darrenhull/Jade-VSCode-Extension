'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {startCpp}=require('../../extension/src/cpp-runner');
for(const characterSet of [undefined,'auto','ansi','unicode'])test('legacy cache request preserves '+(characterSet||'omitted')+' selection for native validation',async()=>{
 let payload;const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.kill=()=>assert.fail('The fake helper should complete without being killed');
 child.stdin.end=text=>{payload=JSON.parse(text);queueMicrotask(()=>{child.stdout.emit('data',Buffer.from(JSON.stringify({protocolVersion:1,id:payload.id,stage:'result',success:false,error:'Legacy cache ABI is unsupported for this runtime.'})+'\n'));child.emit('close',2);});};
 const result=await startCpp({characterSet,program:'C:/source/Pet.cls',helperPath:'fake-helper.exe',installPath:'C:/fixture'},'cache.refresh',()=>{},()=>{},{spawn:()=>child}).completion;
 assert.equal(payload.characterSet,characterSet);assert.equal(Object.hasOwn(payload,'characterSet'),characterSet!==undefined);assert.equal(result.passed,false);assert.equal(result.report.error,'Legacy cache ABI is unsupported for this runtime.');
});
