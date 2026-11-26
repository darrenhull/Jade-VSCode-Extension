'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {bundleCli}=require('../../scripts/bundle-cli.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-ansi-consumer-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'source'),destination=path.join(root,'destination');fs.mkdirSync(source);
 const jox={format:1,characterSet:'unicode',engineCommit:'a'.repeat(40),initialization:true,managedUpload:true,nativeTests:true,nativeScratch:false};
 const manifest={formatVersion:2,runtime:'native-cpp',platform:'win32',arch:'x64',packageVersion:'0.11.1',executable:'jade-cli.exe',oidFormat:'jade-native',joxRuntime:jox,runtimeFiles:{}};
 const put=(name,value)=>{const bytes=Buffer.from(value),file=path.join(source,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);if(name==='jade-cli.exe')manifest.executableSha256=hash(bytes);else manifest.runtimeFiles[name]=hash(bytes);};
 for(const name of ['jade-cli.exe','native/jade-inspect-helper.exe','native/jade-inspect-helper-ansi.exe','native/jade-inspect-helper-unicode.exe','native/jox/jade-jox-test-helper-unicode.exe','native/jox/jadegitscm.dll','native/jox/jadegitdev.dll'])put(name,name);
 const ansi={...jox,characterSet:'ansi'};jox.variants={ansi};
 const proof={format:1,characterSet:'ansi',engineCommit:jox.engineCommit,characterBytes:1,componentCharacterBytes:{'jadegitscm.dll':1,'jadegitdev.dll':1},build:{crt:'MT'},loaderDiagnostics:false,observedProvider:false,qualification:{initialization:true,managedUpload:true,nativeTests:true,nativeScratch:false},files:{}};
 for(const name of ['jade-jox-test-helper-ansi.exe','jadegitscm.dll','jadegitdev.dll']){put('native/jox/ansi/'+name,'ansi '+name);proof.files[name]=manifest.runtimeFiles['native/jox/ansi/'+name];}
 const proofPath='native/jox/ansi/runtime-provenance.json';
 const save=()=>{put(proofPath,JSON.stringify(proof));fs.writeFileSync(path.join(source,'distribution.json'),JSON.stringify(manifest));};save();
 const verify=()=>spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',path.resolve(__dirname,'../../scripts/VerifyNativeDistribution.ps1'),'-Directory',source,'-ExpectedDistribution',source],{encoding:'utf8',windowsHide:true});
 return {root,source,destination,manifest,proof,save,put,verify};
}
test('Primary sync requires an explicit matching producer flag without checkout initialization',t=>{
 const f=fixture(t),jox=f.manifest.joxRuntime,proof={qualification:{}};
 const save=()=>{f.put('native/jox/runtime-provenance.json',JSON.stringify(proof));f.save();};
 jox.sync=true;f.save();
 const reject=()=>{assert.throws(()=>bundleCli(f),/sync qualification/i);assert.notEqual(f.verify().status,0);};
 reject();
 for(const flag of [undefined,false,'true']){proof.qualification.sync=flag;save();reject();}
 proof.qualification.sync=true;save();reject();
 const files=Object.fromEntries(['jade-jox-test-helper-unicode.exe','jadegitscm.dll','jadegitdev.dll'].map(name=>[name,f.manifest.runtimeFiles['native/jox/'+name]]));
 Object.assign(proof,{format:1,characterSet:'unicode',engineCommit:jox.engineCommit,files});
 save();bundleCli(f);assert.equal(f.verify().status,0);
 proof.files={...files,'jadegitdev.dll':'0'.repeat(64)};save();reject();
 proof.files=files;proof.engineCommit='b'.repeat(40);save();reject();
 proof.engineCommit=jox.engineCommit;
  proof.qualification=[{sync:true}];save();reject();
 jox.sync='true';save();reject();
});
test('ANSI bundle rejects malformed or unqualified variants before replacing a prior payload',t=>{
 for(const mutate of [f=>f.manifest.joxRuntime.variants.ansi.nativeTests='true',f=>f.manifest.joxRuntime.variants.ansi.initialization=false,f=>f.manifest.joxRuntime.variants.ansi.characterSet='unicode',f=>f.manifest.joxRuntime.variants.ansi.engineCommit='b'.repeat(40),f=>delete f.manifest.runtimeFiles['native/jox/ansi/jadegitscm.dll'],f=>delete f.manifest.runtimeFiles['native/jox/ansi/runtime-provenance.json']]){
  const f=fixture(t);f.save();mutate(f);fs.writeFileSync(path.join(f.source,'distribution.json'),JSON.stringify(f.manifest));
  fs.mkdirSync(f.destination);fs.writeFileSync(path.join(f.destination,'keep'),'prior');assert.throws(()=>bundleCli(f),/ANSI/i);assert.equal(fs.readFileSync(path.join(f.destination,'keep'),'utf8'),'prior');
 }
});
test('ANSI bundle and post-package verifier preserve every nested payload/proof hash and Unicode identity',t=>{
 const f=fixture(t),before=fs.readFileSync(path.join(f.source,'distribution.json'));bundleCli(f);
 assert.deepEqual(fs.readFileSync(path.join(f.destination,'distribution.json')),before);
 for(const relative of Object.keys(f.manifest.runtimeFiles))assert.deepEqual(fs.readFileSync(path.join(f.destination,relative)),fs.readFileSync(path.join(f.source,relative)));
 const result=f.verify();assert.equal(result.status,0,result.stderr);
 fs.writeFileSync(path.join(f.source,'native/jox/ansi/jadegitdev.dll'),'tamper');assert.throws(()=>bundleCli(f),/checksum/i);assert.notEqual(f.verify().status,0);
});
test('Git-first package checks bind each enabled mode to its seed and exact CLI',t=>{
 const f=fixture(t),jox=f.manifest.joxRuntime,ansi=jox.variants.ansi,sha='a'.repeat(64);
 const qualify=(mode,proof)=>{
  const seed={platform:'25.0.1',jomSha256:sha,controlSha256:sha,monitorSha256:sha};
  Object.assign(mode,{sync:true,checkoutInitialization:true,checkoutSeed:seed});
  Object.assign(proof.qualification,{sync:true,checkoutInitialization:true});
  proof.checkoutProof={format:1,cliSha256:f.manifest.executableSha256,receiptSha256:sha,seed:{...seed},files:{...proof.files},checks:Object.fromEntries(['sourceFreeSetup','restart','branchRoundTrip','savedEditRoundTrip','noOp','isolation','unsupportedChangeRefused'].map(key=>[key,true]))};
 };
 const unicodeProof={format:1,characterSet:jox.characterSet,engineCommit:jox.engineCommit,qualification:{},files:Object.fromEntries(['jade-jox-test-helper-unicode.exe','jadegitscm.dll','jadegitdev.dll'].map(name=>[name,f.manifest.runtimeFiles['native/jox/'+name]]))};qualify(jox,unicodeProof);qualify(ansi,f.proof);
 const save=()=>{f.put('native/jox/runtime-provenance.json',JSON.stringify(unicodeProof));f.save();};save();
 bundleCli(f);const valid=f.verify();assert.equal(valid.status,0,valid.stderr);
 for(const [target,key] of [[f.proof.checkoutProof,'receiptSha256'],[ansi.checkoutSeed,'platform'],[ansi.checkoutSeed,'jomSha256']]){
  const original=target[key];target[key]+='\n';save();
  assert.throws(()=>bundleCli(f),/Git-first/i);const result=f.verify();assert.notEqual(result.status,0);assert.match(result.stderr,/Git-first/i);
  target[key]=original;
 }
 for(const [target,key,bad] of [[f.proof.checkoutProof,'cliSha256',sha],[f.proof.checkoutProof.seed,'monitorSha256','b'.repeat(64)],[unicodeProof.checkoutProof.checks,'restart',false],[f.proof.checkoutProof.files,'jadegitdev.dll',sha],[unicodeProof.files,'jadegitscm.dll',sha],[jox,'sync','true']]){
  const original=target[key],diagnostic=key==='sync'||target===unicodeProof.files?/Git-first|sync qualification/i:/Git-first/i;
  target[key]=bad;save();assert.throws(()=>bundleCli(f),diagnostic);const result=f.verify();assert.notEqual(result.status,0);assert.match(result.stderr,diagnostic);target[key]=original;
 }
});
test('ANSI proof, descriptor, DLL-width and per-mode qualification mismatches are rejected in bundle and verifier',t=>{
 for(const mutate of [f=>f.manifest.joxRuntime.variants=null,f=>f.manifest.joxRuntime.variants.ansi=null,f=>f.proof.build=[{crt:'MT'}],f=>f.proof.characterBytes='1',f=>f.proof.componentCharacterBytes['jadegitdev.dll']=2,f=>f.proof.componentCharacterBytes.extra=1,f=>f.proof.build.crt='MD',f=>f.proof.loaderDiagnostics=true,f=>f.proof.qualification.nativeTests=false,f=>f.proof.files['jadegitscm.dll']='0'.repeat(64),f=>delete f.manifest.joxRuntime.variants,f=>f.manifest.joxRuntime.variants.ansi.nativeScratch=true]){
  const f=fixture(t);mutate(f);f.save();assert.throws(()=>bundleCli(f),/ANSI/i);const result=f.verify();assert.notEqual(result.status,0);assert.match(result.stderr,/ANSI/i);
 }
});

