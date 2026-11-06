'use strict';
const {lexSource}=require('./source-lex');
const {parseSource}=require('./source_symbols');

// This formatter changes indentation only. It deliberately leaves native
// declarations/metadata and ambiguous or incomplete method structures alone.
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
      .map(member=>({start:signatureEnd(code,member.bodyStart,member.end-1),end:member.end-1}))
      .filter(method=>method.start!==undefined);
  }
  if(uri&&!/\.jade$/i.test(uri))return [];
  const start=signatureEnd(code,0,code.length);
  return start!==undefined?[{start,end:text.length}]:[];
}
function linesOf(text) {
  const lines=[];let start=0;
  while(start<text.length) {
    const newline=text.indexOf('\n',start),next=newline<0?text.length:newline+1;
    const end=newline<0?text.length:newline-(text[newline-1]==='\r'?1:0);
    lines.push({start,end,next});start=next;
  }
  return lines;
}
function formattingEdits(text,options={},selection,uri='') {
  const {code,excluded}=lexSource(text),lines=linesOf(text),edits=[];
  const unit=options.insertSpaces===false?'\t':' '.repeat(Math.max(1,Math.min(16,Number(options.tabSize)||4)));
  for(const method of methodRanges(text,uri,code)) {
    const pending=[],stack=[];let begun=false,finished=false,declarations=false,valid=true;
    if(excluded.some(range=>!range.closed&&range.kind!=='comment'&&range.start>=method.start&&range.start<method.end))continue;
    for(const line of lines) {
      if(line.start<method.start||line.end>method.end)continue;
      const raw=text.slice(line.start,line.end),value=code.slice(line.start,line.end).trim();
      const inside=excluded.some(range=>range.start<line.start&&line.start<range.end);
      if(inside)continue; // Multiline literal/comment contents are byte-preserved.
      if(finished) {if(value)valid=false;continue;}
      let depth=stack.length||(declarations?1:0);
      if(/^(?:constants|vars)$/i.test(value)) {
        if(begun){valid=false;break;}declarations=true;depth=0;
      } else if(/^begin$/i.test(value)) {
        if(begun){valid=false;break;}begun=true;declarations=false;depth=0;stack.push('begin');
      } else if(/^epilog$/i.test(value)) {
        if(stack.length!==1||stack[0]!=='begin'){valid=false;break;}depth=0;
      } else if(/^end\s*;$/i.test(value)) {
        if(stack.length!==1||stack[0]!=='begin'){valid=false;break;}stack.pop();depth=0;finished=true;
      } else if(/^(?:endif|endwhile|endforeach|endfor)\b/i.test(value)) {
        const match=/^(endif|endwhile|endforeach|endfor)\s*;$/i.exec(value);
        const expected={endif:'if',endwhile:'while',endforeach:'foreach',endfor:'for'};
        if(!match||stack.pop()!==expected[match[1].toLowerCase()]){valid=false;break;}depth=stack.length;
      } else if(/^(?:else|elseif)\b/i.test(value)) {
        if(stack.at(-1)!=='if'||!(/^(?:else|elseif\b[\s\S]*\bthen)$/i.test(value))){valid=false;break;}
        depth=stack.length-1;
      } else if(/^(?:if|while|foreach|for)\b/i.test(value)) {
        const match=/^(if|while|foreach|for)\b[\s\S]*\b(then|do)$/i.exec(value);
        if(!begun||!match||(match[1].toLowerCase()==='if')!==(match[2].toLowerCase()==='then')){valid=false;break;}
        stack.push(match[1].toLowerCase());
      } else if(/^(?:switch|case|select|try|catch|finally|repeat|until|rescue|prolog|end\w*)\b/i.test(value)) {
        valid=false;break;
      }
      if(!raw.trim())continue;
      // A selection never reaches outside its complete selected lines. An
      // end position at column zero excludes that following line naturally.
      if(selection&&(line.start<selection.start||line.end>selection.end||line.start>=selection.end))continue;
      const leading=/^[\t ]*/.exec(raw)[0];
      const indentation=unit.repeat(depth);
      if(leading!==indentation)pending.push({start:line.start,end:line.start+leading.length,text:indentation});
    }
    if(valid&&begun&&finished&&!stack.length)edits.push(...pending);
  }
  return edits;
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
