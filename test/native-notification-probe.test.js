'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
test('native notification queue delivers a user event to a plain C++ callback without CLR or IDE',{skip:process.env.JADE_NATIVE_NOTIFICATION_PROBE!=='1',timeout:30000},()=>{
 const output=execFileSync(path.resolve(__dirname,'../inspector/build/notification-probe.exe'),[path.resolve(__dirname,'../inspector/build/notification-config.json')],{windowsHide:true,encoding:'utf8',timeout:20000});const result=JSON.parse(output);assert.equal(result.event,24);assert.equal(result.userTag,917);assert.equal(result.integer,1234);assert.equal(result.system,false);assert.equal(result.remaining,0);fs.writeFileSync(path.resolve(__dirname,'../evidence/native-notification-dispatch.json'),JSON.stringify(result,null,2));
});
