'use strict';
// Input is lexer-masked code: punctuation in literals/comments is already blank.
// A monotone scan keeps symbol boundaries and formatter containers consistent.
function contextScanner(code) {
  let offset=0,parentheses=0,braces=0;
  return end=>{
    for(;offset<end;offset++) {
      const ch=code[offset];
      if(ch==='(')parentheses++;else if(ch===')')parentheses--;
      else if(ch==='{')braces++;else if(ch==='}')braces--;
    }
    return {parentheses,braces};
  };
}
function lineContexts(code,lines) {
  const contextAt=contextScanner(code);
  return lines.map(line=>contextAt(line.start));
}
function topLevelMatches(code,pattern) {
  const contextAt=contextScanner(code),matches=[];
  for(const match of code.matchAll(pattern)) {
    const context=contextAt(match.index);
    if(context.parentheses===0&&context.braces===0)matches.push(match);
  }
  return matches;
}
module.exports={lineContexts,topLevelMatches};
