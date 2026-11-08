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
