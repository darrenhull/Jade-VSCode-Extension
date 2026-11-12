'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
function fixture(t,newline='\n'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-version-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'extension'));fs.mkdirSync(path.join(root,'packages'));
 for(const [file,value] of Object.entries({'package.json':{name:'consumer',version:'1.2.3'},'extension/package.json':{name:'consumer',version:'1.2.3'},'package-lock.json':{version:'1.2.3',packages:{'':{version:'1.2.3'},'node_modules/dep':{version:'9.0.0'}}},'packages/jade-cli-pin.json':{version:'0.9.0',tag:'v0.9.0'}}))fs.writeFileSync(path.join(root,file),(JSON.stringify(value,null,2)+'\n').replaceAll('\n',newline));
 fs.writeFileSync(path.join(root,'extension/CHANGELOG.md'),'# 1.2.3 - Existing'+newline);
 return root;
}
test('dependency updates bump consumer versions and lockfile together',t=>{
 const root=fixture(t);require('../../scripts/bump-consumer-version.cjs').bumpConsumerVersion(root);
 for(const file of ['package.json','extension/package.json','package-lock.json'])assert.equal(JSON.parse(fs.readFileSync(path.join(root,file))).version,'1.2.4');
 const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json')));assert.equal(lock.packages[''].version,'1.2.4');assert.equal(lock.packages['node_modules/dep'].version,'9.0.0');
});
test('consumer version bumps preserve existing manifest newline style',t=>{
 const root=fixture(t,'\r\n');require('../../scripts/bump-consumer-version.cjs').bumpConsumerVersion(root);
 const bytes=fs.readFileSync(path.join(root,'package.json'),'utf8');assert.match(bytes,/\r\n/);assert.doesNotMatch(bytes,/(?<!\r)\n/);
});
