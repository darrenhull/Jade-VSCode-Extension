'use strict';
/** Close only extension-owned consumers, awaiting each acknowledgement before setup writes. */
async function releaseWorkingConsumers({inspector,client,projects=[],retainedWorking}){
 await inspector?.releaseForOperation();
 const active=[...projects];
 // A CLI disconnect closes Working for the whole broker, across all its proxies.
 // Keep the existing session only for a lone reviewed owner with no pending runtime operations.
 const connection=retainedWorking?.ownedClient?.client;
 const retain=connection&&!connection.closed&&active.includes(retainedWorking)&&
   !retainedWorking.ownedClient.pending?.size&&!client?.pending?.size&&!client?.activeSources?.size&&
   active.every(project=>project===retainedWorking||!project.ownedClient?.client&&!project.provider?.snapshot);
 for(const project of active){if(project.provider?.snapshot)await project.provider.closeProject();if(!retain)await project.ownedClient?.release();}
 if(!retain)await client?.release();
}
module.exports={releaseWorkingConsumers};
