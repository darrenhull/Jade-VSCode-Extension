'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {bundleCli}=require('../../scripts/bundle-cli.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-native-bundle-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const source=path.join(root,'source'),destination=path.join(root,'target');fs.mkdirSync(path.join(source,'native'),{recursive:true});fs.writeFileSync(path.join(source,'jade-cli.exe'),'native-executable');for(const name of ['jade-test-helper.exe','jade-debug-helper.exe','jade-inspect-helper.exe','jade-native-helper.exe','debugger-abi.json'])fs.writeFileSync(path.join(source,'native',name),'helper '+name);const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(source,file))).digest('hex');const manifest={formatVersion:2,runtime:'native-cpp',platform:'win32',arch:'x64',executable:'jade-cli.exe',packageVersion:'0.3.2',oidFormat:'jade-native',executableSha256:hash('jade-cli.exe'),runtimeFiles:Object.fromEntries(fs.readdirSync(path.join(source,'native')).map(name=>['native/'+name,hash('native/'+name)]))};fs.writeFileSync(path.join(source,'distribution.json'),JSON.stringify(manifest));return {root,source,destination,manifest};}

test('stages the verified native distribution without JavaScript SDK or Node files',t=>{const f=fixture(t);fs.writeFileSync(path.join(f.source,'node.exe'),'must not ship');bundleCli(f);assert.ok(fs.existsSync(path.join(f.destination,'jade-cli.exe')));assert.ok(fs.existsSync(path.join(f.destination,'native/jade-test-helper.exe')));assert.equal(fs.existsSync(path.join(f.destination,'node.exe')),false);assert.equal(fs.existsSync(path.join(f.destination,'sdk')),false);});
test('rejects a modified runtime before overwriting a prior bundle',t=>{const f=fixture(t);fs.mkdirSync(f.destination);fs.writeFileSync(path.join(f.destination,'keep'),'old');fs.writeFileSync(path.join(f.source,'native/jade-test-helper.exe'),'tampered');assert.throws(()=>bundleCli(f),/checksum/i);assert.equal(fs.readFileSync(path.join(f.destination,'keep'),'utf8'),'old');});
test('rejects an embedded-Node manifest and traversal in runtime paths',t=>{const f=fixture(t);f.manifest.runtime='node-sea';fs.writeFileSync(path.join(f.source,'distribution.json'),JSON.stringify(f.manifest));assert.throws(()=>bundleCli(f),/native/i);f.manifest.runtime='native-cpp';f.manifest.runtimeFiles['../outside']='abc';fs.writeFileSync(path.join(f.source,'distribution.json'),JSON.stringify(f.manifest));assert.throws(()=>bundleCli(f),/runtime path/i);});
test('rejects omitted required helpers and ABI metadata before touching a previous staged bundle',t=>{for(const name of ['jade-test-helper.exe','jade-debug-helper.exe','jade-inspect-helper.exe','jade-native-helper.exe','debugger-abi.json']){const f=fixture(t);delete f.manifest.runtimeFiles['native/'+name];fs.writeFileSync(path.join(f.source,'distribution.json'),JSON.stringify(f.manifest));fs.mkdirSync(f.destination);fs.writeFileSync(path.join(f.destination,'keep'),'old');assert.throws(()=>bundleCli(f),/required native/i);assert.equal(fs.readFileSync(path.join(f.destination,'keep'),'utf8'),'old');}});

test('preserves the exact verified manifest bytes and its archive receipt after staging',t=>{
 const f=fixture(t),bytes=Buffer.from(JSON.stringify(f.manifest,null,2).replace(/\n/g,'\r\n')+'\r\n');fs.writeFileSync(path.join(f.source,'distribution.json'),bytes);
 const pinFile=path.join(f.root,'pin.json');fs.writeFileSync(pinFile,JSON.stringify({version:'0.3.2',tag:'v0.3.2',sha256:'a'.repeat(64),distributionSha256:crypto.createHash('sha256').update(bytes).digest('hex')}));
 bundleCli({...f,pinFile});assert.deepEqual(fs.readFileSync(path.join(f.destination,'distribution.json')),bytes);assert.doesNotThrow(()=>require('../../scripts/NativePin.cjs').verifyNativePin(f.destination,pinFile));
});
test('an explicit candidate environment override verifies candidate hashes without impersonating the official release pin',t=>{
 const f=fixture(t),previous=process.env.JADE_CLI_DISTRIBUTION;process.env.JADE_CLI_DISTRIBUTION=f.source;
 t.after(()=>{if(previous===undefined)delete process.env.JADE_CLI_DISTRIBUTION;else process.env.JADE_CLI_DISTRIBUTION=previous;});
 assert.equal(bundleCli({destination:f.destination}),f.destination);
 fs.writeFileSync(path.join(f.source,'native/jade-test-helper.exe'),'tampered');assert.throws(()=>bundleCli({destination:f.destination}),/checksum/i);
});
test('a feature minimum rejects an older native runtime before replacing a previously staged bundle',t=>{
 const f=fixture(t);fs.mkdirSync(f.destination);fs.writeFileSync(path.join(f.destination,'keep'),'previous');
 assert.throws(()=>bundleCli({...f,minimumVersion:'0.4.0'}),/requires.*0\.4\.0/);assert.equal(fs.readFileSync(path.join(f.destination,'keep'),'utf8'),'previous');
});
test('packaging rejects pre-capability distributions even with valid checksums',t=>{const f=fixture(t);f.manifest.packageVersion='0.3.1';delete f.manifest.oidFormat;fs.writeFileSync(path.join(f.source,'distribution.json'),JSON.stringify(f.manifest));assert.throws(()=>bundleCli(f),/native Jade object identities/i);assert.equal(fs.existsSync(f.destination),false);});
test('explicit candidate staging uses its own verified bytes without claiming the shipping pin',t=>{const f=fixture(t),prior=process.env.JADE_CLI_DISTRIBUTION;process.env.JADE_CLI_DISTRIBUTION=f.source;try{assert.equal(bundleCli({verifyOnly:true}),f.source);}finally{if(prior===undefined)delete process.env.JADE_CLI_DISTRIBUTION;else process.env.JADE_CLI_DISTRIBUTION=prior;}});

