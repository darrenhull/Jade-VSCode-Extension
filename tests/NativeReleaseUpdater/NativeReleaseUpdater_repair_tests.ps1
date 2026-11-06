$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../../scripts/update-native-cli.ps1')
$root=Join-Path ([IO.Path]::GetTempPath()) ('jade-native-updater-repair-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$failures=@()
try{
 $payload=Join-Path $root 'payload';[IO.Directory]::CreateDirectory($payload)|Out-Null
 [IO.File]::WriteAllText((Join-Path $payload 'jade-cli.exe'),'verified native payload')
 $manifest=@{formatVersion=2;runtime='native-cpp';platform='win32';arch='x64';packageVersion='0.2.0';executable='jade-cli.exe';executableSha256=(Get-FileHash (Join-Path $payload 'jade-cli.exe')).Hash.ToLowerInvariant();runtimeFiles=@{}}
 [IO.Directory]::CreateDirectory((Join-Path $payload 'native'))|Out-Null
 foreach($helper in @('jade-test-helper.exe','jade-debug-helper.exe','jade-inspect-helper.exe','jade-native-helper.exe','debugger-abi.json')){$relative='native/'+$helper;$file=Join-Path $payload $relative;[IO.File]::WriteAllText($file,'verified '+$helper);$manifest.runtimeFiles[$relative]=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}
 [IO.File]::WriteAllText((Join-Path $payload 'distribution.json'),($manifest|ConvertTo-Json -Depth 5))
 $archive=Join-Path $root 'native.zip';Compress-Archive -Path (Join-Path $payload '*') -DestinationPath $archive;$hash=(Get-FileHash $archive).Hash
 foreach($scenario in @('missing','tampered','missing-receipt')){
  try{
   $consumer=Join-Path $root $scenario;[IO.Directory]::CreateDirectory($consumer)|Out-Null
   Install-NativeRelease -Root $consumer -Archive $archive -ExpectedHash $hash -Version '0.2.0'|Out-Null
   $native=Join-Path $consumer 'packages/jade-cli-win-x64'
   if($scenario -eq 'missing'){Assert-NativeContained $consumer $native;Remove-Item -LiteralPath $native -Recurse -Force}
   elseif($scenario -eq 'tampered'){[IO.File]::WriteAllText((Join-Path $native 'jade-cli.exe'),'tampered native bytes')}
   else{$pinPath=Join-Path $consumer 'packages/jade-cli-pin.json';$legacy=Get-Content -LiteralPath $pinPath -Raw|ConvertFrom-Json -AsHashtable;$legacy.Remove('distributionSha256');[IO.File]::WriteAllText($pinPath,($legacy|ConvertTo-Json))}
   $pin=Join-Path $consumer 'packages/jade-cli-pin.json';$originalPin=[IO.File]::ReadAllText($pin)
   $failed=$false;try{Install-NativeRelease -Root $consumer -Archive $archive -ExpectedHash ('0'*64) -Version '0.2.0'|Out-Null}catch{$failed=$true}
   if(!$failed -or [IO.File]::ReadAllText($pin) -ne $originalPin){throw 'A failed repair must retain the prior pin'}
   if($scenario -eq 'tampered' -and [IO.File]::ReadAllText((Join-Path $native 'jade-cli.exe')) -ne 'tampered native bytes'){throw 'A failed repair must retain the existing installation'}
   $downgraded=$false;try{Install-NativeRelease -Root $consumer -Archive $archive -ExpectedHash $hash -Version '0.1.0'|Out-Null}catch{$downgraded=$_.Exception.Message -match 'downgrade'}
   if(!$downgraded){throw 'The retained pin must prohibit downgrades when the runtime is missing or corrupt'}
   $repaired=Install-NativeRelease -Root $consumer -Archive $archive -ExpectedHash $hash -Version '0.2.0'
   if(!$repaired.updated){throw "Matching pin incorrectly skipped $scenario runtime repair"}
   Test-NativeDistribution $native|Out-Null
   $receipt=Get-Content -LiteralPath $pin -Raw|ConvertFrom-Json
   if($receipt.distributionSha256 -ne (Get-FileHash -LiteralPath (Join-Path $native 'distribution.json') -Algorithm SHA256).Hash){throw 'The installed manifest is not bound to the verified archive receipt'}
   if([IO.File]::ReadAllText((Join-Path $native 'jade-cli.exe')) -ne 'verified native payload'){throw 'Repair did not restore the verified payload'}
   $unchanged=Install-NativeRelease -Root $consumer -Archive $archive -ExpectedHash $hash -Version '0.2.0'
   if($unchanged.updated){throw 'A healthy repaired runtime should be reused'}
  }catch{$failures+=($scenario+': '+$_.Exception.Message)}
 }
 if($failures.Count){throw ($failures -join "`n")}
 Write-Output 'PASS NativeReleaseUpdater repairs missing and tampered runtimes despite a matching pin'
}finally{Remove-Item -LiteralPath $root -Recurse -Force}
