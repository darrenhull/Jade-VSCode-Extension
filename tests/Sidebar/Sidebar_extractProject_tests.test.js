'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {registerSidebar}=require('../../extension/src/sidebar');
function setup(){
 const uri=fsPath=>({fsPath,toString:()=> 'file:///'+fsPath});
 const a={name:'A',uri:uri('C:/A')},b={name:'B',uri:uri('C:/B')},commands=new Map(),errors=[];let selected;
 const vscode={window:{activeTextEditor:{document:{uri:b.uri}},createOutputChannel:()=>({appendLine(){},show(){},clear(){}}),showErrorMessage:async message=>errors.push(message)},workspace:{workspaceFolders:[a,b],getWorkspaceFolder:uri=>uri===a.uri?a:uri===b.uri?b:undefined},commands:{registerCommand:(name,fn)=>{commands.set(name,fn);return {dispose(){}};}}};
 registerSidebar(vscode,{subscriptions:[]},{isBusy:()=>false,settings:folder=>{selected=folder;throw Error('Stopped before native extraction');}});
 return {a,b,commands,errors,selected:()=>selected};
}
test('explicit pull target wins over an unrelated active editor project',async()=>{const s=setup();await s.commands.get('jadeNative.extractAllSources')(s.a.uri);assert.equal(s.selected(),s.a);});
test('a closed explicit pull project fails rather than using the active editor',async()=>{const s=setup();await s.commands.get('jadeNative.extractAllSources')({fsPath:'C:/closed'});assert.equal(s.selected(),undefined);assert.match(s.errors[0],/not open|workspace/i);});
