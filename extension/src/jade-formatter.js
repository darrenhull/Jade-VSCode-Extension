'use strict';
const {lexSource}=require('./source-lex');
const {parseSource}=require('./source_symbols');
const {declarationEdits}=require('./cls-declaration-formatter');
const {sourceContainerEdits}=require('./cls-source-formatter');

// Formatting changes indentation only; native tokens, literals and ambiguous
// or incomplete structures are preserved.
function signatureEnd(code,start,end) {
  const prefix=/^\s*[A-Za-z_]\w*\s*\(/.exec(code.slice(start,end));
  if(!prefix)return;
  let position=start+prefix[0].length,depth=1;
  for(;position<end&&depth;position++) {
    if(code[position]==='(')depth++;
    else if(code[position]===')')depth--;
  }
  if(depth)return;
  const semicolon=code.indexOf(';',position);
  return semicolon>=position&&semicolon<end?semicolon+1:undefined;
}
function methodRanges(text,uri,code) {
  if(/\.cls$/i.test(uri)) {
    return parseSource(text,uri).classes.flatMap(cls=>cls.members)
      .filter(member=>member.kind==='method'&&!member.declaration&&code[member.end-1]==='}')
      .map(member=>({start:signatureEnd(code,member.bodyStart,member.end-1),end:member.end-1,label:member.start,signatureStart:member.bodyStart}))
      .filter(method=>method.start!==undefined);
  }
  if(uri&&!/\.jade$/i.test(uri))return [];
  const start=signatureEnd(code,0,code.length);
  return start!==undefined?[{start,end:text.length,signatureStart:0}]:[];
}
function firstAt(items,offset) {
  let low=0,high=items.length;
  while(low<high){const middle=(low+high)>>>1;if(items[middle].start<offset)low=middle+1;else high=middle;}
  return low;
}
function linesOf(text,excluded) {
  const lines=[];let start=0,trivia=0;
  while(start<text.length) {
    const newline=text.indexOf('\n',start),next=newline<0?text.length:newline+1;
    const end=newline<0?text.length:newline-(text[newline-1]==='\r'?1:0);
    while(trivia<excluded.length&&excluded[trivia].end<=start)trivia++;
    const inside=excluded[trivia]?.start<start&&start<excluded[trivia].end;
    lines.push({start,end,inside});start=next;
  }
  return lines;
}
function formattingEdits(text,options={},selection,uri='') {
  const {code,excluded}=lexSource(text),lines=linesOf(text,excluded),edits=[];
  const size=Math.max(1,Math.min(16,Number(options.tabSize)||4)),spaces=options.insertSpaces!==false;
  const unit=spaces?' '.repeat(size):'\t',unclosed=excluded.filter(range=>!range.closed&&range.kind!=='comment');
  const columns=leading=>{let width=0;for(const ch of leading)width=ch==='\t'?width+size-width%size:width+1;return width;};
  const indent=width=>spaces?' '.repeat(width):'\t'.repeat(Math.floor(width/size))+' '.repeat(width%size);
  function prefixEdit(line,desired,pending) {
    if(line.inside||!text.slice(line.start,line.end).trim())return;
    if(selection&&(line.start<selection.start||line.end>selection.end||line.start>=selection.end))return;
    const leading=/^[\t ]*/.exec(text.slice(line.start,line.end))[0];
    if(leading!==desired)pending.push({start:line.start,end:line.start+leading.length,text:desired});
  }
  for(const method of methodRanges(text,uri,code)) {
    const pending=[],stack=[];let begun=false,finished=false,declarations=false,valid=true;
    let anchor,balance=0;
    const incomplete=unclosed[firstAt(unclosed,method.start)];
    if(incomplete&&incomplete.start<method.end)continue;
    let signatureAnchor;
    for(let at=Math.max(0,firstAt(lines,method.label??method.signatureStart)-1);at<lines.length&&lines[at].start<method.start;at++) {
      const line=lines[at];if(line.end<(method.label??method.signatureStart)||line.inside)continue;
      const value=code.slice(line.start,line.end).trim(),leading=/^[\t ]*/.exec(text.slice(line.start,line.end))[0];
      if(line.start>=method.signatureStart&&value&&signatureAnchor===undefined)signatureAnchor=columns(leading);
      prefixEdit(line,signatureAnchor===undefined?'':indent(Math.max(0,columns(leading)-signatureAnchor)),pending);
    }
    function expression(value,leading,depth) {
      if(!value)return;
      for(const ch of value){if(ch==='('||ch==='[')balance++;else if(ch===')'||ch===']')balance--;if(balance<0){valid=false;return;}}
      if(balance||!/;\s*$/.test(value))anchor??={original:columns(leading),formatted:depth*size};
      else anchor=undefined;
    }
    for(let at=firstAt(lines,method.start);at<lines.length&&lines[at].start<method.end;at++) {
      const line=lines[at];if(line.end>method.end)continue;
      const raw=text.slice(line.start,line.end),value=code.slice(line.start,line.end).trim();
      const leading=/^[\t ]*/.exec(raw)[0],continued=anchor;
      if(line.inside){expression(value,leading,stack.length);continue;} // Preserve literal/comment bytes, but observe an exposed closing semicolon.
      if(finished) {if(value)valid=false;continue;}
      let depth=stack.length||(declarations?1:0),control=false;
      if(!continued) {
      if(/^(?:constants|vars)$/i.test(value)) {
        control=true;
        if(begun){valid=false;break;}declarations=true;depth=0;
      } else if(/^begin$/i.test(value)) {
        control=true;
        if(begun){valid=false;break;}begun=true;declarations=false;depth=0;stack.push('begin');
      } else if(/^epilog$/i.test(value)) {
        control=true;
        if(stack.length!==1||stack[0]!=='begin'){valid=false;break;}depth=0;
      } else if(/^end\s*;$/i.test(value)) {
        control=true;
        if(stack.length!==1||stack[0]!=='begin'){valid=false;break;}stack.pop();depth=0;finished=true;
      } else if(/^switch\b/i.test(value)) {
        control=true;
        if(!begun||!/^switch\b[\s\S]*\bdo$/i.test(value)){valid=false;break;}
        stack.push('switch');
      } else if(/^(?:case\b|default\s*:)/i.test(value)) {
        control=true;
        if(stack.at(-1)==='case')stack.pop();
        if(stack.at(-1)!=='switch'||!/^(?:case\b[^:]*|default\s*):/i.test(value)){valid=false;break;}
        depth=stack.length;stack.push('case');
      } else if(/^endswitch\b/i.test(value)) {
        control=true;
        if(stack.at(-1)==='case')stack.pop();
        if(!/^endswitch\s*;$/i.test(value)||stack.pop()!=='switch'){valid=false;break;}depth=stack.length;
      } else if(/^(?:beginLoad|beginLock|executeWhen)\b/i.test(value)) {
        control=true;
        const match=/^(beginLoad|beginLock)\s*;$/i.exec(value)||/^(executeWhen)\s+(?:not\s+)?[A-Za-z_]\w*\s*;$/i.exec(value);
        if(!begun||!match){valid=false;break;}stack.push(match[1].toLowerCase());
      } else if(/^(?:endif|endwhile|endforeach|endfor|endLoad|endLock|endExecuteWhen)\b/i.test(value)) {
        control=true;
        const match=/^(endif|endwhile|endforeach|endfor|endLoad|endLock|endExecuteWhen)\s*;$/i.exec(value);
        const expected={endif:'if',endwhile:'while',endforeach:'foreach',endfor:'for',endload:'beginload',endlock:'beginlock',endexecutewhen:'executewhen'};
        if(!match||stack.pop()!==expected[match[1].toLowerCase()]){valid=false;break;}depth=stack.length;
      } else if(/^(?:else|elseif)\b/i.test(value)) {
        control=true;
        if(stack.at(-1)!=='if'||!(/^(?:else|elseif\b[\s\S]*\bthen)$/i.test(value))){valid=false;break;}
        depth=stack.length-1;
      } else if(/^(?:if|while|foreach|for)\b/i.test(value)) {
        control=true;
        const match=/^(if|while|foreach|for)\b[\s\S]*\b(then|do)$/i.exec(value);
        if(!begun||!match||(match[1].toLowerCase()==='if')!==(match[2].toLowerCase()==='then')){valid=false;break;}
        stack.push(match[1].toLowerCase());
      } else if(/^(?:select|try|catch|finally|repeat|until|rescue|prolog|end\w*)\b/i.test(value)) {
        valid=false;break;
      }
      }
      if(!control)expression(value,leading,depth);
      if(!valid)break;
      if(!raw.trim())continue;
      // A selection never reaches outside its complete selected lines. An
      // end position at column zero excludes that following line naturally.
      if(selection&&(line.start<selection.start||line.end>selection.end||line.start>=selection.end))continue;
      const indentation=continued?indent(Math.max(0,continued.formatted+columns(leading)-continued.original)):unit.repeat(depth);
      if(leading!==indentation)pending.push({start:line.start,end:line.start+leading.length,text:indentation});
    }
    if(valid&&begun&&finished&&!stack.length) {
      if(method.label!==undefined)prefixEdit(lines[firstAt(lines,method.end+1)-1],'',pending);
      edits.push(...pending);
    }
  }
  if(/\.cls$/i.test(uri)) {
    edits.push(...declarationEdits(text,{code,lines},{unit,size,columns,indent},selection));
    edits.push(...sourceContainerEdits(text,{code,lines},selection));
  }
  return edits.sort((a,b)=>a.start-b.start);
}

function registerFormatting(vscode,context,selector) {
  const edits=(document,options,range,token)=> {
    if(token?.isCancellationRequested)return [];
    const selection=range?{start:document.offsetAt(range.start),end:document.offsetAt(range.end)}:undefined;
    return formattingEdits(document.getText(),options,selection,document.uri.scheme==='untitled'?'method.jade':document.uri.fsPath)
      .map(edit=>vscode.TextEdit.replace(new vscode.Range(document.positionAt(edit.start),document.positionAt(edit.end)),edit.text));
  };
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(selector,{provideDocumentFormattingEdits:(document,options,token)=>edits(document,options,undefined,token)}),
    vscode.languages.registerDocumentRangeFormattingEditProvider(selector,{provideDocumentRangeFormattingEdits:(document,range,options,token)=>edits(document,options,range,token)})
  );
}
module.exports={formattingEdits,registerFormatting};
