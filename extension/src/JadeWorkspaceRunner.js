'use strict';
const {configDto}=require('./cli-client');
const {workspaceSnapshot}=require('./jade-workspace-document');

/** Serializes owned Workspace requests; Jade owns compilation and execution. */
class JadeWorkspaceRunner {
  constructor({client,configFor,beforeOperation=async()=>{},afterOperation=async()=>{}}) {
    this.client=client;this.configFor=configFor;this.beforeOperation=beforeOperation;this.afterOperation=afterOperation;this.tail=Promise.resolve();
  }
  run({document,schema,selection,token,onOutput=()=>{}}) {
    let snapshot;
    try {snapshot=workspaceSnapshot(document.getText(),selection);}
    catch(error) {return Promise.resolve({code:2,passed:false,report:{error:error.message}});}
    const version=document.version,source=document.uri.toString();
    const cancelled=()=>({code:130,passed:false,cancelled:true,report:{error:'Workspace execution cancelled.'},snapshot,stale:document.version!==version});
    const work=async()=>{
      let subscription,acquired=false;
      try {
        if(token?.isCancellationRequested)return cancelled();
        const config=await this.configFor(document);
        config.schema=schema||config.schema;
        if(!/^[A-Za-z_]\w*$/.test(config.schema||''))throw Error('Choose a Jade schema before running the Workspace.');
        await this.beforeOperation();acquired=true;
        if(token?.isCancellationRequested)return cancelled();
        const request=this.client.request('workspace.run',{config:configDto(config),sourceText:snapshot.text,source,lineOffset:0,columnOffset:0},onOutput);
        subscription=token?.onCancellationRequested(()=>{void this.client.request('cancel',{operationId:request.id}).promise.catch(()=>{});});
        const result=await request.promise;
        if(!result||typeof result.passed!=='boolean'||!Number.isInteger(result.code))throw Error('The native CLI returned an incomplete Workspace result. Update the Jade CLI bundle.');
        return {...result,snapshot,stale:document.version!==version};
      } catch(error) {
        return {code:2,passed:false,report:{error:error.message},snapshot,stale:document.version!==version};
      } finally {subscription?.dispose();if(acquired)await this.afterOperation();}
    };
    const operation=this.tail.then(work,work);this.tail=operation.then(()=>{},()=>{});return operation;
  }
}
module.exports={JadeWorkspaceRunner};
