'use strict';
/** Publication utilities share native CLI ownership; no independent Jade launcher. */
async function nativeProcess(executable,args,options={},output=()=>{}){
 const cli=require('./cli-gateway').current();
 if(!cli)throw Error('The native Jade CLI session is not available. Activate the extension before running native utilities.');
 return cli.runNative(executable,args,options,output);
}
module.exports={nativeProcess};
