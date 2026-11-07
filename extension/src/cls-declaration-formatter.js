'use strict';

// Native section/group labels remain aligned with their owner; declarations
// are one level deeper. This is whitespace layout, not a second Jade parser.
const boundaries=new Set(['schemaDefinition','constantDefinitions','localeDefinitions','localeFormatDefinitions','libraryDefinitions','externalFunctionDefinitions','translatableStringDefinitions','typeHeaders','interfaceDefs','membershipDefinitions','typeDefinitions','externalKeyDefinitions','memberKeyDefinitions','inverseDefinitions','databaseDefinitions','schemaViewDefinitions','exportedPackageDefinitions','importedPackageDefinitions','_exposedListDefinitions','exposedListDefinitions','typeSources','externalFunctionSources']);
const blocks=new Set(['typeDefinitions','externalKeyDefinitions','memberKeyDefinitions','databaseDefinitions','translatableStringDefinitions','schemaViewDefinitions','exportedPackageDefinitions','importedPackageDefinitions','_exposedListDefinitions','exposedListDefinitions']);
const labels=new Set(['constantDefinitions','attributeDefinitions','referenceDefinitions','jadeMethodDefinitions','externalMethodDefinitions','databaseFileDefinitions','classMapDefinitions','dbServerDefinitions','interfaceDefinitions','exportedClassDefinitions','exportedInterfaceDefinitions','exportedPropertyDefinitions','exportedMethodDefinitions','exportedConstantDefinitions','importedClassDefinitions','importedInterfaceDefinitions','_exposedConstantDefinitions','_exposedMethodDefinitions','_exposedPropertyDefinitions','webServicesClassProperties','webServicesMethodDefinitions','webServicesMethodProperties','methodImplementations','eventMethodMappings','_remapTableDefinitions']);

function declarationEdits(text,{code,lines,contexts},{unit,size,columns,indent},selection) {
  const edits=[],sections=[],values=lines.map(line=>code.slice(line.start,line.end).trim()),next=[];
  let following=lines.length;
  for(let at=lines.length-1;at>=0;at--){next[at]=following;if(values[at]&&!lines[at].inside)following=at;}
  const leading=line=>/^[\t ]*/.exec(text.slice(line.start,line.end))[0];
  const anchorColumns=(line,formatted)=>selection&&(line.start<selection.start||line.end>selection.end||line.start>=selection.end)?columns(leading(line)):formatted;
  function edit(line,depth,pending,continuation) {
    const raw=text.slice(line.start,line.end);if(line.inside||!raw.trim())return;
    if(selection&&(line.start<selection.start||line.end>selection.end||line.start>=selection.end))return;
    const existing=leading(line),desired=continuation?indent(Math.max(0,continuation.formatted+Math.max(continuation.minimum??-Infinity,columns(existing)-continuation.original))):unit.repeat(depth);
    if(existing!==desired)pending.push({start:line.start,end:line.start+existing.length,text:desired});
  }
  for(let at=0;at<lines.length;at++) {
    const name=values[at];
    if(!lines[at].inside&&boundaries.has(name)&&contexts[at].parentheses===0&&contexts[at].braces===0) {
      sections.push({name,start:at});if(name.endsWith('Sources'))break;
    }
  }
  for(let sectionAt=0;sectionAt<sections.length;sectionAt++) {
    const section=sections[sectionAt],end=sections[sectionAt+1]?.start??lines.length;
    if(section.name.endsWith('Sources'))continue;
    if(!blocks.has(section.name)) {
      let pending=[],continuation,level=1,balance=0;
      for(let at=section.start+1;at<end;at++) {
        const line=lines[at],current=values[at],raw=text.slice(line.start,line.end);
        if(!raw.trim())continue;
        if(!continuation&&balance===0&&/^categoryDefinition\b/.test(current)){level=2;edit(line,1,pending);continue;}
        const depth=section.name==='schemaDefinition'&&/^[A-Za-z_]\w*\s+subschemaOf\b/.test(current)?0:level;
        edit(line,depth,pending,continuation);
        if(!current)continue;
        for(const ch of current){if(ch==='(')balance++;else if(ch===')')balance--;}
        if(balance<0){pending=[];break;}
        if(!continuation&&(balance>0||/[,=]\s*$/.test(current)))continuation={original:columns(leading(line)),formatted:anchorColumns(line,depth*size),minimum:size};
        if(balance===0&&/;\s*$/.test(current))continuation=undefined;
      }
      if(!balance){edit(lines[section.start],0,pending);edits.push(...pending);}
      continue;
    }
    let state='owner',parentheses=0,pending=[],valid=true,any=false,continuation,ownerDepth=1;
    const frames=[];
    for(let at=section.start+1;at<end;at++) {
      const line=lines[at],current=values[at];
      if(!current) {
        if(state==='body'&&!line.inside&&text.slice(line.start,line.end).trim())edit(line,frames.at(-1)+1,pending,continuation);
        continue;
      }
      if(state==='owner') {
        const owner=section.name==='typeDefinitions'||section.name.endsWith('KeyDefinitions')?/^[A-Za-z_]\w*\s+(?:completeDefinition|partialDefinition)$/:/^[A-Za-z_0-9][^;()]*$/;
        if(!owner.test(current)){valid=false;break;}
        edit(line,1,pending);ownerDepth=1;state='open';
      } else if(state==='open') {
        if(current!=='('){valid=false;break;}
        edit(line,ownerDepth,pending);frames.push(ownerDepth);parentheses++;state='body';
      } else if(current===')'&&parentheses===frames.length) {
        edit(line,frames.pop(),pending);parentheses--;continuation=undefined;
        if(!frames.length){edits.push(...pending);pending=[];state='owner';any=true;}
      } else {
        const depth=frames.at(-1),boundary=!continuation&&parentheses===frames.length,label=boundary&&labels.has(current);
        if(boundary&&/^[A-Za-z_]\w*Definitions$/.test(current)&&!label){valid=false;break;}
        if(!continuation&&values[next[at]]==='('&&/^[A-Za-z_]\w*(?:\s+(?:completeDefinition|partialDefinition))?$/.test(current)) {
          ownerDepth=depth+1;edit(line,ownerDepth,pending);state='open';continue;
        }
        edit(line,label||/^defaultFileDefinition\b/.test(current)?depth:depth+1,pending,continuation);
        if(!continuation&&/^[A-Za-z_]\w*\s*[:(]/.test(current)&&!/;\s*$/.test(current))continuation={original:columns(leading(line)),formatted:anchorColumns(line,(depth+1)*size)};
        for(const ch of current){if(ch==='(')parentheses++;else if(ch===')')parentheses--;}
        if(parentheses<frames.length){valid=false;break;}
        if(parentheses===frames.length&&/;\s*$/.test(current))continuation=undefined;
      }
    }
    // Never return pending changes to an incomplete/unknown owner. Completed
    // independent sibling owners are safe to format even while one is edited.
    if(valid&&state==='owner'&&any)edit(lines[section.start],0,edits);
  }
  return edits.sort((a,b)=>a.start-b.start);
}
module.exports={declarationEdits};
