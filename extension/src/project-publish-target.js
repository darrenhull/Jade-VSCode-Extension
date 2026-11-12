'use strict';
const fs=require('node:fs');
const {scanProject}=require('./native-project');
const {sourceTargetPath}=require('./source-pull-path');
/** A private immutable review snapshot, produced by the existing native serializer. */
async function capturePublishTarget(service,config,destination,output=()=>{}){
 if(!service?.sourceCapabilities||!service?.startSourceExtraction)throw Error('The native streaming Source session is unavailable for publication review.');
 fs.mkdirSync(destination,{recursive:false});
 const reviewConfig={...config,workspaceRoots:[destination]};
 const capability=(await service.sourceCapabilities(reviewConfig,{cwd:destination}))?.sourceExtraction;
 if(capability?.protocol!==1||capability.fullSchema!==true||capability.available!==true||capability.layout!=='schema-ddx'||capability.requiresPromotionPermit!==true||!capability.scopes?.includes('all')||!capability.versions?.includes('current'))throw Error('Update Jade Tools to review complete native schema sources; no batch fallback was run.');
 const reported=new Set();
 const operation=service.startSourceExtraction(reviewConfig,{destination,scope:'all',cwd:destination,version:'current'},{
  onOutput:output,
  onStage:event=>{if(!reported.has(event.stage)){reported.add(event.stage);output('Target review: '+event.stage+'\n');}},
  onPermit:event=>{sourceTargetPath(destination,event.path);return true;}
 });
 const abort=()=>operation.stop();config.signal?.addEventListener('abort',abort,{once:true});if(config.signal?.aborted)abort();
 let result;try{result=await operation.completion;}finally{config.signal?.removeEventListener('abort',abort);}
 if(!result?.passed||result.authoritative!==true)throw Error('Could not capture complete target sources for publish review. '+(result?.report?.error||result?.report?.reason||''));
 return scanProject(destination);
}
module.exports={capturePublishTarget};
