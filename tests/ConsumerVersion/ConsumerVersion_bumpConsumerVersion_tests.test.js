'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {bumpConsumerVersion}=require('../../scripts/bump-consumer-version.cjs');
function fixture(t,newline='\n'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-consumer-version-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const folder of ['extension','packages'])fs.mkdirSync(path.join(root,folder));
 const files={'package.json':{version:'0.21.0'},'package-lock.json':{version:'0.21.0',packages:{'':{version:'0.21.0'}}},'extension/package.json':{version:'0.21.0'},'packages/jade-cli-pin.json':{version:'0.9.0',tag:'v0.9.0'}};
 for(const [file,value] of Object.entries(files))fs.writeFileSync(path.join(root,file),JSON.stringify(value,null,2).replaceAll('\n',newline)+newline);
 fs.writeFileSync(path.join(root,'extension/CHANGELOG.md'),['# 0.21.0 - Sources','','- Existing feature.',''].join(newline));
 return root;
}
function snapshot(root){return Object.fromEntries(['package.json','package-lock.json','extension/package.json','extension/CHANGELOG.md'].map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]))}
test('bumpConsumerVersion prepares exact release notes and preserves prior content/newlines',t=>{
 for(const newline of ['\n','\r\n']){
  const root=fixture(t,newline),before=snapshot(root);assert.equal(bumpConsumerVersion(root),'0.21.1');
  const after=snapshot(root),notes=after['extension/CHANGELOG.md'];
  assert.match(notes,/^# 0\.21\.1 - Jade CLI 0\.9\.0/);assert.ok(notes.includes('https://github.com/darrenhull/Jade-CLI/releases/tag/v0.9.0'));assert.ok(notes.endsWith(before['extension/CHANGELOG.md']));
  assert.equal(notes.replaceAll('\r\n','').includes('\n'),newline==='\n');
  for(const file of ['package.json','package-lock.json','extension/package.json'])assert.equal(JSON.parse(after[file]).version,'0.21.1');
  assert.equal(JSON.parse(after['package-lock.json']).packages[''].version,'0.21.1');
 }
});
test('bumpConsumerVersion rejects invalid preparation before modifying any files',t=>{
 const mutations=[root=>fs.unlinkSync(path.join(root,'packages/jade-cli-pin.json')),root=>fs.writeFileSync(path.join(root,'packages/jade-cli-pin.json'),JSON.stringify({version:'0.9.0',tag:'v0.8.0'})),root=>fs.writeFileSync(path.join(root,'extension/package.json'),JSON.stringify({version:'0.20.0'})),root=>fs.writeFileSync(path.join(root,'package-lock.json'),JSON.stringify({version:'0.21.0',packages:{'':{version:'0.20.0'}}})),root=>fs.appendFileSync(path.join(root,'extension/CHANGELOG.md'),'\n# 0.21.1 - Existing\n')];
 for(const mutate of mutations){const root=fixture(t);mutate(root);const before=snapshot(root);assert.throws(()=>bumpConsumerVersion(root));assert.deepEqual(snapshot(root),before);}
});
