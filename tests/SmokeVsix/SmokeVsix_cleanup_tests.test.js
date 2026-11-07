'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
function fixture(t,mode){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-smoke-boundary-'));t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true});});
 const archive=path.join(root,'archive'),vendor=path.join(archive,'extension/vendor/jade-tools-cli');fs.mkdirSync(path.join(vendor,'native'),{recursive:true});
 const names=['jade-cli.exe',...['jade-test-helper.exe','jade-debug-helper.exe','jade-inspect-helper.exe','jade-native-helper.exe','debugger-abi.json'].map(name=>'native/'+name)];for(const name of names)fs.writeFileSync(path.join(vendor,name),'inert fixture: never execute '+name);
 const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),manifest={formatVersion:2,runtime:'native-cpp',platform:'win32',arch:'x64',executable:'jade-cli.exe',packageVersion:'0.3.1',executableSha256:hash(fs.readFileSync(path.join(vendor,'jade-cli.exe'))),runtimeFiles:Object.fromEntries(names.slice(1).map(name=>[name,hash(fs.readFileSync(path.join(vendor,name)))]))};
 const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n'),pinFile=path.join(root,'pin.json');fs.writeFileSync(path.join(vendor,'distribution.json'),mode==='manifest'?Buffer.concat([bytes,Buffer.from('\n')]):bytes);fs.writeFileSync(pinFile,JSON.stringify({version:'0.3.1',tag:'v0.3.1',sha256:'a'.repeat(64),distributionSha256:hash(bytes)}));if(mode==='helper')fs.writeFileSync(path.join(vendor,'native/jade-test-helper.exe'),'modified inert fixture');
 const zipScript=path.join(root,'zip.ps1'),vsix=path.join(root,'fixture.vsix');fs.writeFileSync(zipScript,'param($Directory,$Vsix)\n[IO.Compression.ZipFile]::CreateFromDirectory($Directory,$Vsix)');const zipped=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',zipScript,'-Directory',archive,'-Vsix',vsix],{encoding:'utf8',windowsHide:true});assert.equal(zipped.status,0,zipped.stderr);
 const original=fs.readFileSync(path.resolve(__dirname,'../../scripts/smoke-vsix.ps1'),'utf8');
 // Instrument only the external process boundary, never launch fixture binaries.
 // Refuse to run if any CLI invocation was not replaced by the recording fake.
 const nativeCalls=original.match(/&\s+\$cli\b/g)||[];assert.equal(nativeCalls.length,3);assert.doesNotMatch(original,/Start-Process|ProcessStartInfo/);
 let script=original.replace(/&\s+\$cli\b/g,'Invoke-TestNative');assert.equal(/&\s*\$cli\b/.test(script),false);
 if(mode==='setup'){const marker=" $workspace=Join-Path $temporary 'workspace';";assert.ok(script.includes(marker));script=script.replace(marker," throw 'fixture setup failed'\n"+marker);}
 const smoke=path.join(root,'smoke.ps1');fs.writeFileSync(smoke,script);fs.copyFileSync(path.resolve(__dirname,'../../scripts/VerifyNativeDistribution.ps1'),path.join(root,'VerifyNativeDistribution.ps1'));
 const calls=path.join(root,'calls.jsonl'),sentinel=path.join(root,'shared-broker-sentinel'),sharedState=path.join(root,'shared-state'),sharedConnections=path.join(root,'shared-connections.json'),after=path.join(root,'after.json');fs.writeFileSync(sentinel,'running');fs.writeFileSync(sharedConnections,'unchanged');
 const config=path.join(root,'fixture.json');fs.writeFileSync(config,JSON.stringify({mode,smoke,vsix,pinFile,calls,sentinel,sharedState,sharedConnections,after}));
 const wrapper=path.join(root,'wrapper.ps1');fs.writeFileSync(wrapper,String.raw`$ErrorActionPreference='Stop'
$fixture=Get-Content -LiteralPath $env:SMOKE_FIXTURE -Raw | ConvertFrom-Json
$env:JADE_TOOLS_STATE_DIRECTORY=$fixture.sharedState
$env:JADE_TOOLS_CONNECTIONS_FILE=$fixture.sharedConnections
$env:ELECTRON_RUN_AS_NODE='original-electron'
function Invoke-TestNative {
 $global:LASTEXITCODE=0
 $event=@{arguments=@($args);state=$env:JADE_TOOLS_STATE_DIRECTORY;connections=$env:JADE_TOOLS_CONNECTIONS_FILE}
 [IO.File]::AppendAllText($fixture.calls,($event|ConvertTo-Json -Compress)+[Environment]::NewLine)
 if($args[0] -eq 'tests'){if($fixture.mode -eq 'timeout'){$env:JADE_TOOLS_STATE_DIRECTORY=$fixture.sharedState;$env:JADE_TOOLS_CONNECTIONS_FILE=$fixture.sharedConnections;throw 'fixture native timeout'};return '{"passed":true,"rows":[{"owner":"PortableTests","method":"portableProbe"}]}'}
 if($args[0] -eq 'status'){return '{"brokerPID":12345}'}
 if($args[0] -eq 'shutdown'){if($env:JADE_TOOLS_STATE_DIRECTORY -eq $fixture.sharedState){[IO.File]::WriteAllText($fixture.sentinel,'stopped')};return '{}'}
 throw 'Unexpected fake native invocation'
}
function Wait-Process {param($Id,$Timeout,$ErrorAction)}
function Get-Process {param($Id,$ErrorAction)}
$exitStatus=0
try{& $fixture.smoke -Vsix $fixture.vsix -PinFile $fixture.pinFile}catch{[Console]::Error.WriteLine($_.Exception.Message);$exitStatus=1}finally{@{state=$env:JADE_TOOLS_STATE_DIRECTORY;connections=$env:JADE_TOOLS_CONNECTIONS_FILE;electron=$env:ELECTRON_RUN_AS_NODE}|ConvertTo-Json|Set-Content -LiteralPath $fixture.after}
exit $exitStatus
`);
 const run=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',wrapper],{windowsHide:true,encoding:'utf8',timeout:20000,env:{...process.env,SMOKE_FIXTURE:config}});assert.ifError(run.error);
 return {root,run,sharedState,sharedConnections,sentinel:fs.readFileSync(sentinel,'utf8'),connections:fs.readFileSync(sharedConnections,'utf8'),after:JSON.parse(fs.readFileSync(after,'utf8')),calls:fs.existsSync(calls)?fs.readFileSync(calls,'utf8').trim().split(/\r?\n/).map(JSON.parse):[]};
}
for(const mode of ['manifest','helper','setup'])test('rejected or uninitialized '+mode+' smoke never executes a payload or touches inherited broker state',{skip:process.platform!=='win32'},t=>{const f=fixture(t,mode);assert.notEqual(f.run.status,0,f.run.stdout);assert.equal(f.calls.length,0,JSON.stringify(f.calls));assert.equal(f.sentinel,'running');assert.equal(f.connections,'unchanged');assert.equal(f.after.state,f.sharedState);assert.equal(f.after.connections,f.sharedConnections);assert.equal(f.after.electron,'original-electron');});
for(const mode of ['success','timeout'])test(mode+' smoke cleans up only its verified private broker and restores caller context',{skip:process.platform!=='win32'},t=>{const f=fixture(t,mode);assert.equal(f.run.status,mode==='success'?0:1,f.run.stdout+f.run.stderr);assert.deepEqual(f.calls.map(call=>call.arguments[0]),['tests','status','shutdown']);assert.ok(f.calls.every(call=>call.state!==f.sharedState&&call.state.includes('jade-vsix-portable-')&&call.state.endsWith(path.sep+'broker')));assert.equal(new Set(f.calls.map(call=>call.state)).size,1);assert.ok(f.calls.every(call=>call.connections!==f.sharedConnections&&path.dirname(call.connections)===path.dirname(call.state)));assert.equal(f.sentinel,'running');assert.equal(f.after.state,f.sharedState);assert.equal(f.after.connections,f.sharedConnections);assert.equal(f.after.electron,'original-electron');});
