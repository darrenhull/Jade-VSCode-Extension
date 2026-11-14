'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const {LanguageModel}=require('../../extension/src/language-model');
const {parseSource,sourcePosition}=require('../../extension/src/source_symbols');
function source(name,parent,fields,methods,schema='Demo'){
 return 'schemaDefinition\n'+schema+' subschemaOf RootSchema partialDefinition;\ntypeHeaders\n'+name+' subclassOf '+parent+' transient;\ntypeDefinitions\n'+name+' completeDefinition\n(\nreferenceDefinitions\n'+fields+'\njadeMethodDefinitions\n'+Object.keys(methods).map(name=>name+'();').join('\n')+'\n)\ntypeSources\n'+name+' (\njadeMethodSources\n'+Object.entries(methods).map(([name,body])=>name+'\n{\n'+body+'\n}').join('\n')+'\n)';
}
function fixture(body){
 const project=new LanguageModel();
 const put=(name,text)=>{const model=parseSource(text,'file:///'+name+'.cls');project.update(model);return model;};
 const log=put('Log',source('Log','Object','filename: String[100];',{}));
 const base=put('Base',source('Base','Object','',{inheritedCall:'inheritedCall();\nbegin\nend;'}));
 let current=put('Worker',source('Worker','Base','log: Log;',{
  run:body,ownCall:'ownCall();\nbegin\nend;'
 }));
 let definition,content;
 const disposable={dispose(){}},vscode={
  languages:{registerDocumentSymbolProvider:()=>disposable,registerWorkspaceSymbolProvider:()=>disposable,registerDefinitionProvider:(selector,provider)=>{definition=provider;return disposable;}},
  workspace:{registerTextDocumentContentProvider:(scheme,provider)=>{content=provider;return disposable;}},
  Uri:{parse:value=>({toString:()=>value}),from:parts=>({...parts,toString:()=>parts.scheme+':'+parts.path+'?'+encodeURIComponent(parts.query)})},
  Range:class{constructor(a,b,c,d){this.start={line:a,character:b};this.end={line:c,character:d};}},
  Location:class{constructor(uri,range){Object.assign(this,{uri,range});}}
 };
 const filename=path.resolve(__dirname,'../../extension/src/navigation.js'),localRequire=createRequire(filename),module={exports:{}};
 vm.runInNewContext('(function(require,module){'+fs.readFileSync(filename,'utf8')+'\n})',{})(name=>name==='vscode'?vscode:localRequire(name),module);
 const document={version:1,isClosed:false,fileName:'Worker.cls',uri:vscode.Uri.parse(current.uri),getText:()=>current.text,getWordRangeAtPosition:()=>({}),offsetAt:position=>position.offset,positionAt:offset=>({offset})};
 module.exports.registerNavigation({subscriptions:[]},{index:{project},ready:async()=>true,model:()=>current});
 const navigate=async (needle,word,token={})=>{const offset=current.text.indexOf(needle,current.text.indexOf('typeSources'))+(word?needle.indexOf(word):0)+1;assert.ok(offset>0,'fixture reference exists');return definition.provideDefinition(document,{offset},token);};
 const expected=(model,offset)=>({uri:model.uri,position:sourcePosition(model,offset)});
 function check(location,model,offset){assert.ok(location,'a source-backed definition must be returned');assert.equal(location.uri.toString(),model.uri);assert.deepEqual({...location.range.start},sourcePosition(model,offset));}
 return {project,get current(){return current;},replaceCurrent:text=>{current=put('Worker',text);},log,base,navigate,check,put,expected,document,provide:(position)=>definition.provideDefinition(document,position,{}),content:uri=>content.provideTextDocumentContent(uri)};
}
for(const [name,call,target] of [['unqualified own method','ownCall();','ownCall'],['unqualified inherited method','inheritedCall();','inheritedCall'],['explicit self method','self.ownCall();','ownCall']])test('definition provider resolves '+name,async()=>{
 const f=fixture('run();\nbegin\n '+call+'\nend;'),model=target==='inheritedCall'?f.base:f.current;
 const location=await f.navigate(call,target);f.check(location,model,model.text.indexOf(target+'\n{'));
});
test('definition provider resolves a property through a typed local receiver',async()=>{
 const f=fixture('run();\nvars\n localLog: Log;\nbegin\n localLog.filename := null;\nend;');
 f.check(await f.navigate('filename := null'),f.log,f.log.text.indexOf('filename:'));
});
test('definition provider resolves a property through an owner reference',async()=>{
 const f=fixture('run();\nbegin\n log.filename := null;\nend;');
 f.check(await f.navigate('filename := null'),f.log,f.log.text.indexOf('filename:'));
});
test('Ctrl+click on a local receiver opens its vars declaration',async()=>{
 const f=fixture('run();\nvars\n localLog: Log;\nbegin\n localLog.filename := null;\nend;');
 f.check(await f.navigate('localLog.filename'),f.current,f.current.text.indexOf('localLog: Log'));
});
test('Ctrl+click on a parameter receiver opens its method signature',async()=>{
 const f=fixture('run(localLog: Log);\nbegin\n localLog.filename := null;\nend;');
 f.check(await f.navigate('localLog.filename'),f.current,f.current.text.indexOf('localLog: Log'));
});
test('local declarations shadow owner properties without opening the owner declaration',async()=>{
 const f=fixture('run();\nvars\n log: Log;\nbegin\n log.filename := null;\nend;');
 f.check(await f.navigate('log.filename'),f.current,f.current.text.lastIndexOf('log: Log'));
});

