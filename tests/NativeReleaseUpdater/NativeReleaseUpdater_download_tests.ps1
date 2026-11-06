$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../../scripts/update-native-cli.ps1')
function Reject($Action,$Pattern){try{& $Action;throw 'Expected rejection was missing'}catch{if($_.Exception.Message -notmatch $Pattern){throw}}}
$script:release=@{tag_name='v0.2.0';draft=$false;prerelease=$false;assets=@(@{name='jade-cli-win-x64.zip';size=1024;browser_download_url='https://github.com/darrenhull/Jade-CLI/releases/download/v0.2.0/jade-cli-win-x64.zip'},@{name='SHA256SUMS';size=100;browser_download_url='https://github.com/darrenhull/Jade-CLI/releases/download/v0.2.0/SHA256SUMS'})}
function Invoke-RestMethod {param($Uri,$Headers) $script:requestedHeaders=$Headers;return $script:release}
$oldToken=$env:GH_TOKEN
try{
 $env:GH_TOKEN='native-updater-test-token'
 $metadata=Get-NativeRelease 'v0.2.0';if($metadata.release.tag_name -ne 'v0.2.0'){throw 'Trusted release metadata was changed'}
 if($script:requestedHeaders.Authorization -ne 'Bearer native-updater-test-token'){throw 'The configured workflow token was not used for release metadata.'}
 Reject {Get-NativeRelease '../../main'} 'tag'
 $script:release.assets[0].browser_download_url='https://attacker.example/jade-cli-win-x64.zip';Reject {Get-NativeRelease 'v0.2.0'} 'Untrusted'
 $script:release.assets[0].browser_download_url='https://github.com/darrenhull/Jade-CLI/releases/download/v0.2.0/jade-cli-win-x64.zip';$script:release.assets[0].size=268435457;Reject {Get-NativeRelease 'v0.2.0'} 'oversized'
 $script:release.assets[0].size=1024;$script:release.prerelease=$true;Reject {Get-NativeRelease 'v0.2.0'} 'stable'
 $script:release.prerelease=$false;$script:release.assets+=@{name='jade-cli-win-x64.zip';size=1};Reject {Get-NativeRelease 'v0.2.0'} 'duplicated'
 Write-Output 'PASS NativeReleaseUpdater downloads: trusted metadata, tag traversal, untrusted origin, oversized assets, prerelease and duplicate assets'
}finally{$env:GH_TOKEN=$oldToken;Remove-Item Function:\Invoke-RestMethod}
