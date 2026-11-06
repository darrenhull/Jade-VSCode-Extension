'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {CliWorkingSession,cliInvocation}=require('../extension/src/cli-client');
function harness(handler){
 const children=[],requests=[];
 const spawn=(exe,args,options)=>{
  const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.pid=children.length+101;
  child.stdin=new EventEmitter();child.stdin.write=(text)=>{const request=JSON.parse(text);requests.push(request);queueMicrotask(()=>handler(request,packet=>child.stdout.emit('data',Buffer.from(JSON.stringify(packet)+'\n')),child));return true;};
  child.kill=()=>{queueMicrotask(()=>child.emit('close',0));return true;};
  children.push({child,exe,args,options});return child;
 };
 const session=new CliWorkingSession({entry:'/packed/cli/bin/jade-cli.js',spawn});
 return {session,children,requests};
}
test('build and test use one packaged CLI process with exact native reports and no unserialisable editor services',async()=>{
 const h=harness((request,emit)=>{emit({id:request.id,event:'output',text:'Native output\n'});emit({id:request.id,event:'result',result:{passed:request.command==='build',code:request.command==='build'?0:1,report:{tests_completed:true,results:[{owner:'FishTest',method:'check',status:'failed',message:'expected 2 got 1'}]}}});});
 try{
  const output=[],reports=[],config={program:'FishTest.cls',workspaceRoots:['workspace'],testSession:{circular:null},beforeNativeProcess(){},signal:new AbortController().signal};config.testSession.circular=config.testSession;
  const built=await h.session.startWorking(config,'compile',s=>output.push(s),r=>reports.push(r)).completion;
  const tested=await h.session.startWorking(config,'test.run',s=>output.push(s)).completion;
  assert.equal(built.passed,true);assert.equal(tested.passed,false);assert.match(tested.report.results[0].message,/expected 2/);assert.equal(reports.length,1);
  assert.deepEqual(output,['Native output\n','Native output\n']);assert.equal(h.children.length,1);
  assert.equal(h.requests[0].command,'build');assert.equal(h.requests[1].command,'test');assert.equal(h.requests[0].config.testSession,undefined);assert.equal(h.requests[0].config.signal,undefined);
  assert.equal(h.children[0].options.env.ELECTRON_RUN_AS_NODE,'1');
 }finally{h.session.dispose();}
});
test('cancel addresses the original CLI operation and waits for its honest cancelled result',async()=>{
 let active;
 const h=harness((request,emit)=>{if(request.command==='test')active=request.id;else if(request.command==='cancel'){assert.equal(request.operationId,active);emit({id:request.id,event:'result',result:{cancelled:true}});emit({id:active,event:'result',result:{passed:false,code:2,cancelled:true,report:{error:'Operation cancelled.'}}});}});
 try{const operation=h.session.startWorking({program:'Fish.cls'},'test.run');operation.stop();const result=await operation.completion;assert.equal(result.cancelled,true);assert.equal(result.passed,false);}finally{h.session.dispose();}
});
test('CLI crash cannot pass and the next operation starts a clean process',async()=>{
 let failed=false;
 const h=harness((request,emit,child)=>{if(!failed){failed=true;child.emit('close',7);}else emit({id:request.id,event:'result',result:{passed:true,code:0,report:{compiled:true}}});});
 try{const failedRun=await h.session.startWorking({program:'Fish.cls'},'compile').completion;assert.equal(failedRun.passed,false);assert.match(failedRun.report.error,/CLI.*7/);const retry=await h.session.startWorking({program:'Fish.cls'},'compile').completion;assert.equal(retry.passed,true);assert.equal(h.children.length,2);}finally{h.session.dispose();}
});
test('disconnect waits for CLI native ownership release rather than killing the service early',async()=>{
 let disconnect;
 const h=harness((request,emit)=>{if(request.command==='disconnect')disconnect=()=>emit({id:request.id,event:'result',result:{passed:true,code:0}});else emit({id:request.id,event:'result',result:{passed:true,code:0,report:{}}});});
 try{await h.session.startWorking({},'compile').completion;let released=false;const pending=h.session.release().then(()=>released=true);await new Promise(setImmediate);assert.equal(released,false);disconnect();await pending;assert.equal(released,true);assert.equal(h.children.length,1);}finally{h.session.dispose();}
});
test('standalone CLI executables launch directly without Node arguments or Electron environment',()=>{
 const invocation=cliInvocation('C:/packed/bin/jade-cli.exe',['service','--stdio'],{env:{EXAMPLE:'kept',ELECTRON_RUN_AS_NODE:'1'}});
 assert.equal(invocation.executable,'C:/packed/bin/jade-cli.exe');assert.deepEqual(invocation.args,['service','--stdio']);assert.equal(invocation.options.env.ELECTRON_RUN_AS_NODE,undefined);assert.equal(invocation.options.env.EXAMPLE,'kept');
 const js=cliInvocation('/legacy/jade-cli.js',['service','--stdio'],{});assert.equal(js.executable,process.execPath);assert.deepEqual(js.args,['/legacy/jade-cli.js','service','--stdio']);assert.equal(js.options.env.ELECTRON_RUN_AS_NODE,'1');
});
