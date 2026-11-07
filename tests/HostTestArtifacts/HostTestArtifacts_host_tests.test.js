'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const {HostTestArtifacts}=require('../../scripts/HostTestArtifacts.cjs');
for(const mode of ['formatting','workspaces','incremental'])for(const passed of [true,false])test('actual '+mode+' host-script wiring preserves '+(passed?'success':'failure')+' evidence and removes its stage',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-host-script-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const executable=path.join(root,'Code.exe');fs.writeFileSync(executable,'fixture only, never executed');
 const cli=path.join(root,'extension/vendor/jade-tools-cli/jade-cli.exe');fs.mkdirSync(path.dirname(cli),{recursive:true});fs.writeFileSync(cli,'fixture only');
 const signals=new EventEmitter(),calls=[],bundleOptions=[],fakeProcess={env:{...process.env,JADE_TEST_CODE:executable,ELECTRON_RUN_AS_NODE:'1'},argv:['node','host-test.cjs','--'+mode],once:signals.once.bind(signals),removeListener:signals.removeListener.bind(signals)};
 const fixtureFs={...fs,cpSync:(_source,target)=>fs.mkdirSync(target,{recursive:true}),copyFileSync:(_source,target)=>{fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'fixture');}};
 class FixtureArtifacts extends HostTestArtifacts{constructor(){super({root,minimumFreeBytes:1024,freeBytes:()=>4096});}}
 const context={process:fakeProcess,console:{log(){},error(){}},AbortController,setTimeout,clearTimeout,__dirname:path.join(root,'scripts'),require(name){
  if(name==='node:fs')return fixtureFs;if(name==='node:child_process')return {spawn(command,args,options){calls.push({command,args,options});const child=new EventEmitter();child.kill=()=>{queueMicrotask(()=>child.emit('close',1));return true;};queueMicrotask(()=>{fs.writeFileSync(options.env.JADE_HEADLESS_HOST_REPORT,JSON.stringify({passed,error:passed?undefined:'fixture failure'}));child.emit('close',passed?0:1);});return child;}};
  if(name==='./HostTestArtifacts.cjs')return {HostTestArtifacts:FixtureArtifacts};if(name==='./bundle-cli.cjs')return {bundleCli(options){bundleOptions.push(options);}};if(name==='../extension/package.json')return {jadeNative:{minimumCliVersion:'0.4.0'}};return require(name);
 }};
 const source=fs.readFileSync(path.resolve(__dirname,'../../scripts/host-test.cjs'),'utf8').replace('main().catch(error=>{console.error(error);process.exitCode=1;});','globalThis.finished=main();');
 vm.runInNewContext(source,context);if(passed)await context.finished;else await assert.rejects(context.finished,/host failed/);
 assert.equal(calls.length,1);const call=calls[0],stage=path.dirname(call.options.env.JADE_HEADLESS_HOST_REPORT);
 assert.equal(call.command,executable);assert.equal(call.options.env.ELECTRON_RUN_AS_NODE,undefined);assert.equal(call.options.env.JADE_TOOLS_STATE_DIRECTORY,path.join(stage,'broker'));assert.equal(call.options.env.JADE_TOOLS_CONNECTIONS_FILE,path.join(stage,'connections.json'));
 assert.equal(bundleOptions[0].minimumVersion,mode==='workspaces'?'0.4.0':undefined);
 assert.equal(fs.existsSync(stage),false);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'evidence/vscode-'+mode+'-host.json'),'utf8')).passed,passed);assert.equal(signals.listenerCount('SIGINT'),0);assert.equal(signals.listenerCount('SIGTERM'),0);
});

for(const mode of ['cli','workspaces','incremental'])test('actual '+mode+' staging loads the native fixture guard and sibling fixture module',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-host-module-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const repository=path.resolve(__dirname,'../..'),executable=path.join(root,'Code.exe'),cli=path.join(root,'extension/vendor/jade-tools-cli/jade-cli.exe');
 fs.writeFileSync(executable,'fixture only, never executed');fs.mkdirSync(path.dirname(cli),{recursive:true});fs.writeFileSync(cli,'fixture only');
 const signals=new EventEmitter(),fakeProcess={env:{...process.env,JADE_TEST_CODE:executable},argv:['node','host-test.cjs','--'+mode],once:signals.once.bind(signals),removeListener:signals.removeListener.bind(signals)};
 const copied=[];
 const fixtureFs={...fs,cpSync:(_source,target)=>fs.mkdirSync(target,{recursive:true}),copyFileSync:(source,target)=>{copied.push(path.basename(source));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(repository,'test',path.basename(source)),target);}};
 class FixtureArtifacts extends HostTestArtifacts{constructor(){super({root,minimumFreeBytes:1024,freeBytes:()=>4096});}}
 let graphLoaded=false,stage;
 const context={process:fakeProcess,console:{log(){},error(){}},AbortController,setTimeout,clearTimeout,__dirname:path.join(root,'scripts'),require(name){
  if(name==='node:fs')return fixtureFs;
  if(name==='node:child_process')return {spawn(_command,_args,options){stage=path.dirname(options.env.JADE_HEADLESS_HOST_REPORT);const child=new EventEmitter();child.kill=()=>{queueMicrotask(()=>child.emit('close',1));return true;};queueMicrotask(()=>{
   try{
    const requireStaged=require('node:module').createRequire(path.join(stage,'extension/test/implementation.js'));
    assert.equal(typeof requireStaged('./PrivateNativeFixture').assertPrivateIniPaths,'function');
    assert.equal(typeof requireStaged('./cli-integration-fixture').requirePrivateSeed,'function');
    // Reproduce the shared fixture's guard dependency without opening a database.
    const consumer=new (require('node:module'))(path.join(stage,'extension/test/fixture-consumer.js'));
    consumer.filename=path.join(stage,'extension/test/fixture-consumer.js');consumer.paths=require('node:module')._nodeModulePaths(path.dirname(consumer.filename));
    consumer._compile("module.exports={...require('./cli-integration-fixture'),...require('./PrivateNativeFixture')};",consumer.filename);
    assert.equal(typeof consumer.exports.assertPrivateIniPaths,'function');graphLoaded=true;
    fs.writeFileSync(options.env.JADE_HEADLESS_HOST_REPORT,JSON.stringify({passed:true}));child.emit('close',0);
   }catch(error){child.emit('error',error);}
  });return child;}};
  if(name==='./HostTestArtifacts.cjs')return {HostTestArtifacts:FixtureArtifacts};if(name==='./bundle-cli.cjs')return {bundleCli(){}};if(name==='../extension/package.json')return {jadeNative:{minimumCliVersion:'0.4.0'}};return require(name);
 }};
 const source=fs.readFileSync(path.join(repository,'scripts/host-test.cjs'),'utf8').replace('main().catch(error=>{console.error(error);process.exitCode=1;});','globalThis.finished=main();');
 vm.runInNewContext(source,context);await context.finished;assert.equal(graphLoaded,true);assert.equal(fs.existsSync(stage),false);assert.ok(copied.includes('vscode-'+(mode==='cli'?'cli':mode==='incremental'?'incremental-build':'workspaces')+'-smoke.js'));
});