function joxFixture(t){
 const f=fixture(t);f.manifest.packageVersion='0.11.0';
 f.manifest.joxRuntime={format:1,characterSet:'unicode',engineCommit:'a'.repeat(40),managedUpload:true,nativeTests:true,initialization:true,nativeScratch:false};
 for(const name of ['jade-jox-test-helper-unicode.exe','jadegitscm.dll','jadegitdev.dll']){
  const relative='native/jox/'+name;fs.mkdirSync(path.dirname(path.join(f.source,relative)),{recursive:true});
  const bytes=Buffer.from('synthetic packaging fixture '+name);fs.writeFileSync(path.join(f.source,relative),bytes);
  f.manifest.runtimeFiles[relative]=crypto.createHash('sha256').update(bytes).digest('hex');
 }
 for(const name of ['jade-inspect-helper-ansi.exe','jade-inspect-helper-unicode.exe']){const bytes=Buffer.from('synthetic inspector '+name);fs.writeFileSync(path.join(f.source,'native',name),bytes);f.manifest.runtimeFiles['native/'+name]=crypto.createHash('sha256').update(bytes).digest('hex');}
 f.save=()=>fs.writeFileSync(path.join(f.source,'distribution.json'),JSON.stringify(f.manifest));f.save();return f;
}
test('JOX packaging refuses unqualified initial-flow flags before replacing the existing bundle',t=>{
 for(const field of ['managedUpload','nativeTests','initialization']){
  const f=joxFixture(t);f.manifest.joxRuntime[field]=false;f.save();fs.mkdirSync(f.destination);fs.writeFileSync(path.join(f.destination,'keep'),'previous');
  assert.throws(()=>bundleCli({...f,requireJox:true}),/qualified JOX/i);assert.equal(fs.readFileSync(path.join(f.destination,'keep'),'utf8'),'previous');
 }
});
test('JOX packaging refuses missing trio members and malformed provider bindings',t=>{
 for(const change of [f=>delete f.manifest.runtimeFiles['native/jox/jade-jox-test-helper-unicode.exe'],f=>delete f.manifest.runtimeFiles['native/jox/jadegitscm.dll'],f=>delete f.manifest.runtimeFiles['native/jox/jadegitdev.dll'],f=>f.manifest.joxRuntime.format=2,f=>f.manifest.joxRuntime.characterSet='ansi',f=>f.manifest.joxRuntime.engineCommit='unbound']){
  const f=joxFixture(t);change(f);f.save();assert.throws(()=>bundleCli({...f,requireJox:true}),/JOX/i);assert.equal(fs.existsSync(f.destination),false);
 }
});
test('JOX packaging preserves shared runtime assets and explicit unsupported Scratch without changing flags',t=>{
 const f=joxFixture(t),original=fs.readFileSync(path.join(f.source,'distribution.json'));
 bundleCli({...f,requireJox:true});assert.deepEqual(fs.readFileSync(path.join(f.destination,'distribution.json')),original);
 for(const relative of Object.keys(f.manifest.runtimeFiles))assert.deepEqual(fs.readFileSync(path.join(f.destination,relative)),fs.readFileSync(path.join(f.source,relative)));
 assert.equal(JSON.parse(original).joxRuntime.nativeScratch,false);
 fs.writeFileSync(path.join(f.source,'native/jox/jadegitscm.dll'),'tampered');assert.throws(()=>bundleCli({...f,requireJox:true}),/checksum/i);
 assert.deepEqual(fs.readFileSync(path.join(f.destination,'distribution.json')),original);
});

test('JOX basic package needs its reachable inspector trio and does not require retired debugger or CLS helpers',t=>{
 const f=joxFixture(t);
 for(const name of ['jade-test-helper.exe','jade-debug-helper.exe','jade-native-helper.exe','debugger-abi.json']){delete f.manifest.runtimeFiles['native/'+name];fs.unlinkSync(path.join(f.source,'native',name));}
 f.save();assert.doesNotThrow(()=>bundleCli({...f,requireJox:true}));
 for(const name of ['jade-inspect-helper-ansi.exe','jade-inspect-helper-unicode.exe','jade-inspect-helper.exe']){
  const missing=joxFixture(t);delete missing.manifest.runtimeFiles['native/'+name];missing.save();assert.throws(()=>bundleCli({...missing,requireJox:true}),/required native/i);
 }
});
