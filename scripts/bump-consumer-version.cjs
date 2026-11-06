'use strict';
const fs=require('node:fs'),path=require('node:path');
function bumpConsumerVersion(root){
 const files=['package.json','package-lock.json','extension/package.json'].filter(file=>fs.existsSync(path.join(root,file)));
 const values=files.map(file=>{const source=fs.readFileSync(path.join(root,file),'utf8');return {file,newline:source.includes('\r\n')?'\r\n':'\n',value:JSON.parse(source)};});
 const current=values.find(item=>item.file==='package.json')?.value.version;
 if(!/^\d+\.\d+\.\d+$/.test(current||''))throw Error('Expected a stable consumer version.');
 const parts=current.split('.').map(Number);parts[2]++;const version=parts.join('.');
 for(const item of values){if(item.value.version!==current)throw Error('Consumer package versions must match before updating.');item.value.version=version;if(item.file==='package-lock.json'&&item.value.packages?.[''])item.value.packages[''].version=version;}
 for(const item of values)fs.writeFileSync(path.join(root,item.file),(JSON.stringify(item.value,null,2)+'\n').replaceAll('\n',item.newline));
 return version;
}
module.exports={bumpConsumerVersion};
if(require.main===module)console.log(bumpConsumerVersion(process.cwd()));
