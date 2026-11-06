'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
require('./bundle-cli.cjs').bundleCli();
// Default tests never opt in to a configured Jade database, even if a shell
// inherited research-control environment variables from another workspace.
const env={...process.env};
for(const key of Object.keys(env))if(/^JADE_/.test(key)&&!['JADE_HOME','JADE_INSTALL'].includes(key))delete env[key];
const files=[];
function collect(directory){if(!fs.existsSync(directory))return;for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())collect(file);else if(entry.name.endsWith('.test.js'))files.push(file);}}
collect(path.join(root,'test'));collect(path.join(root,'tests'));files.sort();
for(const phase of require('./TestPlan.cjs').createTestPlan(files)) {
  console.log('Running '+phase.name+': '+phase.files.length+' files, worker limit '+phase.concurrency+'.');
  const result=spawnSync(process.execPath,['--test','--test-concurrency='+phase.concurrency,...phase.files],{cwd:root,env,stdio:'inherit'});
  if(result.error)console.error(result.error.message);
  if(result.status!==0)process.exitCode=result.status??1;
}
