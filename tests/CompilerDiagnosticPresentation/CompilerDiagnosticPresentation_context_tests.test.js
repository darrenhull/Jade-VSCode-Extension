'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {registerCompileCommands}=require('../../extension/src/compile-commands');
const unknown={compiler_error:6281,message:'Synthetic native parser error',diagnostic_context_unavailable:true};
function reporter(){
 const body=fs.readFileSync(path.join(__dirname,'../../extension/src/extension.js'),'utf8'),start=body.indexOf('  function reportDiagnostic(report) {'),end=body.indexOf("  const debugTests=",start),problems=[];
 const vscode={Uri:{file:source=>({source,toString:()=>source})},workspace:{textDocuments:[]},Range:class{constructor(...values){this.values=values;}},Diagnostic:class{constructor(range,message){Object.assign(this,{range,message});}},DiagnosticSeverity:{Error:0}};
 const context={vscode,diagnosticLocation:require('../../extension/src/compiler-diagnostic-presentation').diagnosticLocation,diagnostics:{delete(){},set(uri,items){problems.push({uri,items});}}};vm.runInNewContext(body.slice(start,end)+'\nthis.report=reportDiagnostic;',context);return{context,problems};
}
test('unavailable source context retains 6281 without inventing Problems at the selected program line1',()=>{
 const f=reporter();f.context.report({source:'C:/project/Selected.cls',compiled:false,diagnostics:[unknown]});assert.equal(f.problems.length,0);
});
test('real native generated-source positions remain exact Problems locations',()=>{
 const f=reporter();f.context.report({source:'C:/project/Selected.cls',compiled:false,diagnostics:[{compiler_error:6027,message:'Unknown identifier',source:'C:/project/Generated.cls',line:77,column:3}]});
 assert.equal(f.problems.length,1);assert.equal(f.problems[0].uri.source,'C:/project/Generated.cls');assert.equal(f.problems[0].items[0].code,6027);assert.deepEqual([...f.problems[0].items[0].range.values.slice(0,2)],[76,2]);
});
test('ordinary build output preserves context-free native failure without undefined source fields',async()=>{
 const commands=new Map(),lines=[],result={passed:false,code:6281,report:{compiled:false,diagnostics:[unknown]}},file='C:/project/Selected.cls',dispose=()=>({dispose(){}});
 const vscode={commands:{registerCommand(name,run){commands.set(name,run);return dispose();}},window:{activeTextEditor:{document:{uri:{scheme:'file',fsPath:file}}},showErrorMessage(){},withProgress:async(_options,run)=>run({}, {onCancellationRequested:dispose})},workspace:{getWorkspaceFolder:()=>({})},Uri:{file:value=>value},ProgressLocation:{Notification:1}};
 registerCompileCommands(vscode,{subscriptions:[]},{beforeOperation:async()=>{},isBusy:()=>false,setBusy:async()=>{},classConfig:()=>({program:file}),workingFiles:async config=>{config.files=[];},startWorking:()=>({completion:Promise.resolve(result),stop(){}}),diagnostics:{delete(){}},output:{clear(){},show(){},append(){},appendLine:line=>lines.push(line)}});
 assert.equal(await commands.get('jadeNative.compileClass')(),result);assert.match(lines.join('\n'),/Jade 6281.*Synthetic native parser error/);assert.doesNotMatch(lines.join('\n'),/undefined/);assert.ok(!lines.some(line=>line.includes(file+':1')));
});
