'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),extension=path.join(root,'extension');
const {name,version}=JSON.parse(fs.readFileSync(path.join(extension,'package.json'),'utf8'));
const vsce=require.resolve('@vscode/vsce/vsce');
require('./bundle-cli.cjs').bundleCli();
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
const result=spawnSync(process.execPath,[vsce,'package','--no-dependencies','--allow-missing-repository','--no-rewrite-relative-links','--skip-license','--out',path.join(root,'dist',name+'-'+version+'.vsix')],{cwd:extension,stdio:'inherit'});
process.exitCode=result.status??1;
