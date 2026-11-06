'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
for(const mode of ['normal','already-exited','still-running'])test('VSIX cleanup confirms owned broker exit: '+mode,t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-vsix-cleanup-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=fs.readFileSync(path.join(__dirname,'../../scripts/smoke-vsix.ps1'),'utf8').replaceAll('\r\n','\n');
 const match=source.match(/# Confirm owned broker exit before deleting its executable\.\n([\s\S]*?)# End owned broker exit wait\./);
 assert.ok(match,'Portable cleanup must wait for actual broker exit.');
 const script=path.join(root,'wait.ps1');
 fs.writeFileSync(script,"$ErrorActionPreference='Stop'\n$brokerPID=4242\n$script:observed=$false\nfunction Wait-Process { param($Id,$Timeout,$ErrorAction) if($Id -ne 4242 -or $Timeout -ne 5){throw 'Wrong process or bound'}; $script:observed=$true; if($env:WAIT_MODE -ne 'normal'){throw 'The owned process has not confirmed exit'} }\nfunction Get-Process { param($Id,$ErrorAction) if($env:WAIT_MODE -eq 'still-running') { return @{Id=$Id} } }\n"+match[1]+"\nif(-not $script:observed){throw 'No broker wait occurred'}\n'PASS owned broker wait'\n");
 const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',script],{encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,WAIT_MODE:mode}});
 assert.ifError(result.error);
 if(mode==='still-running'){assert.notEqual(result.status,0);assert.match(result.stderr,/not confirmed exit/);}
 else{assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS owned broker wait/);}
});
test('failed broker exit still restores the caller environment and retains the locked runtime',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-vsix-restore-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=fs.readFileSync(path.join(__dirname,'../../scripts/smoke-vsix.ps1'),'utf8').replaceAll('\r\n','\n');
 const cleanup=source.split('}finally{\n')[1].trim().replace(/\}\s*$/,'');
 const cli=path.join(root,'cli.ps1'),script=path.join(root,'restore.ps1'),temporary=path.join(root,'retained-runtime');fs.mkdirSync(temporary);
 fs.writeFileSync(cli,"$global:LASTEXITCODE=0\nif($args[0] -eq 'status'){'{\"brokerPID\":4242,\"passed\":true}'}else{'{\"passed\":true}'}\n");
 const literal=value=>"'"+value.replaceAll("'","''")+"'";
 fs.writeFileSync(script,"$ErrorActionPreference='Stop'\n$cli="+literal(cli)+"\n$temporary="+literal(temporary)+"\n$location=Get-Location\n$oldPath='original-path';$oldElectron='original-electron';$oldState='original-state'\n$env:PATH='temporary-path';$env:ELECTRON_RUN_AS_NODE='temporary-electron';$env:JADE_TOOLS_STATE_DIRECTORY='temporary-state'\nfunction Wait-Process {param($Id,$Timeout,$ErrorAction) throw 'broker still running'}\nfunction Get-Process {param($Id,$ErrorAction) return @{Id=$Id}}\n$caught=$false\ntry{\n"+cleanup+"\n}catch{$caught=$true}\nif(-not $caught){throw 'Expected live process rejection'}\nif($env:PATH -ne $oldPath -or $env:ELECTRON_RUN_AS_NODE -ne $oldElectron -or $env:JADE_TOOLS_STATE_DIRECTORY -ne $oldState){throw 'Caller environment was not restored'}\nif(-not(Test-Path -LiteralPath $temporary)){throw 'Live runtime was deleted'}\n'PASS restored environment'\n");
 const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',script],{encoding:'utf8',windowsHide:true,timeout:30000});
 assert.ifError(result.error);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS restored environment/);
});
