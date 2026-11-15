'use strict';
const sourceIndexCancelled=()=>({passed:false,code:130,cancelled:true,report:{error:'Source index preparation cancelled.'}});
function sourceIndexCancellationError(){const result=sourceIndexCancelled();return Object.assign(Error(result.report.error),{result});}
// A waiter owns its subscription, never the shared producer's native request.
function waitForSourceIndex(promise,token){
 if(!token)return promise;
 if(token.isCancellationRequested)return Promise.reject(sourceIndexCancellationError());
 return new Promise((resolve,reject)=>{
  let settled=false,subscription;
  const finish=(callback,value)=>{if(settled)return;settled=true;subscription?.dispose();callback(value);};
  subscription=token.onCancellationRequested(()=>finish(reject,sourceIndexCancellationError()));
  if(settled)subscription.dispose();
  if(token.isCancellationRequested)finish(reject,sourceIndexCancellationError());
  Promise.resolve(promise).then(value=>finish(resolve,value),error=>finish(reject,error));
 });
}
/** Present one owned native cache operation; native code retains source semantics. */
class SourceIndexProgress{
 constructor({vscode,client,root,config,output,onProgress=()=>{},originToken,now=()=>performance.now()}){Object.assign(this,{vscode,client,root,config,output,onProgress,originToken,now});}
 run(action){
  const work=async(progress,token)=>{
   const started=this.now();let active,last='Preparing saved Git source inputs',cancelSent,cancelRequested=false;
   const isCancelled=()=>cancelRequested||token?.isCancellationRequested||this.originToken?.isCancellationRequested;
   const report=text=>{last=String(text).trim().slice(-500)||last;const message=last+' · '+Math.floor((this.now()-started)/1000)+'s elapsed · '+this.root;progress.report({message});this.onProgress(message);};
   const cancel=()=>{cancelRequested=true;if(!active||cancelSent===active.id)return;cancelSent=active.id;report('Cancelling source index operation; waiting for native cleanup');try{void this.client.request('cancel',{operationId:active.id},undefined,undefined,active.client).promise.catch(error=>this.output.appendLine(error.message));}catch(error){this.output.appendLine(error.message);}};
   const subscription=token?.onCancellationRequested(cancel),originSubscription=this.originToken?.onCancellationRequested(cancel),timer=setInterval(()=>report(last),1000);timer.unref?.();report(last);
   const request=async command=>{
    if(isCancelled())return sourceIndexCancelled();
    const remaining=Math.floor(this.config.timeoutMilliseconds-(this.now()-started));
    if(remaining<=0)return{passed:false,code:2,timedOut:true,report:{error:'Workspace source index preparation timed out.'}};
    active=this.client.request(command,{config:{...this.config,timeoutMilliseconds:remaining}},text=>{this.output.appendLine(text.trimEnd());report(text);});
    if(isCancelled())cancel();
    try{return await active.promise;}finally{active=undefined;}
   };
   try{const result=await action({request,report});return isCancelled()&&result?.passed===true?sourceIndexCancelled():result;}finally{clearInterval(timer);subscription?.dispose();originSubscription?.dispose();}
  };
  return this.vscode.window.withProgress?this.vscode.window.withProgress({location:this.vscode.ProgressLocation.Notification,title:'Preparing Jade source index',cancellable:true},work):work({report(){}},undefined);
 }
}
module.exports={SourceIndexProgress,waitForSourceIndex,sourceIndexCancellationError};
