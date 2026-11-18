'use strict';
const {configDto}=require('./cli-client');
const {requireWorkingJadeGitPolicy}=require('./working-jadegit-policy');
const {workspaceSnapshot}=require('./jade-workspace-document');

/** Serializes owned Workspace requests; Jade owns compilation and execution. */
class JadeWorkspaceRunner {
  constructor({client,configFor,beforeOperation=async()=>{},afterOperation=async()=>{},prepareSource=async()=>{}}) {
    this.client=client;this.configFor=configFor;this.beforeOperation=beforeOperation;this.afterOperation=afterOperation;this.prepareSource=prepareSource;this.tail=Promise.resolve();
  }
  run({document,schema,selection,token,onOutput=()=>{},onProgress=()=>{}}) {
    let snapshot;
    try {snapshot=workspaceSnapshot(document.getText(),selection);}
    catch(error) {return Promise.resolve({code:2,passed:false,report:{error:error.message}});}
    const version=document.version,source=document.uri.toString();
    const cancelled=()=>({code:130,passed:false,cancelled:true,report:{error:'Workspace execution cancelled.'},snapshot,stale:document.version!==version});
    onProgress({stage:'queued',message:'Queued for Scratch Pad execution'});
    const work=async()=>{
      let subscription,acquired=false,lease,outcome;
      const finish=value=>(outcome=value);
      try {
        if(token?.isCancellationRequested)return finish(cancelled());
        onProgress({stage:'configuring',message:'Resolving Scratch Pad project and connection'});
        const config=await this.configFor(document);
        config.schema=schema||config.schema;
        if(!/^[A-Za-z_]\w*$/.test(config.schema||''))throw Error('Choose a Jade schema before running the Workspace.');
        if(config.workingJadeGitPolicy&&config.workingJadeGitPolicy!=='inherit'){
          await requireWorkingJadeGitPolicy(this.client,config);
          if(token?.isCancellationRequested)return finish(cancelled());
        }
        onProgress({stage:'acquiring',message:'Acquiring the Working operation'});
        lease=await this.beforeOperation();acquired=true;
        if(token?.isCancellationRequested)return finish(cancelled());
        onProgress({stage:'preparing',message:'Preparing saved Git source inputs'});
        await this.prepareSource(config,message=>onProgress({stage:'preparing',message}),token);
        if(token?.isCancellationRequested)return finish(cancelled());
        onProgress({stage:'native',message:'Waiting for JADE preparation and execution result'});
        const request=this.client.request('workspace.run',{config:configDto(config),sourceText:snapshot.text,source,lineOffset:0,columnOffset:0},onOutput);
        let cancelSent=false;
        const cancel=()=>{if(cancelSent)return;cancelSent=true;void this.client.request('cancel',{operationId:request.id}).promise.catch(()=>{});};
        subscription=token?.onCancellationRequested(cancel);
        if(token?.isCancellationRequested)cancel();
        const result=await request.promise;
        if(!result||typeof result.passed!=='boolean'||!Number.isInteger(result.code))throw Error('The native CLI returned an incomplete Workspace result. Update the Jade CLI bundle.');
        onProgress({stage:'received',message:'JADE response received'});
        return finish({...result,snapshot,stale:document.version!==version});
      } catch(error) {
        const result=error.result||(error.cancelled===true
          ? {...cancelled(),report:{error:error.message||'Workspace execution cancelled.'}}
          : {code:2,passed:false,report:{error:error.message}});
        return finish({...result,snapshot,stale:document.version!==version});
      } finally {
        subscription?.dispose();
        if(acquired){
          onProgress({stage:'releasing',message:'Releasing the Working operation'});
          try {await this.afterOperation(lease);}
          catch(error){
            if(!outcome)throw error;
            outcome.report={...outcome.report,cleanupError:error.message};
            if(outcome.passed){outcome.passed=false;outcome.code=2;outcome.report.error='Working operation release failed: '+error.message;}
          }
        }
      }
    };
    const operation=this.tail.then(work,work);this.tail=operation.then(()=>{},()=>{});return operation;
  }
}
module.exports={JadeWorkspaceRunner};
