#requires -Version 7.0
param([string]$Vsix,[string]$PinFile,[string]$ExpectedDistribution)
$ErrorActionPreference='Stop'
if(!$Vsix){$Vsix=(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '../dist') -Filter '*.vsix'|Sort-Object LastWriteTime -Descending|Select-Object -First 1).FullName}
if(!$Vsix -or !(Test-Path -LiteralPath $Vsix -PathType Leaf)){throw 'A packaged VSIX is required.'}
$temporary=Join-Path ([IO.Path]::GetTempPath()) ('jade-vsix-portable-'+[guid]::NewGuid().ToString('N'))
$oldPath=$env:PATH;$oldElectron=$env:ELECTRON_RUN_AS_NODE;$oldState=$env:JADE_TOOLS_STATE_DIRECTORY;$location=Get-Location
try{
 [IO.Compression.ZipFile]::ExtractToDirectory([IO.Path]::GetFullPath($Vsix),$temporary)
 $extension=Join-Path $temporary 'extension';$cli=Join-Path $extension 'vendor/jade-tools-cli/jade-cli.exe'
 if(!(Test-Path -LiteralPath $cli -PathType Leaf)){throw 'The VSIX has no bundled native Jade CLI.'}
 & (Join-Path $PSScriptRoot 'VerifyNativeDistribution.ps1') -Directory (Join-Path $extension 'vendor/jade-tools-cli') -PinFile $PinFile -ExpectedDistribution $ExpectedDistribution
 $workspace=Join-Path $temporary 'workspace';[IO.Directory]::CreateDirectory($workspace)|Out-Null
 [IO.File]::WriteAllText((Join-Path $workspace 'jade.json'),(@{workspaceRoots=@('.');schema='PortableSchema';databasePath=(Join-Path $temporary 'database-must-not-be-opened')}|ConvertTo-Json))
 [IO.File]::WriteAllText((Join-Path $workspace 'PortableTests.cls'),@'
jadeVersionNumber "25.0.02";
schemaDefinition
PortableSchema subschemaOf RootSchema partialDefinition;
typeHeaders
PortableTests subclassOf JadeTestCase transient;
typeDefinitions
PortableTests completeDefinition
(
jadeMethodDefinitions
portableProbe() unitTest;
)
typeSources
PortableTests (
jadeMethodSources
portableProbe
{
portableProbe() unitTest;
begin
 assertTrue(true);
end;
}
)
'@)
 $env:PATH=Join-Path $env:SystemRoot 'System32';$env:JADE_TOOLS_STATE_DIRECTORY=Join-Path $temporary 'broker';Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
 Set-Location -LiteralPath $workspace
 $output=& $cli tests list --json
 if($LASTEXITCODE -ne 0){throw ('Extracted native CLI failed: '+($output -join "`n"))}
 $result=($output -join "`n")|ConvertFrom-Json
 if(!$result.passed -or $result.rows.Count -ne 1 -or $result.rows[0].owner -ne 'PortableTests' -or $result.rows[0].method -ne 'portableProbe'){throw ('Extracted native discovery returned unexpected results: '+($output -join "`n"))}
 if(Test-Path -LiteralPath (Join-Path $temporary 'database-must-not-be-opened')){throw 'Database-free discovery created a database directory.'}
 Write-Output 'PASS extracted VSIX native CLI outside checkout; no Node on PATH; workspace test discovery; no database connection.'
}finally{
 $cleanupFailure=$null
 try{
 if($cli -and (Test-Path -LiteralPath $cli)){
  $status=& $cli status --json|ConvertFrom-Json
  if($LASTEXITCODE -ne 0 -or !$status.brokerPID){throw 'Could not identify the owned portable broker before cleanup.'}
  $brokerPID=[int]$status.brokerPID
  & $cli shutdown --json|Out-Null
  # Confirm owned broker exit before deleting its executable.
  try { Wait-Process -Id $brokerPID -Timeout 5 -ErrorAction Stop }
  catch {
   # An already-exited process can disappear before Wait-Process looks it up.
   if(Get-Process -Id $brokerPID -ErrorAction SilentlyContinue){throw}
  }
  # End owned broker exit wait.
 }
 }catch{$cleanupFailure=$_}
 Set-Location -LiteralPath $location.Path;$env:PATH=$oldPath
 if($null -eq $oldElectron){Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue}else{$env:ELECTRON_RUN_AS_NODE=$oldElectron}
 if($null -eq $oldState){Remove-Item Env:JADE_TOOLS_STATE_DIRECTORY -ErrorAction SilentlyContinue}else{$env:JADE_TOOLS_STATE_DIRECTORY=$oldState}
 if($cleanupFailure){throw $cleanupFailure}
 if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary -Recurse -Force}
}
