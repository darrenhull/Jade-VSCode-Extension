'use strict';
function checkoutConfiguration(settings,sourceRoot){
 const result={...settings,sourceFormat:'jox',workingMode:'git-first',workspaceRoots:[sourceRoot],server:'singleUser'};
 result.workingSeedDirectory=settings.workingSeedDirectory||settings.databasePath;
 if(!result.workingSeedDirectory)delete result.workingSeedDirectory;
 for(const key of ['connection','databasePath','sourceDatabasePath','iniPath','user','username','password'])delete result[key];
 return result;
}
module.exports={checkoutConfiguration};
