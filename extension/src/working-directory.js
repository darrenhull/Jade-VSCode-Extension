'use strict';
const path=require('node:path');
/** Empty delegates the automatic location to the compatible native CLI. */
function resolveWorkingDirectory(value,workspace){
 if(value===undefined||value==='')return undefined;
 if(typeof value!=='string')throw Error('Working directory must be a path.');
 if(path.isAbsolute(value))return path.normalize(value);
 if(!workspace)throw Error('Select a workspace folder for a relative Working directory.');
 return path.resolve(workspace,value);
}
module.exports={resolveWorkingDirectory};
