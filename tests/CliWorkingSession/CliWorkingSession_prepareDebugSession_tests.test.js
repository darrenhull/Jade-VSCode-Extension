 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {CliWorkingSession}=require('../../extension/src/cli-client');
test('debug-purpose preparation extracts native admitted session without changing ordinary preparation',async()=>{
 const session=new CliWorkingSession(),calls=[],native={workingMode:'existing',evidence:{private:'opaque'},abi:'native-abi.json'};
 session.resolveNative=async(...args)=>{calls.push(args);return{debugSession:native};};
 const config={sourceFormat:'jox'},options={cwd:'project',expectedWorkingIdentity:'exact-target'};
 const result=await session.prepareDebugSession(config,undefined,options);assert.strictEqual(result,native);
 assert.deepEqual(calls[0],['working.prepare',config,'body',{...options,purpose:'debug'},undefined]);
 await session.prepareWorking(config);assert.equal(calls[1][2],'working');assert.deepEqual(calls[1][3],{});
});
