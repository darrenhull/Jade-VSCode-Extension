 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn,execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {CliWorkingSession}=require('../../extension/src/cli-client');
const {NativeSourceProvider}=require('../../extension/src/NativeSourceProvider');
const {NativeDebugSourceMap}=require('../../extension/src/NativeDebugSourceMap');
const position=(text,offset)=>{const prefix=text.slice(0,offset),lines=prefix.split('\n');return{line:lines.length-1,character:lines.at(-1).length};};
test('actual native origin API maps saved JOX entities and CDATA into extension method projections without a database',{skip:!process.env.JADE_NATIVE_ORIGIN_CLI,timeout:120000},async()=>{
 const owned=fs.mkdtempSync(path.join(os.tmpdir(),'jade-debug-origin-')),project=path.join(owned,'project'),schema=path.join(project,'schemas'),origin=path.join(schema,'DebugOriginSchema/types/DebugOrigin.jox');
 let retired=false;
 const client=new CliWorkingSession({entry:process.env.JADE_NATIVE_ORIGIN_CLI,spawn:(exe,args,options)=>spawn(exe,args,{...options,cwd:owned,env:{...options.env,JADE_TOOLS_STATE_DIRECTORY:path.join(owned,'broker')}})});
 let provider;
 try{
  fs.mkdirSync(path.dirname(origin),{recursive:true});
  fs.writeFileSync(path.join(schema,'DebugOriginSchema.jox'),'<Schema name="DebugOriginSchema" id="621d2877-683f-48de-8d76-71834edb4ede"><superschema name="RootSchema"/></Schema>');
  const text='<Class name="DebugOrigin" id="972f0104-2276-47da-be10-d7d3453681d9">\r\n<superclass name="Object"/>\r\n<JadeMethod name="first" id="05ecdb32-a0ba-4d44-8c4f-624ce11b2695"><source>first();\r\nbegin\r\n write "caf&#233; &amp;";\r\nend;\r\n</source></JadeMethod>\r\n<JadeMethod name="second" id="4bc87b0b-dd39-494d-ae14-a946d6abbf37"><source><![CDATA[second();\r\nbegin\r\n write "second";\r\nend;]]></source></JadeMethod>\r\n</Class>'.replace(/\r\n/g,'\r\n');
  assert.ok(text.includes('\r\n'),'Native integration fixture must contain actual CRLF lines');
  fs.writeFileSync(origin,text);
  const config={sourceFormat:'jox',workingMode:'source-backed',characterSet:'ansi',workspaceRoots:[project]};
  fs.writeFileSync(path.join(project,'jade.json'),JSON.stringify(config));fs.writeFileSync(path.join(project,'.gitignore'),'/.jade/\n');
  const git=(...args)=>execFileSync('git.exe',['-C',project,...args],{windowsHide:true,timeout:15000,stdio:'pipe'});
  git('init','--quiet');git('config','commit.gpgsign','false');git('config','core.hooksPath',path.join(project,'.git/hooks'));git('config','user.name','Native source mapping control');git('config','user.email','source-mapping@example.invalid');git('add','--all');git('commit','--quiet','-m','Owned JOX mapping fixture');
  const baseline=fs.readFileSync(origin),index=fs.readFileSync(path.join(project,'.git/index'));
  assert.deepEqual((await client.request('status').promise).nativePIDs,[]);
  provider=new NativeSourceProvider({client,config});await provider.prepare();assert.equal(provider.flags.originLookup,true);assert.equal(provider.flags.nativeDebug,false);
  const originUri=pathToFileURL(origin).href,at=position(text,text.indexOf('&amp;')+2);
  const first=await provider.readAtOrigin({originUri,originText:text,position:at});assert.equal(first.entity.qualifiedName.member,'first');assert.match(first.projection.text,/café &/);
  const map=new NativeDebugSourceMap(first.projection.mapping),projected=position(first.projection.text,first.projection.text.indexOf('&'));
  assert.deepEqual(map.toProjection(at),projected);assert.deepEqual(map.toEditor(projected),position(text,text.indexOf('&amp;')));
  const second=await provider.readAtOrigin({originUri,originText:text,position:position(text,text.indexOf('write "second"'))});assert.equal(second.entity.qualifiedName.member,'second');
  const exact=await provider.readAtOrigin({entityId:second.entityId,originUri,originText:text});assert.deepEqual(exact.projection.mapping,second.projection.mapping);
  await assert.rejects(provider.readAtOrigin({originUri,originText:text+' ',position:at}),/stale|saved|match/i);
  assert.deepEqual(fs.readFileSync(origin),baseline);assert.deepEqual(fs.readFileSync(path.join(project,'.git/index')),index);assert.deepEqual((await client.request('status').promise).nativePIDs,[]);
 }finally{
  const failures=[];if(!client.client&&client.ownedClients.size===0)retired=true;
  try{await provider?.closeProject();}catch(error){failures.push(error);}
  if(client.client){try{const status=await client.request('status').promise;assert.deepEqual(status.nativePIDs,[]);await client.request('broker.retire').promise;retired=true;}catch(error){failures.push(error);}}
  try{await client.dispose();}catch(error){failures.push(error);}
  if(retired){assert.equal(path.dirname(owned),os.tmpdir());assert.ok(path.basename(owned).startsWith('jade-debug-origin-'));fs.rmSync(owned,{recursive:true,force:true});}
  if(failures.length)throw new AggregateError(failures,'Owned metadata broker cleanup was not confirmed; fixture retained at '+owned);
 }
});
