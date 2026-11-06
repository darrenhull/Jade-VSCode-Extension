#requires -Version 7.0
param([Parameter(Mandatory)][string]$Directory,[string]$PinFile,[string]$ExpectedDistribution)
$ErrorActionPreference='Stop'
$directoryRoot=[IO.Path]::GetFullPath($Directory)
$manifestFile=Join-Path $directoryRoot 'distribution.json'
$manifest=Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json -AsHashtable
if($manifest.formatVersion -ne 2 -or $manifest.runtime -ne 'native-cpp' -or $manifest.platform -ne 'win32' -or $manifest.arch -ne 'x64' -or $manifest.executable -ne 'jade-cli.exe'){throw 'A native Windows x64 distribution is required.'}
$manifestHash=(Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash
if($ExpectedDistribution){
 if($PinFile){throw 'Choose an official pin or an explicit candidate distribution, not both.'}
 $expectedHash=(Get-FileHash -LiteralPath (Join-Path $ExpectedDistribution 'distribution.json') -Algorithm SHA256).Hash
}else{
 if(!$PinFile){$PinFile=Join-Path $PSScriptRoot '../packages/jade-cli-pin.json'}
 $pin=Get-Content -LiteralPath $PinFile -Raw | ConvertFrom-Json
 if($pin.version -ne $manifest.packageVersion -or $pin.tag -ne ('v'+$pin.version) -or $pin.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or $pin.distributionSha256 -notmatch '^[a-fA-F0-9]{64}$'){throw 'The native manifest receipt version or archive pin is invalid.'}
 $expectedHash=$pin.distributionSha256
}
if($manifestHash -ne $expectedHash){throw 'The packaged manifest receipt does not match the verified distribution bytes.'}
foreach($required in @('jade-test-helper.exe','jade-debug-helper.exe','jade-inspect-helper.exe','jade-native-helper.exe','debugger-abi.json')){if(!$manifest.runtimeFiles.ContainsKey('native/'+$required)){throw "Required native runtime asset is missing: $required"}}
$runtime=@{};foreach($entry in $manifest.runtimeFiles.GetEnumerator()){$runtime[$entry.Key]=$entry.Value};$runtime['jade-cli.exe']=$manifest.executableSha256
foreach($entry in $runtime.GetEnumerator()){
 $relative=[string]$entry.Key
 if([IO.Path]::IsPathRooted($relative) -or $relative.Contains('\') -or @($relative.Split('/')|Where-Object {$_ -in @('','.','..')}).Count -gt 0 -or $entry.Value -notmatch '^[a-fA-F0-9]{64}$'){throw "Invalid native runtime path or checksum: $relative"}
 $file=[IO.Path]::GetFullPath((Join-Path $directoryRoot $relative))
 if(!$file.StartsWith($directoryRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath $file -PathType Leaf)){throw "Invalid native runtime path: $relative"}
 if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.Value){throw "Native runtime checksum mismatch: $relative"}
}
if($ExpectedDistribution){'PASS explicit candidate manifest bytes and runtime hashes (not an official release pin)'}else{'PASS native distribution receipt and runtime hashes'}
