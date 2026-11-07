'use strict';

// Native source containers deliberately keep the method label/signature at
// column zero. The method formatter owns executable body indentation.
function sourceContainerEdits(text,{code,lines,contexts},selection) {
  const edits=[],values=lines.map(line=>code.slice(line.start,line.end).trim()),next=[];
  let following=lines.length;
  for(let at=lines.length-1;at>=0;at--){next[at]=following;if(values[at]&&!lines[at].inside)following=at;}
  let inHeader=true,inSources=false,pending;
  function edit(line,destination=pending) {
    if(line.inside||selection&&(line.start<selection.start||line.end>selection.end||line.start>=selection.end))return;
    const bom=line.start===0&&text[0]==='\uFEFF'?1:0;
    const leading=/^[\t ]*/.exec(text.slice(line.start+bom,line.end))[0];
    if(leading)destination.push({start:line.start+bom,end:line.start+bom+leading.length,text:''});
  }
  for(let at=0;at<lines.length;at++) {
    const line=lines[at],value=values[at],context=contexts[at],top=context.parentheses===0&&context.braces===0;if(line.inside)continue;
    if(inHeader&&value) {
      if(/^\uFEFF?[\t ]*jade(?:VersionNumber|PatchRelease)\s+(?:["']|\d)/.test(text.slice(line.start,line.end))) {edit(line,edits);continue;}
      inHeader=false;
    }
    if(top&&value==='typeSources'){edit(line,edits);inSources=true;continue;}
    if(!inSources)continue;
    if(!pending&&top&&/^[A-Za-z_]\w*\s*\($/.test(value)&&/^(?:jade|external|webServices)MethodSources$/.test(values[next[at]])) {pending=[];edit(line);continue;}
    if(!pending)continue;
    if(context.parentheses!==1)continue;
    if(context.braces===1&&value==='}'){edit(line);continue;}
    if(context.braces!==0)continue;
    if(/^(?:jade|external|webServices)MethodSources$/.test(value)&&values[next[at]]!=='{')edit(line);
    else if(/^[A-Za-z_]\w*$/.test(value)&&values[next[at]]==='{')edit(line);
    else if(value==='{')edit(line);
    else if(value===')'){edit(line);edits.push(...pending);pending=undefined;}
  }
  return edits;
}
module.exports={sourceContainerEdits};
