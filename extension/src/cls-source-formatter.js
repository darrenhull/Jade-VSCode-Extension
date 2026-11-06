'use strict';

// Native source containers deliberately keep the method label/signature at
// column zero. The method formatter owns executable body indentation.
function sourceContainerEdits(text,{code,lines},selection) {
  const edits=[],values=lines.map(line=>code.slice(line.start,line.end).trim());
  let inSources=false,pending,braces=0;
  function edit(line) {
    if(line.inside||selection&&(line.start<selection.start||line.end>selection.end||line.start>=selection.end))return;
    const leading=/^[\t ]*/.exec(text.slice(line.start,line.end))[0];
    if(leading)pending.push({start:line.start,end:line.start+leading.length,text:''});
  }
  for(let at=0;at<lines.length;at++) {
    const line=lines[at],value=values[at];if(line.inside)continue;
    if(value==='typeSources'){inSources=true;continue;}
    if(!inSources)continue;
    if(!pending&&/^[A-Za-z_]\w*\s*\($/.test(value)) {pending=[];braces=0;edit(line);continue;}
    if(!pending)continue;
    if(!braces&&/^(?:jade|external|webServices)MethodSources$/.test(value))edit(line);
    if(!braces&&value===')'){edit(line);edits.push(...pending);pending=undefined;continue;}
    for(const ch of value){if(ch==='{')braces++;else if(ch==='}')braces--;}
    if(braces<0)pending=undefined;
  }
  return edits;
}
module.exports={sourceContainerEdits};
