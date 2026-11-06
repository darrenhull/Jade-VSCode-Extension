'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {nativeProcess}=require('../extension/src/working-database'),{collectionCatalog,generateCollection}=require('../extension/src/collections'),{parseSource}=require('../extension/src/source_symbols'),{NativeDebugger}=require('../extension/src/debug-transport');
test('generated keyed collections compile natively and preserve composite order, lookup, duplicates and case handling',{skip:process.env.JADE_DEBUG_CONNECTED!=='1',timeout:120000},async()=>{
 const base=path.resolve(__dirname,'..'),working=JSON.parse(fs.readFileSync(process.env.JADE_TEST_CONFIG)),directory=path.join(base,'evidence/collection-generated');fs.mkdirSync(directory,{recursive:true});
 let output='';const header='jadeVersionNumber "25.0.02";\r\nschemaDefinition\r\nSJetSchema subschemaOf RootSchema partialDefinition;\r\n';
 const text=fs.readFileSync(path.join(base,'evidence/collection-probe/KeyedFixtureItem.cls'),'utf8');
 const catalog=collectionCatalog({schemas:[{name:'SJetSchema',parent:'RootSchema',folder:directory,header:{text:header},classes:[{owner:'KeyedFixtureItem',model:parseSource(text,'Item.cls')}]}]});
 const load=async(name,text)=>{const file=path.join(directory,name+'.cls');fs.writeFileSync(file,text);const result=await nativeProcess(path.join(working.installPath,'bin/jadloadb.exe'),['path='+working.databasePath,'ini='+working.iniPath,'server=singleUser','schemaFile='+file,'targetSchema=SJetSchema','loadStyle=currentSchemaVersion','dontSaveSources=false','replayableReorg=true'],working,t=>output+=t);assert.equal(result.success,true,output);};
 const common={schema:'SJetSchema',membership:'KeyedFixtureItem',kind:'member',lifetime:'transient',keys:[{name:'name'},{name:'rank',descending:true}]};
 for(const request of [{...common,name:'GeneratedByName'},{...common,name:'GeneratedDuplicates',duplicatesAllowed:true,keys:[{name:'name'}]},{...common,name:'GeneratedInsensitive',keys:[{name:'name',caseInsensitive:true}]},{...common,name:'GeneratedExternal',kind:'external',keys:[{name:'lookup',type:'String',length:50}]}]){const generated=generateCollection(request,catalog);await load(request.name,generated.text);}
 const body=`verify() : Boolean;
vars
 a, b, c : KeyedFixtureItem;
 ordered : GeneratedByName;
 duplicates : GeneratedDuplicates;
 insensitive : GeneratedInsensitive;
 external : GeneratedExternal;
begin
 create a transient; create b transient; create c transient;
 a.name := "B"; a.rank := 1;
 b.name := "A"; b.rank := 2;
 c.name := "A"; c.rank := 3;
 create ordered transient; ordered.add(a); ordered.add(b); ordered.add(c);
 if ordered.first() <> c then return false; endif;
 if ordered.getAtKey("A", 2) <> b then return false; endif;
 create duplicates transient; duplicates.add(b); duplicates.add(c);
 if duplicates.size() <> 2 then return false; endif;
 create insensitive transient; insensitive.add(a);
 if insensitive.getAtKey("b") <> a then return false; endif;
 create external transient; external.putAtKey("externalKey", a);
 if external.getAtKey("externalKey") <> a then return false; endif;
 return true;
epilog
 delete external; delete insensitive; delete duplicates; delete ordered;
 delete a; delete b; delete c;
end;`;
 await load('GeneratedCollectionChecks',header+'typeHeaders\r\nGeneratedCollectionChecks subclassOf Object transient;\r\ntypeDefinitions\r\nGeneratedCollectionChecks completeDefinition\r\n(\r\njadeMethodDefinitions\r\nverify() : Boolean;\r\n)\r\ntypeSources\r\nGeneratedCollectionChecks (\r\njadeMethodSources\r\nverify\r\n{\r\n'+body+'\r\n}\r\n)');
 const session=path.join(directory,'session.json');fs.writeFileSync(session,JSON.stringify({...working,schema:'SJetSchema',owner:'GeneratedCollectionChecks',method:'verify',abi:path.join(base,'extension/native/debugger-abi.json')}));
 const client=new NativeDebugger(path.join(base,'extension/native/jade-debug-helper.exe'),session);const events=[];
 try{const result=await new Promise((resolve,reject)=>{client.on('failure',reject);client.on('close',code=>reject(Error('Closed before result: '+code)));client.on('message',m=>{events.push(m);if(m.event==='error')reject(Error(m.message));if(m.event==='stopped')client.request('resume',{mode:2}).catch(reject);if(m.event==='exited')resolve(m);});});assert.equal(result.exitCode,0);assert.equal(result.result.value,'true');}
 finally{client.stop();await new Promise(resolve=>{if(client.state==='closed')resolve();else client.once('close',resolve);});fs.writeFileSync(path.join(directory,'output.txt'),output);fs.writeFileSync(path.join(directory,'events.json'),JSON.stringify(events,null,2));}
});
