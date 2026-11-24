'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {OwnedCliFixture}=require('../../test/OwnedCliFixture');
test('native CLI previews a saved checkout without jade.json or database access',{timeout:15000},async()=>{
 const fixture=new OwnedCliFixture({entry:process.env.JADE_CLI_QUALIFICATION_ENTRY||path.resolve(__dirname,'../../packages/jade-cli-win-x64/jade-cli.exe')});
 await fixture.run(async({root,session})=>{
  const project=path.join(root,'checkout'),sources=path.join(project,'sources'),install=path.join(root,'missing-install'),seed=path.join(root,'missing-vendor-seed');
  fs.mkdirSync(sources,{recursive:true});const source=path.join(sources,'Saved.jox');fs.writeFileSync(source,'saved source bytes\r\n');const original=fs.readFileSync(source);
  const git=spawnSync('git',['init','--quiet'],{cwd:project,encoding:'utf8',windowsHide:true});assert.equal(git.status,0,git.stderr);
  const config={sourceFormat:'jox',workingMode:'git-first',installPath:install,workingSeedDirectory:seed,workspaceRoots:[sources],storagePath:path.join(root,'storage'),characterSet:'ansi'};
  const result=await session.request('working.location',{cwd:project,config,checkoutOnly:true}).promise;
  assert.equal(result.passed,true,JSON.stringify(result));assert.equal(result.code,0);assert.equal(result.body.checkoutConfigured,true);assert.equal(result.body.workingMode,'git-first');assert.equal(result.body.workingState,'new');assert.equal(result.body.sourceRoots.length,1);
  assert.equal(fs.existsSync(path.join(project,'jade.json')),false);assert.deepEqual(fs.readFileSync(source),original);assert.equal(fs.existsSync(install),false);assert.equal(fs.existsSync(seed),false);assert.equal(fs.existsSync(path.join(result.body.working.databasePath,'_control.dat')),false);
 });
});
