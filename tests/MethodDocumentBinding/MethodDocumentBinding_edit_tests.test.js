'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MethodDocumentBinding } = require('../../extension/src/method-document-binding');
const source = (eol='\n') => ['schemaDefinition','Pets subschemaOf RootSchema partialDefinition;','typeHeaders','Fish subclassOf Object transient;','typeDefinitions','Fish completeDefinition','(','jadeMethodDefinitions','name() : String;','other();',')','typeSources','Fish (','jadeMethodSources','name','{','name() : String;','begin',' return "🐟";','end;','}','other','{','other();','begin','end;','}',')'].join(eol);
function fixture(text=source()) {
 let value=text, version=1;
 const document={uri:{toString:()=> 'file:///Fish.cls'},fileName:'Fish.cls',get version(){return version;},getText:()=>value};
 let binding;
 const apply=async (start,end,text,expected)=>{assert.equal(expected,version);value=value.slice(0,start)+text+value.slice(end);version++;binding.changed([{rangeOffset:start,rangeLength:end-start,text}]);return true;};
 binding=new MethodDocumentBinding(document,apply);
 return {document,binding,setText(text,changes){value=text;version++;binding.changed(changes);}};
}
test('maps UTF16 and CRLF method edits into the real source and preserves adjacent methods',async()=>{
 const {document,binding}=fixture(source('\r\n'));const selected=binding.select('Fish','name');
 assert.equal(selected.text,'\r\nname() : String;\r\nbegin\r\n return "🐟";\r\nend;\r\n');
 const offset=selected.text.indexOf('🐟');
 await binding.edit({version:selected.version,start:offset,end:offset+2,text:'Goldfish'});
 assert.match(document.getText(),/return "Goldfish";/);assert.match(document.getText(),/other\r\n\{\r\nother\(\);/);
 assert.equal(binding.snapshot().version,2);
});
test('rejects stale edits without replacing concurrent original-source changes',async()=>{
 const {document,binding}=fixture();const selected=binding.select('Fish','name');
 const old=document.getText();const prefix='// changed externally\n';
 await binding.edit({version:selected.version,start:0,end:0,text:'// local\n'});
 await assert.rejects(binding.edit({version:selected.version,start:0,end:0,text:prefix}),/changed/);
 assert.ok(document.getText().startsWith(old.slice(0,20)));
});
test('retains anchored method through incomplete strings and recovers when typing completes',async()=>{
 const {binding}=fixture();let selected=binding.select('Fish','name');const offset=selected.text.indexOf('"🐟"');
 await binding.edit({version:selected.version,start:offset,end:offset+4,text:'"incomplete'});
 assert.equal(binding.snapshot().member,'name');assert.match(binding.snapshot().text,/"incomplete/);
 selected=binding.snapshot();await binding.edit({version:selected.version,start:offset+11,end:offset+11,text:'"'});
 assert.equal(binding.snapshot().member,'name');
});
test('tracks preceding source edits and detects confirmed member removal',()=>{
 const f=fixture();const selected=f.binding.select('Fish','name');const original=f.document.getText();const prefix='// 🐟\r\n';
 f.setText(prefix+original,[{rangeOffset:0,rangeLength:0,text:prefix}]);
 assert.equal(f.binding.snapshot().start,selected.start+prefix.length);
 const current=f.document.getText();const state=f.binding.snapshot();
 f.setText(current.slice(0,state.start-6)+current.slice(state.end+1),[{rangeOffset:state.start-6,rangeLength:state.end+1-(state.start-6),text:''}]);
 assert.equal(f.binding.snapshot().available,false);
});
test('rejects pending edits from a previously selected member and invalid fragment boundaries',async()=>{
 const {document,binding}=fixture();const first=binding.select('Fish','name');binding.select('Fish','other');const original=document.getText();
 await assert.rejects(binding.edit({version:first.version,owner:'Fish',member:'name',start:0,end:0,text:'wrong owner'}),/selected method changed/);
 const current=binding.snapshot();
 for(const edit of [{start:-1,end:0},{start:0,end:current.text.length+1},{start:2,end:1},{start:0.1,end:1}])await assert.rejects(binding.edit({version:current.version,...edit,text:'bad'}),/range/);
 assert.equal(document.getText(),original);
});
test('notifies subscribers with real document revision and disposes subscriptions',async()=>{
 const {binding}=fixture(),events=[];binding.select('Fish','name');const disposable=binding.onDidChange(event=>events.push(event));
 let state=binding.snapshot();await binding.edit({version:state.version,start:0,end:0,text:'// one\n'});assert.equal(events.length,1);assert.equal(events[0].version,2);
 disposable.dispose();state=binding.snapshot();await binding.edit({version:state.version,start:0,end:0,text:'// two\n'});assert.equal(events.length,1);
});
test('reports a known read-only source before accepting an edit',async()=>{
 const {document,binding}=fixture();binding.readOnlyReason='The original source file is read-only.';const selected=binding.select('Fish','name'),original=document.getText();assert.equal(selected.readOnly,true);assert.match(selected.reason,/read-only/);
 await assert.rejects(binding.edit({version:selected.version,start:0,end:0,text:'unsafe'}),/read-only/);assert.equal(document.getText(),original);
});
test('does not retain a removed owner method because another class has the same method name',()=>{
 const text=source().replace('Fish subclassOf Object transient;','Fish subclassOf Object transient;\nBird subclassOf Object transient;')+'\nBird (\njadeMethodSources\nname\n{\nname() : String;\nbegin\n return "Bird";\nend;\n}\n)';
 const {document,binding,setText}=fixture(text),selected=binding.select('Fish','name');assert.equal(selected.available,true);
 const from=text.lastIndexOf('\nname\n{',selected.start)+1,to=selected.end+1;
 setText(text.slice(0,from)+text.slice(to),[{rangeOffset:from,rangeLength:to-from,text:''}]);
 assert.match(document.getText(),/return "Bird"/);assert.equal(binding.snapshot().available,false);assert.equal(binding.snapshot().text,'');
});
test('retains owner-specific incomplete method and open comment anchors while typing',()=>{
 const first=fixture(),selected=first.binding.select('Fish','name'),text=first.document.getText();
 first.setText(text.slice(0,selected.end)+text.slice(selected.end+1),[{rangeOffset:selected.end,rangeLength:1,text:''}]);
 assert.equal(first.binding.snapshot().available,true);assert.equal(first.binding.snapshot().owner,'Fish');assert.match(first.binding.snapshot().text,/return "🐟"/);
 const second=fixture(),before=second.document.getText(),state=second.binding.select('Fish','name');second.setText('/*'+before,[{rangeOffset:0,rangeLength:0,text:'/*'}]);
 assert.equal(second.binding.snapshot().available,true);assert.equal(second.binding.snapshot().start,state.start+2);assert.match(second.binding.snapshot().text,/return "🐟"/);
});
