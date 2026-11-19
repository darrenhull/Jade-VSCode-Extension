# Consumer validation only: optional ANSI proof remains bound by the caller's full manifest hash checks.
function Assert-JoxAnsiVariant([Collections.IDictionary]$Manifest,[string]$Directory){
 $jox=$Manifest.joxRuntime;$prefix='native/jox/ansi/'
 $payload=@($Manifest.runtimeFiles.Keys|Where-Object{$_.StartsWith($prefix,[StringComparison]::Ordinal)})
 if(!$jox.Contains('variants')){if($payload.Count){throw 'ANSI payload lacks its runtime variant declaration.'};return}
 $variants=$jox.variants;$ansi=$variants.ansi
 $flags=@('managedUpload','nativeTests','initialization','nativeScratch');$keys=@('format','characterSet','engineCommit')+$flags
 if($variants -isnot [Collections.IDictionary] -or $variants.Count -ne 1 -or !$variants.Contains('ansi') -or $ansi -isnot [Collections.IDictionary] -or $ansi.Count -ne 7 -or @($ansi.Keys|Where-Object{$_ -notin $keys}).Count -or ($ansi.format -isnot [int] -and $ansi.format -isnot [long]) -or $ansi.format -ne 1 -or $ansi.characterSet -cne 'ansi' -or $ansi.engineCommit -cne $jox.engineCommit){throw 'ANSI runtime needs an exact qualified per-mode declaration.'}
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
 foreach($name in $names){
  $expected=$Manifest.runtimeFiles[$prefix+$name];$unicode='native/jox/'+$(if($name -eq 'jade-jox-test-helper-ansi.exe'){'jade-jox-test-helper-unicode.exe'}else{$name})
  if($proof.files[$name] -isnot [string] -or $proof.files[$name] -cnotmatch '^[a-f0-9]{64}$' -or $proof.files[$name] -cne $expected -or ($Manifest.runtimeFiles.Contains($unicode) -and $expected -ieq $Manifest.runtimeFiles[$unicode])){throw 'ANSI producer fingerprints differ or reuse Unicode payloads.'}
 }
}
