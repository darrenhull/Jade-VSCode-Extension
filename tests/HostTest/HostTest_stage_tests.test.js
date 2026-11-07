'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const {HostTestArtifacts}=require('../../scripts/HostTestArtifacts.cjs');

for(const mode of ['cli','workspaces','incremental','creation','collection-families'])test('actual '+mode+' host stages the private validator required by its integration fixture',{concurrency:false},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-cli-integration-seed-host-staging-'));
 const oldSeed=process.env.JADE_TEST_SEED,oldIni=process.env.JADE_TEST_INI;
 t.after(()=>{for(const[key,value]of[['JADE_TEST_SEED',oldSeed],['JADE_TEST_INI',oldIni]])if(value===undefined)delete process.env[key];else process.env[key]=value;assert.equal(path.dirname(root),fs.realpathSync(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});});
 const database=path.join(root,'system'),ini=path.join(root,'working.ini'),code=path.join(root,'vscode/Code.exe');
 fs.mkdirSync(database);fs.mkdirSync(path.join(root,'vscode/resources/app/out'),{recursive:true});fs.writeFileSync(code,'not executable; spawn is intercepted');fs.writeFileSync(path.join(root,'vscode/resources/app/out/cli.js'),'fixture');
 fs.writeFileSync(ini,`[PersistentDb]\nJournalRootDirectory=${path.join(root,'journals')}\n[TransientDb]\nFileDirectory=${path.join(root,'transient')}\n`);
 process.env.JADE_TEST_SEED=database;process.env.JADE_TEST_INI=ini;
 const script=path.resolve(__dirname,'../../scripts/host-test.cjs'),scriptRequire=createRequire(script);
 const nativeCli=path.resolve(path.dirname(script),'../extension/vendor/jade-tools-cli/jade-cli.exe');
 const copied=[];
 const fixtureFs={...fs,cpSync:(source,target)=>{copied.push([source,target]);fs.mkdirSync(target,{recursive:true});},readFileSync:(file,...args)=>file===nativeCli?Buffer.from('fixture only, never executed'):fs.readFileSync(file,...args)};
 const signals=new EventEmitter();class FixtureArtifacts extends HostTestArtifacts{constructor(){super({root,minimumFreeBytes:1024,freeBytes:()=>4096});}}
 let validated=false;
 const context={__dirname:path.dirname(script),setTimeout,clearTimeout,AbortController,console:{log(){},error(){}},process:{argv:['node',script,'--'+mode],env:{...process.env,JADE_TEST_CODE:code},once:signals.once.bind(signals),removeListener:signals.removeListener.bind(signals)},require(name){
  if(name==='node:fs')return fixtureFs;
  if(name==='./bundle-cli.cjs')return {bundleCli(){}};
  if(name==='./HostTestArtifacts.cjs')return {HostTestArtifacts:FixtureArtifacts};
  if(name==='node:child_process')return {spawn(_command,args){
   const stagedSmoke=args.find(value=>value.startsWith('--extensionTestsPath=')).slice('--extensionTestsPath='.length);
   if(['creation','collection-families'].includes(mode)){assert.ok(copied.some(([source,target])=>source===path.resolve(path.dirname(script),'../test/fixtures/creation-imports')&&target===path.join(path.dirname(stagedSmoke),'fixtures/creation-imports')),'Creation host must stage real native alias fixtures');validated=true;throw Error('Staging contract verified; no process started.');}
   const fixture=require(path.join(path.dirname(stagedSmoke),'cli-integration-fixture.js'));
   assert.equal(fixture.requirePrivateSeed().databasePath,fs.realpathSync(database));validated=true;
   throw Error('Staging contract verified; no process started.');
  }};
  return scriptRequire(name);
 }};
 const original=fs.readFileSync(script,'utf8'),entry='main().catch(error=>{console.error(error);process.exitCode=1;});';assert.ok(original.includes(entry));
 vm.runInNewContext(original.replace(entry,'globalThis.finished=main();'),context,{filename:script});
 await assert.rejects(context.finished,/Staging contract verified/);assert.equal(validated,true);
});
