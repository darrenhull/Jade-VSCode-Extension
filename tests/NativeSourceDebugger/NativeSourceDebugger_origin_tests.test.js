 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {resolveNativeDebugDocument,debugSourceUri}=require('../../extension/src/native-source-debugger');
test('raw JOX selects its saved native method at the actual editor cursor without parsing XML',async()=>{
 let preparations=0;const calls=[],native={entityId:'method'},project={folder:'folder',provider:{snapshot:true,readAtOrigin:async selector=>{calls.push(selector);return native;}}},workspace={projectForUri:()=>project,prepare:async()=>{preparations++;}};
 const document={uri:{scheme:'file',fsPath:'C:/source/Fish.jox',toString:()=> 'file:///C:/source/Fish.jox'},isDirty:false,getText:()=> '<raw>'};
 const value=await resolveNativeDebugDocument(workspace,document,{line:12,character:8});
 assert.equal(preparations,1,'Saved JOX must refresh its native generation even if an older snapshot exists');assert.equal(value.project,project);assert.equal(value.document,native);assert.deepEqual(calls,[{originUri:document.uri.toString(),originText:'<raw>',position:{line:12,character:8}}]);
 await assert.rejects(resolveNativeDebugDocument(workspace,{...document,isDirty:true},{line:12,character:8}),/save/i);
});

test('Windows launch paths remain file URIs while jade-source identities remain intact',()=>{
 const vscode={Uri:{file:value=>({scheme:'file',value}),parse:value=>({scheme:'jade-source',value})}};
 assert.equal(debugSourceUri(vscode,'C:\\repo\\Fish.jox').scheme,'file');
 assert.equal(debugSourceUri(vscode,'jade-source:/method').scheme,'jade-source');
});

test('native stale-origin refusal is preserved rather than guessing a raw method location',async()=>{
 const project={provider:{snapshot:true,readAtOrigin:async()=>{throw Error('Saved JOX editor text is stale.');}}},workspace={projectForUri:()=>project,prepare:async()=>{}};
 const document={uri:{scheme:'file',fsPath:'C:/Fish.jox',toString:()=> 'file:///C:/Fish.jox'},getText:()=> 'stale',isDirty:false};
 await assert.rejects(resolveNativeDebugDocument(workspace,document,{line:0,character:0}),/stale/i);
});
