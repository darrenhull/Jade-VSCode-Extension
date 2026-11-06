'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
require('./bundle-cli.cjs').bundleCli();
// Default tests never opt in to a configured Jade database, even if a shell
// inherited research-control environment variables from another workspace.
const env={...process.env};
for(const key of Object.keys(env))if(/^JADE_/.test(key)&&!['JADE_HOME','JADE_INSTALL'].includes(key))delete env[key];
const files=fs.readdirSync(path.join(root,'test')).filter(name=>name.endsWith('.test.js')).sort().map(name=>path.join(root,'test',name));
const result=spawnSync(process.execPath,['--test',...files],{cwd:root,env,stdio:'inherit'});
process.exitCode=result.status??1;
