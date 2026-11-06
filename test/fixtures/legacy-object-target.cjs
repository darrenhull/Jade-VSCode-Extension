'use strict';
// Baseline-only regression fixture. Production target resolution belongs to C++.
const fs=require('node:fs'),path=require('node:path');
const {workingLocation}=require('../../extension/src/working-database');
function inspectionTarget(config,selection,dependencies={}){
 if(!['working','source'].includes(selection))throw Error('Invalid database selection.');
 const base={...config,readOnly:true,selection};if(selection==='source')return base;
 const location=workingLocation(config),marker=path.join(location.root,'working-database.json'),exists=dependencies.exists||fs.existsSync;
 if(!exists(marker)||!exists(path.join(location.databasePath,'_control.dat')))throw Error('Compile or run tests to create the working database before inspecting it.');
 const saved=(dependencies.readJson||(file=>JSON.parse(fs.readFileSync(file,'utf8'))))(marker);
 if(saved.identity!==location.identity)throw Error('Working database belongs to a different source connection.');
 return {...base,root:location.root,databasePath:location.databasePath,iniPath:path.join(location.root,'working.ini'),server:'singleUser'};
}
module.exports={inspectionTarget};
