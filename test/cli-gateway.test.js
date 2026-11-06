'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const gateway=require('../extension/src/cli-gateway');
test('utility gateway preserves streamed native output, outcome and cancellation without launching Jade in the editor',async()=>{
 let finish,seen;
 const service={runNative(exe,args,options,output){seen={exe,args,options};output('Completed: 16%\n');return new Promise(resolve=>finish=resolve);}};
 gateway.configure(service);
 try{const child=gateway.spawnUtility('C:/Jade/bin/jadclient.exe',['path=base'],{}),output=[];child.stdout.on('data',bytes=>output.push(String(bytes)));const closed=new Promise(resolve=>child.once('close',(code)=>resolve(code)));await Promise.resolve();assert.equal(seen.exe,'C:/Jade/bin/jadclient.exe');child.kill();assert.equal(seen.options.signal.aborted,true);finish({code:2,cancelled:true});assert.equal(await closed,2);assert.deepEqual(output,['Completed: 16%\n']);}finally{gateway.configure(undefined);}
});
test('helper gateway keeps native protocol pipes but launches the packaged CLI, not native executable',()=>{
 let launch;
 gateway.configure({entry:'/packed/bin/jade-cli.js',spawn:(...args)=>(launch=args,{stub:true})});
 try{assert.equal(gateway.spawnHelper('inspect','native.exe',['session.json'],{windowsHide:true}).stub,true);assert.equal(launch[0],process.execPath);assert.deepEqual(launch[1],['/packed/bin/jade-cli.js','helper','inspect','session.json']);assert.equal(launch[2].env.ELECTRON_RUN_AS_NODE,'1');}finally{gateway.configure(undefined);}
});
test('standalone helper gateways use the same packaged executable directly',()=>{
 let launch;
 gateway.configure({entry:'C:/packed/jade-cli.exe',spawn:(...args)=>(launch=args,{stub:true})});
 try{gateway.spawnHelper('debug','unused-native.exe',['session.json'],{windowsHide:true});assert.equal(launch[0],'C:/packed/jade-cli.exe');assert.deepEqual(launch[1],['helper','debug','session.json']);assert.equal(launch[2].env.ELECTRON_RUN_AS_NODE,undefined);}finally{gateway.configure(undefined);}
});
test('existing native utility and class-publish entry points delegate to the CLI while preserving loader failures',async()=>{
 const calls=[];
 gateway.configure({runNative:async(executable,args,options,output)=>{calls.push({executable,args,options});output('Compile Error 6026 - Unknown property\n');return {code:6026,success:false,output:'Compile Error 6026 - Unknown property\n'};}});
 try{
  const output=[],result=await require('../extension/src/working-database').nativeProcess('C:/Jade/bin/jadloadb.exe',['schemaFile=Fish.cls'],{},text=>output.push(text));
  assert.equal(result.code,6026);assert.equal(result.success,false);
  const published=await require('../extension/src/publish').startPublish({executable:'C:/Jade/bin/jadloadb.exe',args:['schemaFile=Fish.cls'],source:'Fish.cls'},text=>output.push(text)).completion;
  assert.equal(published.success,false);assert.equal(published.code,6026);assert.equal(calls.length,2);assert.equal(output.length,2);
 }finally{gateway.configure(undefined);}
});
