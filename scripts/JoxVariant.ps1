function Test-JoxCheckoutSeed($Seed){
 if($Seed -isnot [Collections.IDictionary] -or $Seed.Count -ne 4 -or $Seed.platform -isnot [string] -or $Seed.platform -cnotmatch '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$'){return $false}
 foreach($key in @('jomSha256','controlSha256','monitorSha256')){if($Seed[$key] -isnot [string] -or $Seed[$key] -cnotmatch '^[a-f0-9]{64}$'){return $false}}
 return $true
}
function Assert-JoxCheckoutProof([Collections.IDictionary]$Runtime,$Producer,[Collections.IDictionary]$Manifest){
 $enabled=$Runtime.checkoutInitialization -is [bool] -and $Runtime.checkoutInitialization
 if(($Runtime.Contains('checkoutInitialization') -and $Runtime.checkoutInitialization -isnot [bool]) -or (!$enabled -and $Runtime.Contains('checkoutSeed'))){throw 'Invalid Git-first checkout declaration or vendor seed.'}
 $qualification=$Producer.qualification
 if(($qualification -is [Collections.IDictionary] -and $qualification.Contains('checkoutInitialization') -and $qualification.checkoutInitialization -isnot [bool]) -or
    $enabled -ne ($qualification.checkoutInitialization -is [bool] -and $qualification.checkoutInitialization) -or
    (!$enabled -and $Producer -is [Collections.IDictionary] -and $Producer.Contains('checkoutProof'))){throw 'Git-first producer qualification differs from its declaration.'}
 if(!$enabled){return}
 foreach($flag in @('managedUpload','nativeTests','sync')){if($Runtime[$flag] -isnot [bool] -or !$Runtime[$flag]){throw 'Git-first checkout requires qualified upload, sync and native tests.'}}
 $seed=$Runtime.checkoutSeed;$proof=$Producer.checkoutProof
 if($Producer -isnot [Collections.IDictionary] -or $qualification -isnot [Collections.IDictionary] -or $qualification.sync -isnot [bool] -or !$qualification.sync -or !(Test-JoxCheckoutSeed $seed) -or $proof -isnot [Collections.IDictionary] -or $proof.Count -ne 6 -or
    ($proof.format -isnot [int] -and $proof.format -isnot [long]) -or $proof.format -ne 1 -or $proof.cliSha256 -isnot [string] -or $proof.cliSha256 -cnotmatch '^[a-f0-9]{64}$' -or
    $proof.cliSha256 -cne $Manifest.executableSha256.ToLowerInvariant() -or $proof.receiptSha256 -isnot [string] -or $proof.receiptSha256 -cnotmatch '^[a-f0-9]{64}$' -or !(Test-JoxCheckoutSeed $proof.seed)){throw 'Git-first connected proof does not match the CLI or seed.'}
 if($proof.files -isnot [Collections.IDictionary] -or $proof.files.Count -ne 3 -or $Producer.files -isnot [Collections.IDictionary] -or $Producer.files.Count -ne 3){throw 'Git-first proof does not match the exact managed runtime.'}
 $prefix=if($Runtime.characterSet -ceq 'ansi'){'native/jox/ansi/'}else{'native/jox/'}
 foreach($name in @("jade-jox-test-helper-$($Runtime.characterSet).exe",'jadegitscm.dll','jadegitdev.dll')){
  if($proof.files[$name] -isnot [string] -or $proof.files[$name] -cnotmatch '^[a-f0-9]{64}$' -or $proof.files[$name] -cne $Producer.files[$name] -or $proof.files[$name] -cne $Manifest.runtimeFiles[$prefix+$name]){throw 'Git-first proof does not match the exact managed runtime.'}
 }
 foreach($key in @('platform','jomSha256','controlSha256','monitorSha256')){if($seed[$key] -cne $proof.seed[$key]){throw 'Git-first connected proof does not match the seed.'}}
 $checks=@('sourceFreeSetup','restart','branchRoundTrip','savedEditRoundTrip','noOp','isolation','unsupportedChangeRefused')
 if($proof.checks -isnot [Collections.IDictionary] -or $proof.checks.Count -ne $checks.Count){throw 'Incomplete Git-first connected proof.'}
 foreach($key in $checks){if($proof.checks[$key] -isnot [bool] -or !$proof.checks[$key]){throw ('Git-first connected check did not pass: '+$key)}}
}
function Assert-JoxRuntimeVariants([Collections.IDictionary]$Manifest,[string]$Directory){
 $relative='native/jox/runtime-provenance.json';$producer=$null
 if($Manifest.runtimeFiles.Contains($relative)){
  $file=Join-Path $Directory $relative
  if((Get-Item -LiteralPath $file).Length -gt 1048576){throw 'Git-first producer qualification is oversized.'}
  try{$producer=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json -AsHashtable}catch{throw 'Git-first producer qualification is invalid JSON.'}
 }
 Assert-JoxCheckoutProof $Manifest.joxRuntime $producer $Manifest
 Assert-JoxAnsiVariant $Manifest $Directory
}
function Assert-JoxAnsiVariant([Collections.IDictionary]$Manifest,[string]$Directory){
 $jox=$Manifest.joxRuntime;$prefix='native/jox/ansi/'
 $payload=@($Manifest.runtimeFiles.Keys|Where-Object{$_.StartsWith($prefix,[StringComparison]::Ordinal)})
 if(!$jox.Contains('variants')){if($payload.Count){throw 'ANSI payload lacks its runtime variant declaration.'};return}
 $variants=$jox.variants;$ansi=$variants.ansi
 $flags=@('managedUpload','nativeTests','initialization','nativeScratch');$keys=@('format','characterSet','engineCommit')+$flags
 if($ansi -is [Collections.IDictionary]){foreach($key in @('sync','checkoutInitialization','checkoutSeed')){if($ansi.Contains($key)){$keys+=$key}}}
 if($variants -isnot [Collections.IDictionary] -or $variants.Count -ne 1 -or !$variants.Contains('ansi') -or $ansi -isnot [Collections.IDictionary] -or $ansi.Count -ne $keys.Count -or @($ansi.Keys|Where-Object{$_ -notin $keys}).Count -or ($ansi.format -isnot [int] -and $ansi.format -isnot [long]) -or $ansi.format -ne 1 -or $ansi.characterSet -cne 'ansi' -or $ansi.engineCommit -cne $jox.engineCommit){throw 'ANSI runtime needs an exact qualified per-mode declaration.'}
 foreach($flag in $flags){if($ansi[$flag] -isnot [bool] -or $ansi[$flag] -ne ($flag -ne 'nativeScratch')){throw 'ANSI runtime purpose is not qualified or is not an explicit boolean.'}}
 $names=@('jade-jox-test-helper-ansi.exe','jadegitscm.dll','jadegitdev.dll');$proofName=$prefix+'runtime-provenance.json'
 if($payload.Count -ne 4){throw 'ANSI fixed helper, components and provenance are required.'}
 foreach($name in ($names+@('runtime-provenance.json'))){if(!$Manifest.runtimeFiles.Contains($prefix+$name)){throw 'ANSI fixed helper, components and provenance are required.'}}
 $file=Join-Path $Directory $proofName
 if((Get-Item -LiteralPath $file).Length -gt 1048576){throw 'ANSI producer proof is oversized.'}
 $proof=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json -AsHashtable
 if($proof -isnot [Collections.IDictionary] -or ($proof.format -isnot [int] -and $proof.format -isnot [long]) -or $proof.format -ne 1 -or $proof.characterSet -cne 'ansi' -or $proof.engineCommit -cne $ansi.engineCommit -or ($proof.characterBytes -isnot [int] -and $proof.characterBytes -isnot [long]) -or $proof.characterBytes -ne 1 -or $proof.componentCharacterBytes -isnot [Collections.IDictionary] -or $proof.componentCharacterBytes.Count -ne 2 -or $proof.build -isnot [Collections.IDictionary] -or $proof.build.crt -cne 'MT' -or $proof.loaderDiagnostics -isnot [bool] -or $proof.loaderDiagnostics -ne $false -or $proof.observedProvider -isnot [bool] -or $proof.observedProvider -ne $false -or $proof.files -isnot [Collections.IDictionary] -or $proof.files.Count -ne 3 -or $proof.qualification -isnot [Collections.IDictionary]){throw 'ANSI producer ABI, build or qualification differs from its declaration.'}
 foreach($name in @('jadegitscm.dll','jadegitdev.dll')){if(($proof.componentCharacterBytes[$name] -isnot [int] -and $proof.componentCharacterBytes[$name] -isnot [long]) -or $proof.componentCharacterBytes[$name] -ne 1){throw 'ANSI producer component Character width is invalid.'}}
 foreach($flag in $flags){if($proof.qualification[$flag] -isnot [bool] -or $proof.qualification[$flag] -ne $ansi[$flag]){throw 'ANSI producer qualification differs from its declaration.'}}
 Assert-JoxCheckoutProof $ansi $proof $Manifest
 foreach($mode in @($ansi,$proof.qualification)){if($mode.Contains('sync') -and $mode.sync -isnot [bool]){throw 'ANSI sync qualification must be Boolean.'}}
 if(($ansi.sync -eq $true) -ne ($proof.qualification.sync -eq $true)){throw 'ANSI sync qualification differs from its declaration.'}
 foreach($name in $names){
  $expected=$Manifest.runtimeFiles[$prefix+$name];$unicode='native/jox/'+$(if($name -eq 'jade-jox-test-helper-ansi.exe'){'jade-jox-test-helper-unicode.exe'}else{$name})
  if($proof.files[$name] -isnot [string] -or $proof.files[$name] -cnotmatch '^[a-f0-9]{64}$' -or $proof.files[$name] -cne $expected -or ($Manifest.runtimeFiles.Contains($unicode) -and $expected -ieq $Manifest.runtimeFiles[$unicode])){throw 'ANSI producer fingerprints differ or reuse Unicode payloads.'}
 }
}
