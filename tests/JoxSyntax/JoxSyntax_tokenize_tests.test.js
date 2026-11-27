 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Registry}=require('vscode-textmate'),onig=require('vscode-oniguruma');
const manifest=require('../../extension/package.json');
async function tokenize(lines){
 await onig.loadWASM(fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer);
 const registry=new Registry({onigLib:Promise.resolve({createOnigScanner:patterns=>new onig.OnigScanner(patterns),createOnigString:text=>new onig.OnigString(text)}),loadGrammar:async scope=>{
  if(scope==='source.jade-nz')return JSON.parse(fs.readFileSync(path.join(__dirname,'../../extension/syntaxes/jade.tmLanguage.json'),'utf8'));
  if(scope==='text.xml')return{scopeName:'text.xml',patterns:[{name:'entity.name.tag.xml',match:'</?[A-Za-z][^>]*>'}]};
  const entry=manifest.contributes.grammars.find(row=>row.scopeName===scope);return entry?JSON.parse(fs.readFileSync(path.join(__dirname,'../../extension',entry.path),'utf8')):null;
 }});
 const grammar=await registry.loadGrammar('text.xml.jade-jox');assert.ok(grammar,'JOX XML grammar is contributed');
 let state;return lines.map(line=>{const result=grammar.tokenizeLine(line,state);state=result.ruleStack;return result.tokens.map(token=>({...token,text:line.slice(token.startIndex,token.endIndex)}));});
}
test('JOX remains XML outside JadeMethod source and embeds Jade inside source text or CDATA',async()=>{
 assert.ok(manifest.contributes.languages.find(row=>row.id==='jade-jox'&&row.extensions.includes('.jox')),'raw JOX has its own language');
 const rows=await tokenize(['<Class name="Fish">','<JadeMethod name="swim">','<source>','swim();','begin',' write "bubbles";','end;','</source>','</JadeMethod>','<documentation>begin</documentation>','<JadeMethod name="test"><source><![CDATA[','begin','end;',']]></source></JadeMethod>','</Class>']);
 assert.ok(rows[0].some(t=>t.scopes.includes('entity.name.tag.xml')));
 assert.ok(rows[4].some(t=>t.text==='begin'&&t.scopes.includes('keyword.control.jade')));
 assert.ok(rows[5].some(t=>t.scopes.includes('string.quoted.double.jade')));
 assert.ok(rows[11].some(t=>t.text==='begin'&&t.scopes.includes('keyword.control.jade')));
 assert.equal(rows[9].some(t=>t.scopes.includes('keyword.control.jade')),false);
 assert.equal(rows[14].some(t=>t.scopes.includes('source.jade-nz')),false);
});
