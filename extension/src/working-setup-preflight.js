'use strict';
/** Close only extension-owned consumers, awaiting each acknowledgement before setup writes. */
async function releaseWorkingConsumers({inspector,client,projects=[]}){
 await inspector?.releaseForOperation();
 for(const project of projects){await project.provider?.closeProject();await project.ownedClient?.release();}
 await client?.release();
}
module.exports={releaseWorkingConsumers};