'use strict';
// CodeMirror positions use LF separators; VS Code positions address the original
// UTF16 source, where CRLF occupies two units. Never normalize the actual file.
function normalized(text){return text.replace(/\r\n/g,'\n');}
function toSourceOffset(text,offset){let source=0,editor=0;while(source<text.length&&editor<offset){if(text[source]==='\r'&&text[source+1]==='\n')source++;source++;editor++;}return source;}
function toEditorOffset(text,offset){return normalized(text.slice(0,offset)).length;}
function sourceInsertion(text,source){return source.includes('\r\n')?text.replace(/\r?\n/g,'\r\n'):text;}
module.exports={normalized,toSourceOffset,toEditorOffset,sourceInsertion};
