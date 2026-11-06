'use strict';
const {bundleCli}=require('./bundle-cli.cjs');
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
async function main(){
 if(process.argv[2]==='--verify-lock'){const root=path.resolve(__dirname,'..');bundleCli({verifyOnly:true,source:path.join(root,'packages/jade-cli-win-x64'),pinFile:path.join(root,'packages/jade-cli-pin.json')});console.log('Native CLI pin receipt and distribution integrity verified.');return;}
 const script=process.env.JADE_NATIVE_UPDATER_SCRIPT||path.join(__dirname,'update-native-cli.ps1');
 if(!path.isAbsolute(script)||!fs.existsSync(script))throw Error('The extension-owned native ZIP updater is missing. Legacy JavaScript CLI updates are disabled.');
 const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',script,'-Root',path.resolve(__dirname,'..'),...(process.argv[2]?['-Tag',process.argv[2]]:[])],{stdio:'inherit',windowsHide:true,shell:false});
 if(result.error)throw result.error;if(result.status!==0)process.exitCode=result.status||1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
