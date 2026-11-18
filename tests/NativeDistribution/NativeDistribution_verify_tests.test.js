'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-vsix-native-integrity-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const directory=path.join(root,'bundle');fs.mkdirSync(path.join(directory,'native'),{recursive:true});const names=['jade-cli.exe',...['jade-test-helper.exe','jade-debug-helper.exe','jade-inspect-helper.exe','jade-native-helper.exe','debugger-abi.json'].map(name=>'native/'+name)];for(const name of names)fs.writeFileSync(path.join(directory,name),'original '+name);const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');const manifest={formatVersion:2,runtime:'native-cpp',platform:'win32',arch:'x64',executable:'jade-cli.exe',packageVersion:'0.3.1',executableSha256:hash(fs.readFileSync(path.join(directory,'jade-cli.exe'))),runtimeFiles:Object.fromEntries(names.slice(1).map(name=>[name,hash(fs.readFileSync(path.join(directory,name)))]))};const pinFile=path.join(root,'pin.json');function save(){const bytes=Buffer.from(JSON.stringify(manifest,null,2).replace(/\n/g,'\r\n')+'\r\n');fs.writeFileSync(path.join(directory,'distribution.json'),bytes);fs.writeFileSync(pinFile,JSON.stringify({version:manifest.packageVersion,tag:'v'+manifest.packageVersion,sha256:'a'.repeat(64),distributionSha256:hash(bytes)}));}save();const run=(extra=[])=>spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',path.resolve(__dirname,'../../scripts/VerifyNativeDistribution.ps1'),'-Directory',directory,'-PinFile',pinFile,...extra],{encoding:'utf8',windowsHide:true});return {root,directory,manifest,save,run};}
test('post-package native distribution verification accepts exact official manifest receipt and all native hashes',t=>{const f=fixture(t),r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/PASS native distribution receipt and runtime hashes/);});
test('post-package verification rejects line-ending normalization that breaks the official receipt',t=>{const f=fixture(t),file=path.join(f.directory,'distribution.json');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'));const r=f.run();assert.notEqual(r.status,0);assert.match(r.stderr,/manifest receipt/i);});
test('post-package verification rejects corrupted helpers and unsafe manifest paths',t=>{for(const kind of ['helper','traversal','missing']){const f=fixture(t);if(kind==='helper')fs.writeFileSync(path.join(f.directory,'native/jade-test-helper.exe'),'modified');if(kind==='traversal'){f.manifest.runtimeFiles['../outside']='b'.repeat(64);f.save();}if(kind==='missing'){delete f.manifest.runtimeFiles['native/debugger-abi.json'];f.save();}const r=f.run();assert.notEqual(r.status,0);assert.match(r.stderr,/checksum|runtime path|required native/i);}});

test('explicit candidate verification is labelled separately from an official release pin',t=>{
 const f=fixture(t),r=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',path.resolve(__dirname,'../../scripts/VerifyNativeDistribution.ps1'),'-Directory',f.directory,'-ExpectedDistribution',f.directory],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/not an official release pin/);
});

function joxFixture(t){
 const f=fixture(t);f.manifest.packageVersion='0.11.0';f.manifest.oidFormat='jade-native';
 f.manifest.joxRuntime={format:1,characterSet:'unicode',engineCommit:'a'.repeat(40),initialization:true,managedUpload:true,nativeTests:true,nativeScratch:false};
 for(const name of ['jade-test-helper.exe','jade-debug-helper.exe','jade-native-helper.exe','debugger-abi.json']){delete f.manifest.runtimeFiles['native/'+name];fs.unlinkSync(path.join(f.directory,'native',name));}
 for(const relative of ['native/jade-inspect-helper-ansi.exe','native/jade-inspect-helper-unicode.exe','native/jox/jade-jox-test-helper-unicode.exe','native/jox/jadegitscm.dll','native/jox/jadegitdev.dll']){
  const file=path.join(f.directory,relative),bytes=Buffer.from('synthetic package fixture '+relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);f.manifest.runtimeFiles[relative]=crypto.createHash('sha256').update(bytes).digest('hex');
 }
 f.save();return f;
}
test('post-package JOX verification accepts only the reachable inspector and managed runtime tuple',t=>{
 const f=joxFixture(t),r=f.run(['-RequireJox']);assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/PASS native distribution/);
});
test('post-package JOX verification rejects missing inspectors, incomplete managed tuple, false qualification and tampering',t=>{
 for(const kind of ['inspector','scm','qualification','tamper']){
  const f=joxFixture(t);
  if(kind==='inspector')delete f.manifest.runtimeFiles['native/jade-inspect-helper-unicode.exe'];
  if(kind==='scm')delete f.manifest.runtimeFiles['native/jox/jadegitscm.dll'];
  if(kind==='qualification')f.manifest.joxRuntime.nativeTests=false;
  f.save();if(kind==='tamper')fs.writeFileSync(path.join(f.directory,'native/jox/jadegitdev.dll'),'modified');
  const r=f.run(['-RequireJox']);assert.notEqual(r.status,0);assert.match(r.stderr,/required native|JOX|checksum/i);
 }
});

test('post-package JOX verification refuses a string masquerading as qualification',t=>{
 const f=joxFixture(t);f.manifest.joxRuntime.nativeTests='true';f.save();const r=f.run(['-RequireJox']);assert.notEqual(r.status,0);assert.match(r.stderr,/qualified JOX/i);
});
