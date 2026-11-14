'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const fixtureFile=process.env.JADE_INSPECTION_POLICY_FIXTURE,extension=process.env.JADE_INSPECTION_POLICY_EXTENSION;

test('packaged transport reads inherited blank-password policy data from isolated Source and managed Working',{
 skip:!fixtureFile||!extension?'Requires an explicit disposable inspection fixture and extracted final VSIX.':false,
 timeout:240000
},async t=>{
 const fixture=JSON.parse(fs.readFileSync(fixtureFile,'utf8')),root=fs.realpathSync(path.dirname(fixtureFile));
 const cache=fs.realpathSync(path.join(process.env.LOCALAPPDATA,'JadeTools','test-cache'));
 assert.equal(path.dirname(root),cache);assert.match(path.basename(root),/^jade-extension-inspection-seed-[a-f0-9]{32}$/);
 assert.equal(fixture.owner,'extension-inspection-proof');
 const inside=value=>{const relative=path.relative(root,path.resolve(value));return relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative);};
 assert.ok(inside(fixture.trace),'Filter trace must stay inside the synthetic Source');
 for(const field of ['databasePath','iniPath','workingDatabaseDirectory','storagePath'])assert.ok(inside(fixture.config[field]),field+' must be owned');
 require('../../test/PrivateNativeFixture').assertPrivateIniPaths(fixture.config.databasePath,fs.readFileSync(fixture.config.iniPath,'utf8'));
 for(const name of ['JADE_TOOLS_STATE_DIRECTORY','JADE_TOOLS_CONNECTIONS_FILE'])assert.ok(inside(process.env[name]),name+' must be isolated');
 const packaged=path.resolve(extension),distribution=path.join(packaged,'vendor','jade-tools-cli');
 assert.equal(JSON.parse(fs.readFileSync(path.join(packaged,'package.json'),'utf8')).jadeNative.minimumCliVersion,'0.10.6');
 assert.equal(JSON.parse(fs.readFileSync(path.join(distribution,'distribution.json'),'utf8')).packageVersion,'0.10.6');
 const {CliWorkingSession}=require(path.join(packaged,'src','cli-client'));
 const {CliInspectionTransport}=require(path.join(packaged,'src','CliInspectionTransport'));
 const entry=path.join(distribution,'jade-cli.exe'),client=new CliWorkingSession({entry});
 const countFilters=()=>fs.existsSync(fixture.trace)?fs.readFileSync(fixture.trace,'utf8').split(/\r?\n/).filter(Boolean).length:0;
 const before=countFilters(),epochs=[];let transport;
 assert.ok(before>0,'Seeder must prove the inherited blank-password filter was actually invoked and denied');
 try{
  // Ordinary native ownership and backup/restore preparation, before Source holds single-user mode.
  const working=await client.prepareWorking(fixture.config,text=>t.diagnostic(text.trim()));
  assert.equal(path.resolve(working.root),path.resolve(fixture.config.workingDatabaseDirectory));
  assert.notEqual(fs.realpathSync(working.databasePath),fs.realpathSync(fixture.config.databasePath));
  for(const target of ['source','working']){
   const selected=await client.inspectionTarget(fixture.config,target);
   assert.equal(selected.readOnly,true);
   assert.equal(fs.realpathSync(selected.databasePath),fs.realpathSync(target==='source'?fixture.config.databasePath:working.databasePath));
   transport=new CliInspectionTransport(client,{config:{...fixture.config,user:'SyntheticInspector',password:''},target});
   const catalog=await transport.ready;assert.equal(catalog.readOnly,true);epochs.push(catalog.connectionEpoch);
   const schema=catalog.schemas.find(value=>value.name==='InspectionPolicyProbe');assert.ok(schema,'Synthetic schema is visible');
   const cls=schema.classes.find(value=>value.name==='BlankPasswordChild');assert.ok(cls,'Inherited-filter child is visible');
   const page=await transport.request('instances',{classOid:cls.oid,limit:1});
   assert.equal(page.readOnly,true);assert.equal(page.items.length,1);assert.equal(page.connectionEpoch,catalog.connectionEpoch);
   const object=await transport.request('object',{oid:page.items[0].oid});
   assert.equal(object.readOnly,true);assert.equal(object.connectionEpoch,catalog.connectionEpoch);
   assert.equal(object.className,'BlankPasswordChild');
   assert.equal(object.properties.find(value=>value.name==='probeLabel')?.value,'SYNTHETIC inspection proof only');
   assert.equal(countFilters(),before,'Development browser must not invoke deployed application filter');
   t.diagnostic(JSON.stringify({target,readOnly:true,catalog:true,instances:true,storedProperty:true,filterCalls:0}));
   await transport.stop({disconnect:true});transport=undefined;
  }
  assert.notEqual(epochs[0],epochs[1],'Source/Working epochs must be separate');
 }finally{
  const closing=await Promise.allSettled([transport?.stop({disconnect:true})]);
  const released=await Promise.allSettled([client.release()]);client.dispose();
  const status=JSON.parse(execFileSync(entry,['status','--json'],{encoding:'utf8',timeout:30000,windowsHide:true}));
  assert.ok(status.brokerPID>0,'Owned broker PID must be known before shutdown');
  const stopped=JSON.parse(execFileSync(entry,['shutdown','--json'],{encoding:'utf8',timeout:30000,windowsHide:true}));
  assert.equal(stopped.passed,true);
  const deadline=Date.now()+10000;
  while(true){try{process.kill(status.brokerPID,0);}catch(error){if(error.code==='ESRCH')break;throw error;}
   assert.ok(Date.now()<deadline,'Owned broker must exit before fixture cleanup');await new Promise(resolve=>setTimeout(resolve,100));}
  for(const result of [...closing,...released])if(result.status==='rejected')throw result.reason;
 }
});