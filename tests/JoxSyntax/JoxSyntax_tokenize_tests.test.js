 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Registry}=require('vscode-textmate'),onig=require('vscode-oniguruma');
const manifest=require('../../extension/package.json');
async function tokenize(lines){
 await onig.loadWASM(fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer);
 const registry=new Registry({onigLib:Promise.resolve({createOnigScanner:patterns=>new onig.OnigScanner(patterns),createOnigString:text=>new onig.OnigString(text)}),loadGrammar:async scope=>{
  if(scope==='source.jade-nz')return JSON.parse(fs.readFileSync(path.join(__dirname,'../../extension/syntaxes/jade.tmLanguage.json'),'utf8'));
  if(scope==='text.xml')return process.env.JADE_XML_GRAMMAR?JSON.parse(fs.readFileSync(process.env.JADE_XML_GRAMMAR,'utf8')):{scopeName:'text.xml',patterns:[{name:'meta.tag.xml',begin:'</?[A-Za-z][\\w:.-]*',end:'>',beginCaptures:{0:{name:'entity.name.tag.xml'}},endCaptures:{0:{name:'punctuation.definition.tag.xml'}},patterns:[{begin:'\"',end:'\"'},{begin:"'",end:"'"}]}]};
  const entry=manifest.contributes.grammars.find(row=>row.scopeName===scope);return entry?JSON.parse(fs.readFileSync(path.join(__dirname,'../../extension',entry.path),'utf8')):null;
 }});
 const grammar=await registry.loadGrammar('text.xml.jade-jox');assert.ok(grammar,'JOX XML grammar is contributed');
 let state;return lines.map(line=>{const result=grammar.tokenizeLine(line,state);state=result.ruleStack;return result.tokens.map(token=>({...token,text:line.slice(token.startIndex,token.endIndex)}));});
}
test('JOX remains XML outside JadeMethod source and embeds Jade inside source text or CDATA',async()=>{
 assert.ok(manifest.contributes.languages.find(row=>row.id==='jade-jox'&&row.extensions.includes('.jox')),'raw JOX has its own language');
 const rows=await tokenize(['<Class name="Fish">','<JadeMethod name="swim">','<source>','swim();','begin',' write "bubbles";','end;','</source>','</JadeMethod>','<documentation>begin</documentation>','<JadeMethod name="test"><source><![CDATA[','begin','end;',']]></source></JadeMethod>','</Class>']);
 assert.ok(rows[0].some(t=>t.scopes.some(scope=>scope.startsWith('entity.name.tag'))));
 assert.ok(rows[4].some(t=>t.text==='begin'&&t.scopes.includes('keyword.control.jade')));
 assert.ok(rows[5].some(t=>t.scopes.includes('string.quoted.double.jade')));
 assert.ok(rows[11].some(t=>t.text==='begin'&&t.scopes.includes('keyword.control.jade')));
 assert.equal(rows[9].some(t=>t.scopes.includes('keyword.control.jade')),false);
 assert.equal(rows[14].some(t=>t.scopes.includes('source.jade-nz')),false);
});

test('only exact non-self-closing native method/source tags introduce Jade scopes',async()=>{
 const cases=[
  ['<JadeMethod-other><source>','begin','</source></JadeMethod-other>'],
  ['<JadeMethod.metadata><source>','begin','</source></JadeMethod.metadata>'],
  ['<JadeMethod:metadata><source>','begin','</source></JadeMethod:metadata>'],
  ['<JadeMethod><source-map>','begin','</source-map></JadeMethod>'],
  ['<JadeMethod><source.info>','begin','</source.info></JadeMethod>'],
  ['<JadeMethod><source:info>','begin','</source:info></JadeMethod>'],
  ['<JadeMethod/><source>','begin','</source>'],
  ['<JadeMethod name="none" />','<source>begin</source>'],
  ['<JadeMethod><source/>','begin','</JadeMethod>'],
  ['<JadeMethod><source data="x" />','begin','</JadeMethod>']
 ];
 for(const lines of cases){const rows=await tokenize(lines);assert.equal(rows.flat().some(token=>token.scopes.includes('source.jade-nz')),false,lines.join(' '));}
 const rows=await tokenize(['<JadeMethod name="test>ok"><source data="/>" >','begin','end;','</source></JadeMethod>']);
 assert.ok(rows[1].some(token=>token.text==='begin'&&token.scopes.includes('keyword.control.jade')));
});

test('multiline opening tags stay XML until their body and self-closing tags never enter Jade',async()=>{
 const lines=['<JadeMethod',' name="test">','<source',' xml:space="preserve"','>','begin','end;','</source','>','</JadeMethod','>'];
 const rows=await tokenize(lines);
 assert.ok(rows[5].some(token=>token.text==='begin'&&token.scopes.includes('keyword.control.jade')),'Multiline method/source opening tags must enter Jade body');
 assert.equal(rows.slice(0,5).flat().some(token=>token.scopes.includes('source.jade-nz')),false,'Opening attributes remain XML');
 for(const closed of [
  ['<JadeMethod',' name="empty"','/>','<source>','begin','</source>'],
  ['<JadeMethod name="test">','<source',' xml:space="preserve"','/>','begin','</JadeMethod>']
 ]){assert.equal((await tokenize(closed)).flat().some(token=>token.scopes.includes('source.jade-nz')),false,closed.join(' '));}
 const quoted=await tokenize(['<JadeMethod',' name="test/>"','>','<source',' data="first','/>','last"','>','begin','end;','</source></JadeMethod>']);
 assert.ok(quoted[8].some(token=>token.scopes.includes('keyword.control.jade')),'Quoted delimiters across lines cannot end opening state');
 assert.equal(quoted.slice(0,8).flat().some(token=>token.scopes.includes('source.jade-nz')),false);
});

test('method body XML text and child metadata cannot terminate the opening-tag state',async()=>{
 for(const note of ['note />','note / >','<metadata value="/>">text</metadata>','<metadata/>']){
  const rows=await tokenize(['<JadeMethod>'+note,'<source>','begin','end;','</source></JadeMethod>']);
  assert.ok(rows[2].some(token=>token.text==='begin'&&token.scopes.includes('keyword.control.jade')),note);
 }
});

test('installed XML grammar keeps comments and metadata CDATA opaque to Jade regions',{skip:!process.env.JADE_XML_GRAMMAR},async()=>{
 const rows=await tokenize(['<JadeMethod name="real">','<!-- </JadeMethod> <source>begin</source> -->','<metadata><![CDATA[<source>begin</source>]]></metadata>','<source>','begin','end;','</source></JadeMethod>']);
 assert.equal(rows[1].concat(rows[2]).some(token=>token.scopes.includes('source.jade-nz')),false);
 assert.ok(rows[4].some(token=>token.text==='begin'&&token.scopes.includes('keyword.control.jade')));
});

test('complete closing tags retain XML scope through same-line or later-line delimiters',async()=>{
 for(const closing of [['</source>','</JadeMethod>'],['</source',' >','</JadeMethod',' >']]){
  const rows=await tokenize(['<JadeMethod><source>','begin','end;',...closing]);
  for(const row of rows.slice(3)){
   assert.equal(row.some(token=>token.scopes.includes('source.jade-nz')),false);
   if(row.some(token=>token.text.includes('>')))assert.ok(row.some(token=>token.text.includes('>')&&token.scopes.some(scope=>scope.includes('tag')&&scope.endsWith('.xml'))),closing.join(' '));
  }
 }
});
