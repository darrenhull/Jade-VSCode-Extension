'use strict';
/** Present one owned native cache operation; native code retains source semantics. */
class SourceIndexProgress{
 constructor({vscode,client,root,config,output,onProgress=()=>{},now=Date.now}){Object.assign(this,{vscode,client,root,config,output,onProgress,now});}
 run(action){
  const work=async(progress,token)=>{
   const started=this.now();let active,last='Preparing saved Git source inputs',cancelSent;
   const report=text=>{last=String(text).trim().slice(-500)||last;const message=last+' · '+Math.floor((this.now()-started)/1000)+'s elapsed · '+this.root;progress.report({message});this.onProgress(message);};
   const cancel=()=>{if(!active||cancelSent===active.id)return;cancelSent=active.id;report('Cancelling source index operation; waiting for native cleanup');try{void this.client.request('cancel',{operationId:active.id},undefined,undefined,active.client).promise.catch(error=>this.output.appendLine(error.message));}catch(error){this.output.appendLine(error.message);}};
   const subscription=token?.onCancellationRequested(cancel),timer=setInterval(()=>report(last),1000);timer.unref?.();report(last);
   const request=async command=>{
    if(token?.isCancellationRequested)return{passed:false,code:130,cancelled:true,report:{error:'Source index preparation cancelled.'}};
    const remaining=this.config.timeoutMilliseconds-(this.now()-started);
    if(remaining<=0)return{passed:false,code:2,timedOut:true,report:{error:'Workspace source index preparation timed out.'}};
    active=this.client.request(command,{config:{...this.config,timeoutMilliseconds:remaining}},text=>{this.output.appendLine(text.trimEnd());report(text);});
    if(token?.isCancellationRequested)cancel();
    try{return await active.promise;}finally{active=undefined;}
   };
   try{return await action({request,report});}finally{clearInterval(timer);subscription?.dispose();}
  };
  return this.vscode.window.withProgress?this.vscode.window.withProgress({location:this.vscode.ProgressLocation.Notification,title:'Preparing Jade source index',cancellable:true},work):work({report(){}},undefined);
 }
}
module.exports={SourceIndexProgress};
