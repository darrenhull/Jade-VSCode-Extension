'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {open}=require('./inspector-native-connected.test');
const enabled=process.env.JADE_INSPECT_SECURITY==='1';
test('native development security authenticates and checks every inspected class',{skip:!enabled,timeout:60000},async()=>{
 const original=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../inspector/build/policy-config.json'))),root=path.dirname(original.iniPath),ini=fs.readFileSync(original.iniPath,'utf8'),dll=path.resolve(__dirname,'../inspector/build/security-fixture.dll');
 const secured=path.join(root,'security.ini');fs.writeFileSync(secured,ini.replace(/DevelopmentSecurityLibrary=[^\r\n]*/i,'DevelopmentSecurityLibrary='+dll));
 const config={...original,iniPath:secured,user:'inspector-test',password:'test-only'};
 const denied=open({...config,password:'wrong'});try{await assert.rejects(denied.ready,/authentication|credentials|security/i);}finally{await denied.close();}
 const client=open(config);try{const ready=await client.ready;assert.equal(ready.security.developmentLibrary,true);assert.equal(typeof ready.security.developmentLicences,"number");const catalog=await client.request('catalog');const classes=catalog.schemas.find(s=>s.name==='SJetSchema').classes;
 const allowed=classes.find(c=>c.name==='InspectorFixtureItem');const page=await client.request('instances',{classOid:allowed.oid,limit:1});assert.equal(page.items.length,1);await client.request('object',{oid:page.items[0].oid});
 const blocked=classes.find(c=>c.name==='InspectorDeniedItem');await assert.rejects(client.request('instances',{classOid:blocked.oid,limit:1}),/security|policy/i);
 }finally{await client.close();}
 const absent=path.join(root,'absent.ini');fs.writeFileSync(absent,ini.replace(/DevelopmentSecurityLibrary=[^\r\n]*/i,'DevelopmentSecurityLibrary='+path.join(root,'not-present.dll')));const absentClient=open({...config,iniPath:absent});try{await assert.rejects(absentClient.ready,/library.*could not be loaded/i);}finally{await absentClient.close();}
 const missing=path.join(root,'missing.ini');fs.writeFileSync(missing,ini.replace(/DevelopmentSecurityLibrary=[^\r\n]*/i,'DevelopmentSecurityLibrary='+path.resolve(__dirname,'../inspector/build/security-missing-task.dll')));const incomplete=open({...config,iniPath:missing});try{await assert.rejects(incomplete.ready,/entry|jadeDevelopmentFunctionSelected/);}finally{await incomplete.close();}
});
const {execFileSync}=require('node:child_process');
test('native production inspection requires actual receiver filter and respects denial',{skip:!enabled,timeout:60000},async()=>{
 const config=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../inspector/build/policy-config.json'))),fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../evidence/inspector-fixture.json'))),util=path.join(config.installPath,'bin/jdbutilb.exe');
 const mode=value=>execFileSync(util,['path='+config.databasePath,'ini='+config.iniPath,'productionMode='+value],{windowsHide:true,timeout:20000});
 mode(true);let client;try{client=open(config);const ready=await client.ready;assert.equal(ready.security.production,true);const object=await client.request('object',{oid:fixture.objectOid});assert.equal(object.className,'InspectorFixtureItem');await assert.rejects(client.request('object',{oid:fixture.collectionOid}),/Production.*allowedToInspect/);
 const catalog=await client.request('catalog');const denied=catalog.schemas.find(s=>s.name==='SJetSchema').classes.find(c=>c.name==='InspectorDeniedItem');await assert.rejects(client.request('instances',{classOid:denied.oid,limit:1}),/policy denied/);
 await client.close();client=open({...config,iniPath:path.join(config.root,'security.ini'),user:'inspector-test',password:'test-only'});await client.ready;const authorized=await client.request('object',{oid:fixture.collectionOid});assert.equal(authorized.collection,true);
 }finally{if(client)await client.close();mode(false);}
});
const net=require('node:net');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function listenerReady(port){for(let i=0;i<100;i++){const ok=await new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(true)});s.once('error',()=>resolve(false));});if(ok)return;await delay(100);}throw Error('Native private server did not start');}
test('multiuser inspection reads server security despite conflicting client settings',{skip:!enabled,timeout:60000},async()=>{
 const configFile=path.resolve(__dirname,'../inspector/build/multi-config.json'),config=JSON.parse(fs.readFileSync(configFile)),baseline=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../inspector/build/policy-config.json'))),original=fs.readFileSync(baseline.iniPath,'utf8');
 const network=original.replace(/^NetworkSpecification\d+=.*\r?\n?/gmi,'').replace('[JadeServer]','[JadeServer]\nNetworkSpecification1=TcpIpV4,Enabled,61493,127.0.0.1').replace(/^ServerNodeSpecifications=.*/mi,'ServerNodeSpecifications=TcpIp,127.0.0.1,61493');
 fs.writeFileSync(config.iniPath,network.replace(/DevelopmentSecurityLibrary=[^\r\n]*/i,'DevelopmentSecurityLibrary='+path.resolve(__dirname,'../inspector/build/security-fixture.dll')));
 const clientIni=path.join(config.root,'client.ini');fs.writeFileSync(clientIni,network.replace(/DevelopmentSecurityLibrary=[^\r\n]*/i,'DevelopmentSecurityLibrary=<default>'));
 execFileSync('powershell.exe',['-NoProfile','-Command',`& { ${fs.readFileSync(path.resolve(__dirname,'../inspector/start-test-server.ps1'),'utf8')} } -Config '${configFile.replace(/'/g,"''")}'`],{windowsHide:true,stdio:'ignore'});const pid=Number(fs.readFileSync(path.join(config.root,'server.pid'),'utf8').trim());
 let client;try{await listenerReady(61493);client=open({...config,iniPath:clientIni,user:'inspector-test',password:'wrong'});await assert.rejects(client.ready,/authentication|credentials/);await client.close();client=open({...config,iniPath:clientIni,user:'inspector-test',password:'test-only'});const ready=await client.ready;assert.equal(ready.server,'multiUser');assert.equal(ready.readOnly,true);assert.equal(ready.security.developmentLibrary,true);assert.equal(typeof ready.security.developmentLicences,"number");const catalog=await client.request('catalog');const cls=catalog.schemas.find(s=>s.name==='SJetSchema').classes.find(c=>c.name==='InspectorFixtureItem');const page=await client.request('instances',{classOid:cls.oid,limit:1});assert.equal(page.items.length,1);await client.request('object',{oid:page.items[0].oid});fs.writeFileSync(path.resolve(__dirname,'../evidence/inspector-security.json'),JSON.stringify({productionFilter:true,customAuthentication:true,customTaskDenial:true,missingExportDenied:true,missingLibraryDenied:true,multiuser:{server:'127.0.0.1:61493',clientConfigSecurity:'<default>',effectiveServerLibrary:true,readOnly:ready.readOnly}},null,2));
 }finally{if(client)await client.close();execFileSync(path.resolve(__dirname,'../inspector/build/stop-server.exe'),[String(pid)],{windowsHide:true,timeout:25000});}
});
