'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('authenticated native package text remains byte-exact with Git autocrlf enabled',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-native-checkout-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git('init','--quiet');fs.copyFileSync(path.resolve(__dirname,'../../.gitattributes'),path.join(root,'.gitattributes'));
 for(const [relative,text]of [['packages/jade-cli-win-x64/distribution.json','{\r\n  "packageVersion": "0.10.1"\r\n}\r\n'],['packages/jade-cli-win-x64/README.md','# Native package\r\n\nExact authenticated bytes.\r\n']]){
  const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);
  const raw=git('hash-object','--no-filters',file),filtered=git('-c','core.autocrlf=true','hash-object','--path='+relative,file);assert.equal(filtered,raw,relative+' would change under checkout/add normalization');
 }
});
