'use strict';
const fs=require('node:fs'),path=require('node:path');
function bundleCli(){
 const root=path.resolve(__dirname,'..'),source=path.join(root,'node_modules/jade-tools-cli'),destination=path.join(root,'extension/vendor/jade-tools-cli');
 if(!fs.existsSync(path.join(source,'bin/jade-cli.js'))||!fs.existsSync(path.join(source,'jade-cli.exe')))throw Error('Install the pinned standalone Jade CLI package with npm ci before packaging.');
 if(path.dirname(destination)!==path.join(root,'extension/vendor'))throw Error('Invalid generated CLI bundle destination.');
 fs.rmSync(destination,{recursive:true,force:true});fs.cpSync(source,destination,{recursive:true});
 // Legacy connected test controls use these ignored compatibility paths. The
 // activated extension launches the CLI's helpers; VSIX excludes these copies.
 const compatibility=path.join(root,'extension/native');fs.mkdirSync(compatibility,{recursive:true});
 for(const name of ['jade-native-helper.exe','jade-debug-helper.exe','jade-inspect-helper.exe','jade-test-helper.exe'])fs.copyFileSync(path.join(source,'sdk/native',name),path.join(compatibility,name));
 return destination;
}
if(require.main===module)console.log(bundleCli());
module.exports={bundleCli};
