'use strict';
const fs=require('node:fs'),path=require('node:path');
function resolveSchemaFolder(root,schemaPath='schemas'){
 if(typeof schemaPath!=='string'||!schemaPath.trim()||schemaPath.includes(String.fromCharCode(0))||path.win32.isAbsolute(schemaPath)||path.posix.isAbsolute(schemaPath)||/^[A-Za-z]:/.test(schemaPath))
  throw Error('schemaPath must be a nonempty checkout-relative folder.');
 const checkout=path.resolve(root),selected=path.resolve(checkout,schemaPath);
 const inside=(parent,child)=>{const relative=path.relative(parent,child);return relative!== '..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
 if(!inside(checkout,selected))throw Error('schemaPath must stay inside the checkout.');
 try{
  if(!fs.statSync(selected).isDirectory())throw Error('schemaPath must identify a folder.');
  if(!inside(fs.realpathSync(checkout),fs.realpathSync(selected)))throw Error('schemaPath redirects outside the checkout.');
 }catch(cause){throw Error('The schemaPath folder must exist and remain inside the checkout: '+selected+'. '+cause.message,{cause});}
 return selected;
}
module.exports={resolveSchemaFolder};