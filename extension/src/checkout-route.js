'use strict';
const path=require('node:path');
/** Disk JOX is authoritative unless the project explicitly opts into extraction. */
function checkoutRoute(machine,project,root){
 if(project.workingMode==='source-backed')return;
 const result={...machine,...project,sourceFormat:'jox',workingMode:'existing',workspaceRoots:project.workspaceRoots||[path.resolve(root)]};
 for(const key of ['workingSeedDirectory','workingDatabaseDirectory','sourceDatabasePath','user','username','password'])delete result[key];
 return result;
}
module.exports={checkoutRoute};