'use strict';
const fs=require('node:fs'),path=require('node:path');
function bumpConsumerVersion(root){
 const files=['package.json','package-lock.json','extension/package.json'];
 const values=files.map(file=>{const source=fs.readFileSync(path.join(root,file),'utf8');return {file,newline:source.includes('\r\n')?'\r\n':'\n',value:JSON.parse(source)};});
 const current=values[0].value.version;
 if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(current||'')||current.includes('\n'))throw Error('Expected a stable consumer version.');
 const parts=current.split('.').map(Number);parts[2]++;const version=parts.join('.');
 const pin=JSON.parse(fs.readFileSync(path.join(root,'packages/jade-cli-pin.json'),'utf8'));
 if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pin.version||'')||pin.tag!==`v${pin.version}`)throw Error('Expected a matching stable CLI version and release tag.');
 const changelogPath=path.join(root,'extension/CHANGELOG.md'),changelog=fs.readFileSync(changelogPath,'utf8');
 if(changelog.split(/\r?\n/).some(line=>new RegExp(`^# (?:v)?${version.replaceAll('.','\\.')}(?:\\s|$)`).test(line)))throw Error('The next consumer version already has release notes.');
 for(const item of values){
  if(item.value.version!==current||(item.file==='package-lock.json'&&item.value.packages?.['']?.version!==current))throw Error('Consumer package versions must match before updating.');
  item.value.version=version;
  if(item.file==='package-lock.json')item.value.packages[''].version=version;
 }
 const newline=changelog.includes('\r\n')?'\r\n':'\n';
 const notes=[`# ${version} - Jade CLI ${pin.version}`,'',`- Bundles [Jade CLI ${pin.version}](https://github.com/darrenhull/Jade-CLI/releases/tag/${pin.tag}) for local Jade operations.`,'',''].join(newline)+changelog;
 for(const item of values)fs.writeFileSync(path.join(root,item.file),(JSON.stringify(item.value,null,2)+'\n').replaceAll('\n',item.newline));
 fs.writeFileSync(changelogPath,notes);
 return version;
}
module.exports={bumpConsumerVersion};
if(require.main===module)console.log(bumpConsumerVersion(process.cwd()));
