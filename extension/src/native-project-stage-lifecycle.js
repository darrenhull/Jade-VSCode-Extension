'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
/** One short private bundle, retained until its last native consumer has exited. */
function createProjectStage(workingRoot){
 const parent=fs.realpathSync(os.tmpdir()),identity=crypto.createHash('sha256').update(path.resolve(workingRoot).toLowerCase()).digest('hex').slice(0,8);
 const directory=fs.mkdtempSync(path.join(parent,'jd-'+identity+'-')),owner=fs.lstatSync(directory);
 function cleanup(){
  let current;try{current=fs.lstatSync(directory);}catch(error){if(error.code==='ENOENT')return;throw error;}
  if(path.dirname(directory)!==parent||current.isSymbolicLink()||!current.isDirectory()||current.dev!==owner.dev||current.ino!==owner.ino||current.birthtimeMs!==owner.birthtimeMs||fs.realpathSync(directory)!==directory)throw Error('Native project staging ownership changed; refusing cleanup: '+directory);
  fs.rmSync(directory,{recursive:true,force:false,maxRetries:2,retryDelay:50});
 }
 return {directory,cleanup};
}
/** A cleanup failure must not replace an earlier native/staging failure. */
async function cleanupProjectStage(stage,primary){
 try{await stage?.cleanup?.();}catch(error){if(primary){primary.cleanupError=error.message;return;}throw error;}
}
module.exports={createProjectStage,cleanupProjectStage};