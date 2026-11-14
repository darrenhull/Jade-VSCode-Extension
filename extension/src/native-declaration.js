'use strict';
// The native type cache contains declarations, not method bodies or exportable source.
const SCHEME='jade-native-declaration',MAX_CONTENT=4096,MAX_URI=16384;
const identifier=value=>typeof value==='string'&&/^[A-Za-z_]\w*$/.test(value);
function nativeDeclaration(symbol){
 if(symbol?.model||!symbol?.system||symbol.schema!=='RootSchema'||!identifier(symbol.name)||!['class','method','property'].includes(symbol.kind))return;
 const owner=symbol.kind==='class'?symbol.name:symbol.owner;if(!identifier(owner))return;
 const type=value=>value||'<type unavailable>';
 let declaration=symbol.name;
 if(symbol.kind==='property')declaration+=' : '+type(symbol.type)+(symbol.length?'['+symbol.length+']':'');
 else if(symbol.kind==='method'&&(symbol.parameters||[]).length>128)return;
 else if(symbol.kind==='method')declaration+='('+(symbol.parameters||[]).map(parameter=>parameter.name+' : '+type(parameter.type)+(parameter.length?'['+parameter.length+']':'')+(parameter.usage&&parameter.usage!=='constant'?' '+parameter.usage:'')).join('; ')+')'+(symbol.returnType?' : '+symbol.returnType:'')+(symbol.typeMethod?' typeMethod':'');
 else if(symbol.parent)declaration+=' subclassOf '+symbol.parent;
 const lines=['Native declaration metadata (read-only)','Cached type information, not JADE source. Method bodies are unavailable.','',symbol.schema+'::'+owner,'',symbol.kind+' '+declaration];
 const text=lines.join('\n'),path='/'+symbol.schema+'/'+owner+'/'+symbol.name+'.txt';if(text.length>MAX_CONTENT||encodeURIComponent(text).length+encodeURI(path).length+SCHEME.length+2>MAX_URI)return;
 return {scheme:SCHEME,path,query:text,line:5,character:symbol.kind.length+1};
}
function declarationContent(uri){return uri.query.length<=MAX_CONTENT&&encodeURIComponent(uri.query).length<=MAX_URI?uri.query:'';}
module.exports={SCHEME,nativeDeclaration,declarationContent};