test('atomic updater preserves all ANSI members and refuses bad variant metadata without replacing the pin or payload',t=>{
 const f=fixture(t),runner=path.join(f.root,'atomic.ps1'),updater=path.resolve(__dirname,'../../scripts/update-native-cli.ps1');
 fs.writeFileSync(runner,`param($Updater,$Source,$Target,$ArchiveRoot)
$ErrorActionPreference='Stop'
. $Updater
$good=Join-Path $ArchiveRoot 'good.zip';Compress-Archive -Path (Join-Path $Source '*') -DestinationPath $good
$installed=Install-NativeRelease -Root $Target -Archive $good -ExpectedHash (Get-FileHash $good).Hash -Version '0.11.1'
if(!$installed.updated){throw 'ANSI fixture was not installed'}
$payload=Join-Path $Target 'packages/jade-cli-win-x64';$pin=Join-Path $Target 'packages/jade-cli-pin.json'
$pinBefore=[IO.File]::ReadAllBytes($pin);$manifestBefore=[IO.File]::ReadAllBytes((Join-Path $payload 'distribution.json'))
$m=Get-Content (Join-Path $Source 'distribution.json') -Raw|ConvertFrom-Json -AsHashtable
foreach($entry in $m.runtimeFiles.GetEnumerator()){if((Get-FileHash -LiteralPath (Join-Path $payload $entry.Key)).Hash.ToLowerInvariant() -cne $entry.Value){throw 'ANSI install lost a manifest member'}}
$m.joxRuntime.variants.ansi.nativeTests='true';[IO.File]::WriteAllText((Join-Path $Source 'distribution.json'),($m|ConvertTo-Json -Depth 12))
$bad=Join-Path $ArchiveRoot 'bad.zip';Compress-Archive -Path (Join-Path $Source '*') -DestinationPath $bad
$refused=$false;try{Install-NativeRelease -Root $Target -Archive $bad -ExpectedHash (Get-FileHash $bad).Hash -Version '0.11.1'|Out-Null}catch{if($_.Exception.Message -notmatch 'ANSI'){throw};$refused=$true}
if(!$refused){throw 'Atomic updater accepted malformed ANSI purpose'}
if([Convert]::ToBase64String([IO.File]::ReadAllBytes($pin)) -cne [Convert]::ToBase64String($pinBefore) -or [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $payload 'distribution.json'))) -cne [Convert]::ToBase64String($manifestBefore)){throw 'Rejected ANSI update changed the previous pin or payload'}
Write-Output 'PASS ANSI atomic update and retained previous receipt'
`);
 const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',runner,updater,f.source,path.join(f.root,'consumer'),f.root],{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/PASS ANSI atomic/);
});

test('explicit qualified ANSI scratch is accepted while nonboolean or producer mismatch remains refused',t=>{
 const f=fixture(t);f.manifest.joxRuntime.variants.ansi.nativeScratch=true;f.proof.qualification.nativeScratch=true;f.save();bundleCli(f);assert.equal(f.verify().status,0);
 for(const bad of [false,'true',undefined]){f.proof.qualification.nativeScratch=bad;f.save();assert.throws(()=>bundleCli(f),/ANSI/i);assert.notEqual(f.verify().status,0);}
});

test('released ANSI disabled debugger declaration is preserved without enabling debugger support',t=>{
 const f=fixture(t);f.manifest.joxRuntime.variants.ansi.nativeDebug=false;f.save();bundleCli(f);const accepted=f.verify();assert.equal(accepted.status,0,accepted.stderr);
 for(const bad of [true,'false',0]){f.manifest.joxRuntime.variants.ansi.nativeDebug=bad;f.save();assert.throws(()=>bundleCli(f),/ANSI/i);assert.notEqual(f.verify().status,0);}
});
