'use strict';
const fs=require('node:fs'),path=require('node:path');
const CliReleaseUpdater=require('jade-tools-cli/automation/cli-release-updater');
async function main(){
 const root=path.resolve(__dirname,'..');
 if(process.argv[2]==='--verify-lock'){CliReleaseUpdater.verifyLock(root);console.log('CLI lockfile integrity verified.');return;}
 const result=await new CliReleaseUpdater({root}).run(process.argv[2]||'');
 if(process.env.GITHUB_OUTPUT)for(const key of ['updated','tag','version','sha','branch'])if(result[key]!==undefined)fs.appendFileSync(process.env.GITHUB_OUTPUT,key+'='+result[key]+'\n');
 console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
