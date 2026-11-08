'use strict';
const {parseSource}=require('./source_symbols');
const {topLevelMatches}=require('./source-context');

// A deliberately narrow, lossless partition of native class sections. The
// lexer masks literals/comments; every retained declaration is copied verbatim.
function splitClassSource(text){
 const model=parseSource(text),code=model.code;
 if(model.classes.length<2)return [];
 if(new Set(model.classes.map(c=>c.name.toLowerCase())).size!==model.classes.length)throw Error('Duplicate class declarations cannot be split.');
 const markers=topLevelMatches(code,/^[\t ]*([A-Za-z_]\w*)[\t ]*\r?$/gm);
 const sections=new Map(),allowed=new Set(['schemaDefinition','typeHeaders','typeDefinitions','databaseDefinitions','typeSources']);
 for(const marker of markers){
  const name=marker[1];if(!allowed.has(name)&&/^\s*\(/.test(code.slice(marker.index+marker[0].length)))continue;if(!allowed.has(name))throw Error('Unsupported schema-level section: '+name);
  if(sections.has(name))throw Error('Repeated native section: '+name);sections.set(name,{start:marker.index,body:marker.index+marker[0].length});
 }
 const ordered=[...sections.entries()];
 if(ordered.map(([name])=>name).join(',')!==['schemaDefinition','typeHeaders','typeDefinitions',...(sections.has('databaseDefinitions')?['databaseDefinitions']:[]),'typeSources'].join(','))throw Error('Unsupported native section order.');
 for(let i=0;i<ordered.length;i++)ordered[i][1].end=ordered[i+1]?.[1].start??text.length;
 for(const name of ['schemaDefinition','typeHeaders','typeDefinitions','typeSources'])if(!sections.has(name))throw Error('Missing native section: '+name);
 if(!model.schema||!/^\s*\w+\s+subschemaOf\s+\w+\s+partialDefinition\b[^;]*;/m.test(code.slice(sections.get('schemaDefinition').body,sections.get('schemaDefinition').end)))throw Error('Only a partial schema class extract can be split.');
 const header=sections.get('typeHeaders'),definitions=sections.get('typeDefinitions'),sources=sections.get('typeSources');
 const names=model.classes.map(c=>c.name),headers=new Map(),defs=new Map(),bodies=new Map(),prefixes=new Map();
 function partition(section,pattern,target,kind){
  const block=code.slice(section.body,section.end),matches=topLevelMatches(block,pattern);
  prefixes.set(kind,text.slice(section.body,section.body+(matches[0]?.index??block.length)));
  if(block.slice(0,matches[0]?.index??block.length).trim())throw Error('Unsupported '+kind+' preamble.');
  for(let i=0;i<matches.length;i++){
   const match=matches[i],name=match[1];if(!names.includes(name)||target.has(name))throw Error('Unmatched or duplicate '+kind+' declaration: '+name);
   target.set(name,text.slice(section.body+match.index,section.body+(matches[i+1]?.index??block.length)));
  }
 }
 partition(header,/^[\t ]*([A-Za-z_]\w*)\s+subclassOf\b[^;]*;/gm,headers,'header');
 partition(definitions,/^[\t ]*([A-Za-z_]\w*)\s+completeDefinition[\t ]*\r?$/gm,defs,'complete definition');
 partition(sources,/^[\t ]*([A-Za-z_]\w*)[\t ]*\([\t ]*\r?$/gm,bodies,'source');
 for(const name of names)if(!headers.has(name)||!defs.has(name))throw Error('Each class needs a matching header and complete definition.');
 // Reject incomplete containers rather than trusting symbol-region heuristics.
 for(const value of [...defs.values(),...bodies.values()]){
  const masked=parseSource(value).code;let parentheses=0,braces=0;
  for(const ch of masked){if(ch==='(')parentheses++;if(ch===')')parentheses--;if(ch==='{')braces++;if(ch==='}')braces--;if(parentheses<0||braces<0)throw Error('Unbalanced native class definition.');}
  if(parentheses||braces)throw Error('Unbalanced native class definition.');
 }
 let maps=new Map(),dbPrefix='',dbSuffix='';
 const database=sections.get('databaseDefinitions');
 if(database){
  const raw=text.slice(database.body,database.end),masked=code.slice(database.body,database.end);
  if(masked.trim()){
   const container=/^\s*\w+\s*\(\s*classMapDefinitions\s*\r?\n/.exec(masked);
   if(!container)throw Error('Unsupported database definitions; only plain class mappings can be split.');
   const close=/\)[\t \r\n]*$/.exec(masked);if(!close)throw Error('Unbalanced database definitions.');
   dbPrefix=raw.slice(0,container[0].length);dbSuffix=raw.slice(close.index);
   const content=masked.slice(container[0].length,close.index),rows=[...content.matchAll(/^[\t ]*([A-Za-z_]\w*)[\t ]+in\b[^;]*;[\t ]*(?:\r?\n|$)/gm)];
   let consumed='',previous=0;for(const row of rows){if(!names.includes(row[1])||maps.has(row[1]))throw Error('Unmatched database class map.');maps.set(row[1],raw.slice(container[0].length+previous,container[0].length+row.index+row[0].length));previous=row.index+row[0].length;consumed+=row[0];}
   dbSuffix=raw.slice(container[0].length+previous);
   if(consumed.replace(/\s/g,'')!==content.replace(/\s/g,''))throw Error('Unsupported database class-map metadata.');
  }
 }
 const preamble=text.slice(0,header.start),marker=name=>text.slice(sections.get(name).start,sections.get(name).body);
 return names.map(name=>({name,text:preamble+marker('typeHeaders')+prefixes.get('header')+headers.get(name)+marker('typeDefinitions')+prefixes.get('complete definition')+defs.get(name)+(database?marker('databaseDefinitions')+(dbPrefix?dbPrefix+(maps.get(name)||'')+dbSuffix:text.slice(database.body,database.end)):'')+marker('typeSources')+prefixes.get('source')+(bodies.get(name)||'')}));
}
module.exports={splitClassSource};
