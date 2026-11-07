'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {MethodDocumentBinding}=require('../../extension/src/method-document-binding');
function fixture(){
 let text=['schemaDefinition','Pets subschemaOf RootSchema partialDefinition;','typeHeaders','Fish subclassOf Object transient;','typeDefinitions','Fish completeDefinition','(','attributeDefinitions','// 🐟 original source','\t\tname: String[50] number = 1;','\t\tweight: Integer number = 2;','referenceDefinitions','\t\ttank: Object number = 3;',')','typeSources'].join('\r\n'),version=1;
 const original=text,document={uri:{toString:()=> 'file:///Fish.cls'},fileName:'Fish.cls',eol:2,getText:()=>text,get version(){return version;}};
 const binding=new MethodDocumentBinding(document,async(start,end,value)=>{text=text.slice(0,start)+value+text.slice(end);version++;binding.changed([{rangeOffset:start,rangeLength:end-start,text:value}]);return true;});
 return{binding,document,original,replace(value,changes){text=value;version++;binding.changed(changes);}};
}
test('edits the exact property declaration in original CRLF/Unicode source without touching adjacent declarations',async()=>{
 const f=fixture(),selected=f.binding.select('Fish','name','property');assert.equal(selected.available,true);assert.equal(selected.kind,'property');assert.equal(selected.text,'name: String[50] number = 1;');assert.equal(selected.lineEnding,'\r\n');
 const at=selected.text.indexOf('50');await f.binding.edit({version:selected.version,owner:'Fish',member:'name',kind:'property',start:at,end:at+2,text:'80'});
 assert.equal(f.document.getText(),f.original.replace('String[50]','String[80]'));assert.equal(f.binding.snapshot().text,'name: String[80] number = 1;');
});
test('edits reference declarations through the same real-document range contract',async()=>{
 const f=fixture(),selected=f.binding.select('Fish','tank','reference');assert.equal(selected.available,true);assert.equal(selected.kind,'reference');assert.equal(selected.text,'tank: Object number = 3;');
 const at=selected.text.indexOf('Object');await f.binding.edit({version:selected.version,owner:'Fish',member:'tank',kind:'reference',start:at,end:at+6,text:'Fish'});assert.equal(f.document.getText(),f.original.replace('tank: Object','tank: Fish'));
});
test('keeps incomplete property types and missing semicolons anchored without swallowing the next property',async()=>{
 const f=fixture();let selected=f.binding.select('Fish','name','property');await f.binding.edit({version:selected.version,start:selected.text.length-1,end:selected.text.length,text:''});
 selected=f.binding.snapshot();assert.equal(selected.available,true);assert.equal(selected.text,'name: String[50] number = 1');assert.doesNotMatch(selected.text,/weight/);
 const at=selected.text.indexOf('String');await f.binding.edit({version:selected.version,start:at,end:at+6,text:''});selected=f.binding.snapshot();assert.equal(selected.available,true);assert.doesNotMatch(selected.text,/weight/);
});
test('retains a local declaration rename and an empty draft, then maps native undo back to the original member',async()=>{
 const f=fixture();let selected=f.binding.select('Fish','name','property');await f.binding.edit({version:selected.version,start:0,end:selected.text.length,text:''});selected=f.binding.snapshot();assert.equal(selected.available,true);assert.equal(selected.text,'');
 await f.binding.edit({version:selected.version,start:0,end:0,text:'nickname: String[20];'});selected=f.binding.snapshot();assert.equal(selected.available,true);assert.equal(selected.member,'name');assert.equal(selected.displayName,'nickname');assert.equal(selected.text,'nickname: String[20];');
 const current=f.document.getText();f.replace(f.original,[{rangeOffset:0,rangeLength:current.length,text:f.original}]);assert.equal(f.binding.snapshot().available,true);assert.equal(f.binding.snapshot().text,'name: String[50] number = 1;');
});
test('rejects a stale property-kind request and invalidates a confirmed external removal',async()=>{
 const f=fixture();let selected=f.binding.select('Fish','name','property');await assert.rejects(f.binding.edit({version:selected.version,owner:'Fish',member:'name',kind:'method',start:0,end:0,text:'wrong'}),/changed|kind/);
 const from=selected.start,to=selected.end;f.replace(f.document.getText().slice(0,from)+f.document.getText().slice(to),[{rangeOffset:from,rangeLength:to-from,text:''}]);assert.equal(f.binding.snapshot().available,false);assert.equal(f.binding.snapshot().text,'');
});
test('refuses duplicate declarations, missing-semicolon spans and non-property sections',()=>{
 const f=fixture(),text=f.document.getText();
 f.replace(text.replace('weight: Integer number = 2;','name: Integer number = 2;'),[]);assert.equal(f.binding.select('Fish','name','property').available,false);
 f.replace(text.replace('name: String[50] number = 1;','name: String[50] number = 1'),[]);assert.equal(f.binding.select('Fish','name','property').available,false);
 f.replace(text.replace('attributeDefinitions','constantDefinitions'),[]);assert.equal(f.binding.select('Fish','name','property').available,false);assert.equal(f.binding.select('Fish','name','constant').available,false);
 f.replace(text.replace('attributeDefinitions','externalKeyDefinitions'),[]);assert.equal(f.binding.select('Fish','name','property').available,false);
});