function systemLog(f,extra={}){f.project.setSystemCache({types:[
 {oid:'object',name:'Object',schema_name:'RootSchema',methods:[{name:'nativeCall',parameters:[]}]},
 {oid:'log',name:'JadeLog',schema_name:'RootSchema',superclass_oid:'object',properties:[{name:'fileName',type_oid:'string',length:100}],methods:[{name:'log',parameters:[{name:'message',type_oid:'string',usage:1}]}],...extra},
 {oid:'string',name:'String',schema_name:'RootSchema',primitive:true}
]});}
test('native JadeLog property opens explicitly labelled read-only declaration metadata',async()=>{
 const f=fixture('run();\nvars\n nativeLog: JadeLog;\nbegin\n nativeLog.fileName := null;\nend;');systemLog(f);
 const location=await f.navigate('fileName := null');assert.ok(location,'native property has a navigable metadata declaration');
 assert.equal(location.uri.scheme,'jade-native-declaration');const text=f.content(location.uri);
 assert.match(text,/Native declaration metadata \(read-only\)/);assert.match(text,/RootSchema::JadeLog/);assert.match(text,/property fileName : String\[100\]/);assert.doesNotMatch(text,/\bbegin\b|\bend;|typeSources/);
 assert.equal(text.split('\n')[location.range.start.line].slice(location.range.start.character,location.range.end.character),'fileName');
});
test('native method and unqualified inherited native method use cached signatures without fabricated bodies',async()=>{
 const f=fixture('run();\nvars\n nativeLog: JadeLog;\nbegin\n nativeLog.log("message");\n nativeCall();\nend;');systemLog(f);
 const log=await f.navigate('log("message")'),inherited=await f.navigate('nativeCall();');assert.ok(log);assert.ok(inherited);
 assert.match(f.content(log.uri),/method log\(message : String input\)/);assert.match(f.content(inherited.uri),/RootSchema::Object/);assert.match(f.content(inherited.uri),/method nativeCall\(\)/);
});
test('workspace source takes precedence over native metadata for the same qualified type',async()=>{
 const f=fixture('run();\nvars\n nativeLog: JadeLog;\nbegin\n nativeLog.fileName := null;\nend;');systemLog(f);
 const actual=f.put('ActualLog',source('JadeLog','Object','fileName: String[75];',{},'RootSchema'));
 f.check(await f.navigate('fileName := null'),actual,actual.text.indexOf('fileName:'));
});
test('ambiguous workspace definitions never fall through to a same-name native declaration',async()=>{
 const f=fixture('run();\nvars\n nativeLog: JadeLog;\nbegin\n nativeLog.fileName := null;\nend;');systemLog(f);
 for(const name of ['FirstLog','SecondLog'])f.put(name,source('JadeLog','Object','fileName: String[75];',{},'RootSchema'));
 assert.equal(await f.navigate('fileName := null'),undefined);
});
test('missing native metadata and cancelled navigation return no guessed target',async()=>{
 const f=fixture('run();\nvars\n nativeLog: JadeLog;\nbegin\n nativeLog.fileName := null;\nend;');
 assert.equal(await f.navigate('fileName := null'),undefined);systemLog(f);assert.equal(await f.navigate('fileName := null',undefined,{isCancellationRequested:true}),undefined);
});
test('oversized cached native signatures fail closed instead of creating an unbounded virtual document URI',async()=>{
 const f=fixture('run();\nvars\n nativeLog: JadeLog;\nbegin\n nativeLog.log("message");\nend;');systemLog(f,{methods:[{name:'log',parameters:Array.from({length:1000},(_,i)=>({name:'parameter'+i,type_oid:'string'}))}]});
 assert.equal(await f.navigate('log("message")'),undefined);
});

