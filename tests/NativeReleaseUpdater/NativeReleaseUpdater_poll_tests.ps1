$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../../scripts/update-native-cli.ps1')
$temporary=Join-Path ([IO.Path]::GetTempPath()) ('jade-poll-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($temporary)|Out-Null
try{
 $payload=Join-Path $temporary 'payload';[IO.Directory]::CreateDirectory($payload)|Out-Null
 [IO.File]::WriteAllText((Join-Path $payload 'jade-cli.exe'),'published CLI bytes')
 $manifest=@{formatVersion=2;runtime='native-cpp';platform='win32';arch='x64';packageVersion='0.3.0';executable='jade-cli.exe';executableSha256=(Get-FileHash (Join-Path $payload 'jade-cli.exe')).Hash.ToLowerInvariant();runtimeFiles=@{}}
 [IO.Directory]::CreateDirectory((Join-Path $payload 'native'))|Out-Null
 foreach($helper in @('jade-test-helper.exe','jade-debug-helper.exe','jade-inspect-helper.exe','jade-native-helper.exe','debugger-abi.json')){$relative='native/'+$helper;$file=Join-Path $payload $relative;[IO.File]::WriteAllText($file,'verified '+$helper);$manifest.runtimeFiles[$relative]=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}
 [IO.File]::WriteAllText((Join-Path $payload 'distribution.json'),($manifest|ConvertTo-Json -Depth 5))
 $script:archive=Join-Path $temporary 'release.zip';Compress-Archive -Path (Join-Path $payload '*') -DestinationPath $script:archive;$script:hash=(Get-FileHash $script:archive).Hash
 function Get-NativeRelease {param($Tag) return @{release=@{tag_name='v0.3.0'};asset=@{browser_download_url='archive'};checks=@{browser_download_url='checks'}}}
 $script:zipDownloads=0
 function Save-NativeDownload {param($Url,$File,$MaxBytes) if($Url -eq 'checks'){[IO.File]::WriteAllText($File,($script:hash+'  jade-cli-win-x64.zip'))}else{$script:zipDownloads++;Copy-Item -LiteralPath $script:archive -Destination $File}}
 $consumer=Join-Path $temporary 'consumer';[IO.Directory]::CreateDirectory($consumer)|Out-Null
 $first=Update-NativeRelease -Root $consumer
 if(!$first.updated -or $first.version -ne '0.3.0' -or $script:zipDownloads -ne 1){throw 'A newly published CLI release was not installed'}
 $second=Update-NativeRelease -Root $consumer
 if($second.updated -or $script:zipDownloads -ne 1){throw 'Unchanged verified release downloaded its ZIP again'}
 [IO.File]::WriteAllText((Join-Path $consumer 'packages/jade-cli-win-x64/jade-cli.exe'),'corrupt')
 $repair=Update-NativeRelease -Root $consumer
 if(!$repair.updated -or $script:zipDownloads -ne 2){throw 'Corrupt local payload was skipped instead of repaired'}
 Write-Output 'PASS NativeReleaseUpdater polling detects publication, skips unchanged ZIP downloads and repairs corrupt payloads'
}finally{Remove-Item -LiteralPath $temporary -Recurse -Force}
