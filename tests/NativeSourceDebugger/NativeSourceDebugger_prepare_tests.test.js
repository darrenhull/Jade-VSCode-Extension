'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {prepareSemanticDebugLaunch,selectNativeMethod}=require('../../extension/src/native-source-debugger');

function fixture({capable=true,workingMode='git-first',sourceDatabasePath}={}){
 const root=path.resolve('project'),projection=path.join(root,'.jade','projections','Demo.cls'),document={uri:{scheme:'jade-source',toString:()=> 'jade-source:/Demo.cls'}};
 const otherProjection=path.join(root,'.jade','projections','Other.cls'),other={uri:{toString:()=> 'jade-source:/Other.cls'},document:{projection:{cacheUri:pathToFileURL(otherProjection).href}}};
 const project={folder:{uri:{fsPath:root}},provider:{root,config:{sourceFormat:'jox'},flags:{nativeDebug:capable}},files:{documents:new Map([['other',other]]),binding:()=>({projection:{cacheUri:projection}})}};
 const calls=[];
 const workspace={record:()=>({project,document:{projection:{cacheUri:pathToFileURL(projection).href}}}),sync:async(value,options)=>{calls.push(['sync',value,options]);return{passed:true,code:0,report:{inSync:true}};}};
 const working={root:path.join(root,'.jade','working'),databasePath:path.join(root,'.jade','working','system'),installPath:path.join(root,'Jade'),workingMode,characterSet:'ansi',...(sourceDatabasePath?{sourceDatabasePath}:{})};
 const client={prepareWorking:async(config,output,options)=>{calls.push(['prepare',config,output,options]);return working;}};
 return {root,projection,document,project,workspace,client,calls,working};
}

test('semantic debug preparation syncs saved JOX and reuses exact Source-free Working',async()=>{
 const f=fixture(),output=()=>{},signal=new AbortController().signal;
 const diagnostics=[];const result=await prepareSemanticDebugLaunch(f.workspace,f.client,f.document,output,signal,(...args)=>diagnostics.push(args));
 assert.deepEqual(f.calls.map(value=>value[0]),['sync','prepare']);assert.strictEqual(f.calls[0][1],f.project);
 assert.equal(f.calls[1][3].cwd,f.root);assert.strictEqual(f.calls[1][3].signal,signal);assert.equal(f.calls[1][1].signal,undefined);assert.equal(result.working,f.working);assert.equal(result.config.sourceFormat,'jox');
 assert.equal(result.config.installPath,f.working.installPath);assert.equal(result.config.characterSet,'ansi');assert.deepEqual(result.config.files,[path.join(f.root,'.jade','projections','Other.cls'),f.projection]);
 assert.deepEqual(diagnostics,[[f.project,{passed:true,code:0,report:{inSync:true}}]]);
 assert.deepEqual(result.sourceMappings.map(value=>value.editor),['jade-source:/Other.cls',f.document.uri.toString()]);assert.equal(result.config.databasePath,undefined);
});

test('semantic debug preparation stops before Working preparation when sync is cancelled',async()=>{
 const f=fixture(),controller=new AbortController();
 f.workspace.sync=async()=>{controller.abort();return{passed:true,code:0,report:{inSync:true}};};
 await assert.rejects(prepareSemanticDebugLaunch(f.workspace,f.client,f.document,()=>{},controller.signal),error=>error.cancelled===true&&/cancelled/i.test(error.message));
 assert.equal(f.calls.some(value=>value[0]==='prepare'),false);
});

test('semantic debug preparation refuses unqualified or Source-backed targets',async()=>{
 await assert.rejects(prepareSemanticDebugLaunch(fixture({capable:false}).workspace,{},fixture({capable:false}).document,()=>{},new AbortController().signal),/not qualified/i);
 const source=fixture({sourceDatabasePath:path.resolve('source')});
 await assert.rejects(prepareSemanticDebugLaunch(source.workspace,source.client,source.document,()=>{},new AbortController().signal),/Source-free Git-first Working/i);
});

test('JOX member projection launches from exact native method metadata',()=>{
 const projection=path.join(path.resolve('project'),'.jade','projections','value.jade'),text='value(): Integer;\nbegin\n return 1;\nend;';
 const native={entityId:'opaque-method',entity:{id:'opaque-method',kind:'method',qualifiedName:{schema:'Example',type:'Generic',member:'value'},flags:{typeMethod:false,unitTest:true}},projection:{cacheUri:pathToFileURL(projection).href}};
 assert.deepEqual(selectNativeMethod(native,text,'value'),{schema:'Example',owner:'Generic',name:'value',file:projection,unitTest:true,start:0,end:text.length,selection:0,line:1,body:text});
 assert.throws(()=>selectNativeMethod(native,text,'other'),/does not match/i);
 assert.throws(()=>selectNativeMethod({...native,entity:{...native.entity,flags:{typeMethod:true}}},text),/non-static/i);
 assert.throws(()=>selectNativeMethod(native,'value(input: Integer);\nbegin\nend;'),/parameterless/i);
});