test('grouped local and parameter names keep their own exact declaration selection',async()=>{
 for(const declaration of ['run(log, logger: Log);\nbegin','run();\nvars\n log, logger: Log;\nbegin']){
  const f=fixture(declaration+'\n log.filename := null;\n logger.filename := null;\nend;');
  f.check(await f.navigate('log.filename'),f.current,f.current.text.indexOf('log, logger:'));
  f.check(await f.navigate('logger.filename'),f.current,f.current.text.indexOf('logger: Log'));
 }
});
test('an unsaved method replacement supplies current receiver declarations and method targets',async()=>{
 const f=fixture('run();\nbegin\n ownCall();\nend;'),old=f.current;
 f.replaceCurrent(old.text.replace('run();\nbegin','run(newLog: Log);\nbegin').replace(' ownCall();',' newLog.filename := null;\n ownCall();'));
 f.check(await f.navigate('newLog.filename'),f.current,f.current.text.indexOf('newLog: Log'));
 f.check(await f.navigate('filename := null'),f.log,f.log.text.indexOf('filename:'));
 f.check(await f.navigate('ownCall();'),f.current,f.current.text.indexOf('ownCall\n{'));
});
test('parameter shadowing prevents a fallback through a same-name owner property',async()=>{
 const f=fixture('run(log: UnknownLog);\nbegin\n log.filename := null;\nend;');
 assert.equal(await f.navigate('filename := null'),undefined);
 f.check(await f.navigate('log.filename'),f.current,f.current.text.indexOf('log: UnknownLog'));
});
test('unrelated same-name schema classes do not capture a typed receiver definition',async()=>{
 const f=fixture('run();\nvars\n localLog: Log;\nbegin\n localLog.filename := null;\nend;');
 f.put('OtherLog',source('Log','Object','filename: String[70];',{},'Unrelated'));
 f.check(await f.navigate('filename := null'),f.log,f.log.text.indexOf('filename:'));
});

test('Class Workspace Ctrl+click maps focused method offsets through the original definition provider',async()=>{
 const {MethodDocumentBinding}=require('../../extension/src/method-document-binding');
 const {ClassWorkspaceEditorProvider}=require('../../extension/src/class-workspace-editor-provider');
 const f=fixture('run();\nvars\n nativeLog: JadeLog;\nbegin\n nativeLog.fileName := null;\n ownCall();\nend;');systemLog(f);
 const binding=new MethodDocumentBinding(f.document,()=>{throw Error('Navigation must not edit source');});binding.select('Worker','run');
 const opened=[],provider=new ClassWorkspaceEditorProvider({commands:{executeCommand:async(name,uri,position)=>{assert.equal(name,'vscode.executeDefinitionProvider');assert.equal(uri,f.document.uri);const target=await f.provide(position);return target?[target]:[];}},window:{showTextDocument:async(uri,options)=>opened.push({uri,options})}},()=>{});
 const services=provider.services(f.document,binding,{active:true}),snapshot=binding.snapshot();
 for(const needle of ['nativeLog.fileName','fileName := null','ownCall();'])assert.equal(await services.definition(f.current.text.indexOf(needle,snapshot.start)+1-snapshot.start),true);
 assert.equal(opened[0].uri.toString(),f.current.uri);assert.equal(opened[1].uri.scheme,'jade-native-declaration');assert.equal(opened[2].uri.toString(),f.current.uri);
});
test('subschema Object copy resolves its unqualified source method and inherited native declaration separately',async()=>{
 const f=fixture('run();\nbegin\nend;');systemLog(f);
 f.replaceCurrent('schemaDefinition\nDemo subschemaOf RootSchema partialDefinition;\ntypeDefinitions\nObject completeDefinition\n(\njadeMethodDefinitions\nrun();\nownCall();\n)\ntypeSources\nObject (\njadeMethodSources\nrun\n{\nrun();\nbegin\n ownCall();\n nativeCall();\nend;\n}\nownCall\n{\nownCall();\nbegin\nend;\n}\n)');
 f.check(await f.navigate('ownCall();'),f.current,f.current.text.indexOf('ownCall\n{'));
 const native=await f.navigate('nativeCall();');assert.ok(native);assert.match(f.content(native.uri),/RootSchema::Object/);
});
