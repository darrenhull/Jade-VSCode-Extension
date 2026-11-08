'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {OwnedCliFixture}=require('../../test/OwnedCliFixture');
test('pinned native CLI resolves working.location without Jade installation or database access',{timeout:15000},async()=>{
 const fixture=new OwnedCliFixture({entry:path.resolve(__dirname,'../../packages/jade-cli-win-x64/jade-cli.exe')});
 await fixture.run(async({root,session})=>{
  const config={installPath:path.join(root,'missing-install'),databasePath:path.join(root,'missing-base'),iniPath:path.join(root,'missing-base/jade.ini'),storagePath:path.join(root,'storage'),workspaceRoots:[path.join(root,'workspace')]};
  const working=await session.workingLocation(config);
  assert.equal(typeof working.databasePath,'string');assert.ok(working.databasePath.length);
  assert.equal(fs.existsSync(config.installPath),false);assert.equal(fs.existsSync(config.databasePath),false);assert.equal(fs.existsSync(path.join(working.databasePath,'_control.dat')),false);
 });
});
