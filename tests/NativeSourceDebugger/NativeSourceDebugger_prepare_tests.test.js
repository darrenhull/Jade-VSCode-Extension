'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {prepareSemanticDebugLaunch}=require('../../extension/src/native-source-debugger');

function fixture({capable=true,workingMode='git-first',sourceDatabasePath}={}){
 const root=path.resolve('project'),projection=path.join(root,'.jade','projections','Demo.cls'),document={uri:{scheme:'jade-source',toString:()=> 'jade-source:/Demo.cls'}};
 const other={uri:{toString:()=> 'jade-source:/Other.cls'},document:{projection:{cacheUri:path.join(root,'.jade','projections','Other.cls')}}};
 const project={folder:{uri:{fsPath:root}},provider:{root,config:{sourceFormat:'jox'},flags:{nativeDebug:capable}},files:{documents:new Map([['other',other]]),binding:()=>({projection:{cacheUri:projection}})}};
 const calls=[];
 const workspace={record:()=>({project,document:{projection:{cacheUri:projection}}}),sync:async(value,options)=>{calls.push(['sync',value,options]);return{passed:true,code:0,report:{inSync:true}};}};
 const working={root:path.join(root,'.jade','working'),databasePath:path.join(root,'.jade','working','system'),workingMode,characterSet:'ansi',...(sourceDatabasePath?{sourceDatabasePath}:{})};
 const client={prepareWorking:async(config,output,options)=>{calls.push(['prepare',config,output,options]);return working;}};
 return {root,projection,document,project,workspace,client,calls,working};
}

test('semantic debug preparation syncs saved JOX and reuses exact Source-free Working',async()=>{
 const f=fixture(),output=()=>{},signal=new AbortController().signal;
 const result=await prepareSemanticDebugLaunch(f.workspace,f.client,f.document,output,signal);
 assert.deepEqual(f.calls.map(value=>value[0]),['sync','prepare']);assert.strictEqual(f.calls[0][1],f.project);
 assert.equal(f.calls[1][3].cwd,f.root);assert.strictEqual(f.calls[1][1].signal,signal);assert.equal(result.working,f.working);assert.equal(result.config.sourceFormat,'jox');
 assert.equal(result.config.characterSet,'ansi');assert.deepEqual(result.config.files,[path.join(f.root,'.jade','projections','Other.cls'),f.projection]);
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
