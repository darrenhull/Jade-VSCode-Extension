'use strict';
/** Close only extension-owned consumers, awaiting each acknowledgement before setup writes. */
async function releaseWorkingConsumers({inspector,client,projects=[],retainedWorking}){
 await inspector?.releaseForOperation();
 const active=[...projects];
 // A CLI disconnect closes Working for the whole broker, across all its proxies.
 // Keep the existing session only for a lone reviewed owner with no pending runtime operations.
 const {project,owner,connection}=retainedWorking||{};
 const canRetain=()=>connection&&!connection.closed&&active.includes(project)&&
   project.ownedClient===owner&&owner?.client===connection&&project.provider?.connection===connection&&
   !owner.pending?.size&&!owner.activeSources?.size&&!client?.pending?.size&&!client?.activeSources?.size&&
   active.every(other=>other===project||!other.ownedClient?.client&&!other.provider?.snapshot);
 if(canRetain()){
   if(project.provider.snapshot)await project.provider.closeProject();
   if(canRetain())return;
 }
 for(const other of active){if(other.provider?.snapshot)await other.provider.closeProject();await other.ownedClient?.release();}
 await client?.release();
}
module.exports={releaseWorkingConsumers};
