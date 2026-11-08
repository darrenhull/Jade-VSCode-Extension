'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {splitClassSource}=require('../../extension/src/class-source-splitter');
const {source}=require('../fixtures/class-source-split.cjs');
test('splits raw native class slices, literal text, mapping and CRLF without rewriting metadata',()=>{
 const parts=splitClassSource(source);assert.deepEqual(parts.map(p=>p.name),['Fish','Bird']);
 assert.match(parts[0].text,/name: String\[50\];/);assert.doesNotMatch(parts[0].text,/Bird subclassOf|Bird in/);
 assert.match(parts[1].text,/write "Fish completeDefinition \(\)";/);assert.match(parts[1].text,/Bird in "pets";/);assert.doesNotMatch(parts[1].text,/Fish in/);
 for(const part of parts)assert.equal(part.text.replace(/\r\n/g,'').includes('\n'),false);
});
test('refuses unsupported schema-level definitions instead of dropping them',()=>assert.throws(()=>splitClassSource(source.replace('typeHeaders','localeDefinitions\r\n en_US;\r\ntypeHeaders')),/Unsupported/));
test('refuses partial or malformed class definitions',()=>{assert.throws(()=>splitClassSource(source.replace('Bird completeDefinition','Bird partialDefinition')),/complete/);assert.throws(()=>splitClassSource(source.replace(' Bird subclassOf Object;','')),/header|declaration/i);});
test('refuses database file definitions instead of duplicating schema metadata',()=>assert.throws(()=>splitClassSource(source.replace(' classMapDefinitions',' databaseFileDefinitions\r\n "pets";\r\n classMapDefinitions')),/database/i));


test('rejects case-insensitive names and retains comments without changing literal newlines',()=>{
 assert.throws(()=>splitClassSource(source.replaceAll('Bird','fish')),/Duplicate/);
 const input=source.replace('typeHeaders\r\n','typeHeaders\r\n// shared header comment\r\n').replace('typeSources\r\n','typeSources\r\n// source comment\r\n');
 for(const part of splitClassSource(input)){assert.match(part.text,/shared header comment/);assert.match(part.text,/source comment/);}
});
test('refuses unsupported source owner and broken method body',()=>{
 assert.throws(()=>splitClassSource(source.replace('Bird (','Other (')),/Unmatched/);
 assert.throws(()=>splitClassSource(source.replace('end;\r\n}','end;\r\n')),/Unbalanced/);
});

for(const eol of ['\n','\r\n'])for(const [section,declaration] of [['header',' Fish subclassOf Object;'],['definition',' Fish completeDefinition'],['source','Bird ('],['mapping',' Fish in "pets";']]){
 test('refuses '+section+' slices crossing a multiline comment closing beside declaration ('+JSON.stringify(eol)+')',()=>{
  const input=source.replace(declaration,'/* retained native comment\r\n*/'+declaration).replaceAll('\r\n',eol);
  assert.throws(()=>splitClassSource(input),/comment|literal.*boundary/i);
 });
}
for(const eol of ['\n','\r\n'])test('preserves complete multiline comments at safe native class boundaries ('+JSON.stringify(eol)+')',()=>{
 const input=source.replace(' Fish subclassOf Object;','/* header comment\r\n*/\r\n Fish subclassOf Object;').replace(' Fish completeDefinition','/* declaration comment\r\n*/\r\n Fish completeDefinition').replace('Bird (','/* methods comment\r\n*/\r\nBird (').replace(' Bird in "pets";','/* map comment\r\n*/\r\n Bird in "pets";').replaceAll('\r\n',eol);
 const {parseSource}=require('../../extension/src/source_symbols');
 for(const part of splitClassSource(input)){const parsed=parseSource(part.text);assert.deepEqual(parsed.classes.map(cls=>cls.name),[part.name]);assert.equal(parsed.excluded.some(range=>range.kind==='comment'&&part.text.slice(range.start,range.start+2)==='/*'&&!range.closed),false);assert.ok(part.text.includes('/* header comment'+eol+'*/'));assert.ok(part.text.includes('/* declaration comment'+eol+'*/'));assert.ok(part.text.includes('/* methods comment'+eol+'*/'));}
});

for(const eol of ['\n','\r\n'])test('refuses boundaries before a later class or section marker ('+JSON.stringify(eol)+')',()=>{
 for(const declaration of [' Bird subclassOf Object;',' Bird completeDefinition','typeHeaders']){
  const input=source.replace(declaration,'/* comment retained whole\r\n*/'+declaration).replaceAll('\r\n',eol);
  assert.throws(()=>splitClassSource(input),/comment or literal at a class boundary/);
 }
});
for(const eol of ['\n','\r\n'])test('copies a later class mapping comment whole when no partition boundary crosses it ('+JSON.stringify(eol)+')',()=>{
 const input=source.replace(' Bird in "pets";','/* map metadata\r\n*/ Bird in "pets";').replaceAll('\r\n',eol);
 const {parseSource}=require('../../extension/src/source_symbols');
 for(const part of splitClassSource(input)){const parsed=parseSource(part.text);assert.deepEqual(parsed.classes.map(cls=>cls.name),[part.name]);assert.equal(parsed.excluded.some(range=>range.kind==='comment'&&part.text.slice(range.start,range.start+2)==='/*'&&!range.closed),false);}
 assert.ok(splitClassSource(input).find(part=>part.name==='Bird').text.includes('/* map metadata'+eol+'*/ Bird in "pets";'));
});
