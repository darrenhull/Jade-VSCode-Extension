#requires -Version 7.0
param([string]$Vsix,[string]$PinFile,[string]$ExpectedDistribution,[string]$GitDirectory,[switch]$RequireJox)
$ErrorActionPreference='Stop'
if(!$Vsix){$Vsix=(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '../dist') -Filter '*.vsix'|Sort-Object LastWriteTime -Descending|Select-Object -First 1).FullName}
if(!$Vsix -or !(Test-Path -LiteralPath $Vsix -PathType Leaf)){throw 'A packaged VSIX is required.'}
if(!$GitDirectory){$gitCommand=Get-Command git.exe -CommandType Application -ErrorAction Stop|Select-Object -First 1;$GitDirectory=Split-Path -Parent $gitCommand.Source}
if(![IO.Path]::IsPathRooted($GitDirectory) -or !(Test-Path -LiteralPath (Join-Path $GitDirectory 'git.exe') -PathType Leaf)){throw 'Provide the absolute installation directory containing the required Git executable.'}
$portableGit=Join-Path ([IO.Path]::GetFullPath($GitDirectory)) 'git.exe';$gitHash=(Get-FileHash -LiteralPath $portableGit -Algorithm SHA256).Hash.ToLowerInvariant();$gitVersion=(& $portableGit --version)-join ' '
if($LASTEXITCODE -ne 0){throw 'The required Git executable did not report its version.'}
$temporary=Join-Path ([IO.Path]::GetTempPath()) ('jade-vsix-portable-'+[guid]::NewGuid().ToString('N'))
$oldPath=$env:PATH;$oldElectron=$env:ELECTRON_RUN_AS_NODE;$oldState=$env:JADE_TOOLS_STATE_DIRECTORY;$oldConnections=$env:JADE_TOOLS_CONNECTIONS_FILE;$location=Get-Location
$distributionVerified=$false;$privateContextReady=$false;$nativeAttempted=$false;$privateState=$null;$privateConnections=$null;$joxService=$null
try{
 [IO.Compression.ZipFile]::ExtractToDirectory([IO.Path]::GetFullPath($Vsix),$temporary)
 $extension=Join-Path $temporary 'extension';$cli=Join-Path $extension 'vendor/jade-tools-cli/jade-cli.exe'
 if(!(Test-Path -LiteralPath $cli -PathType Leaf)){throw 'The VSIX has no bundled native Jade CLI.'}
 & (Join-Path $PSScriptRoot 'VerifyNativeDistribution.ps1') -Directory (Join-Path $extension 'vendor/jade-tools-cli') -PinFile $PinFile -ExpectedDistribution $ExpectedDistribution -RequireJox:$RequireJox
 $runtimeManifest=Get-Content -LiteralPath (Join-Path $extension 'vendor/jade-tools-cli/distribution.json') -Raw|ConvertFrom-Json -AsHashtable
 $joxMode=$RequireJox -or $runtimeManifest.ContainsKey('joxRuntime')
 $distributionVerified=$true
 $workspace=Join-Path $temporary 'workspace';[IO.Directory]::CreateDirectory($workspace)|Out-Null
 if($joxMode){
  $sources=Join-Path $workspace 'sources';[IO.Directory]::CreateDirectory((Join-Path $sources 'schemas/PortableSchema/types'))|Out-Null
  [IO.File]::WriteAllText((Join-Path $workspace 'jade.json'),(@{sourceFormat='jox';workingMode='source-backed';workspaceRoots=@('sources');databasePath=(Join-Path $temporary 'database-must-not-be-opened')}|ConvertTo-Json))
  [IO.File]::WriteAllText((Join-Path $sources '.jadegit'),"[core]`nplatform = '25.0.2'`n") # Explicit synthetic source fixture, not observed runtime authority.
  [IO.File]::WriteAllText((Join-Path $sources 'schemas/PortableSchema.jox'),'<Schema name="PortableSchema" id="360989a0-b460-4647-8941-169cf70ac504"><superschema name="RootSchema"/></Schema>')
  $methodSource=@('portableProbe() unitTest;','begin',' self.assertTrue(true);','end;') -join "`n"
  [IO.File]::WriteAllText((Join-Path $sources 'schemas/PortableSchema/types/PortableTests.jox'),('<Class name="PortableTests" id="daa4b196-c77c-4d37-b9d2-bfe7ed5da8d3"><superclass name="JadeTestCase"/><JadeMethod name="portableProbe" id="d3d7cc91-e81f-4418-a826-2aba5aad9765"><unitTestFlags>Test</unitTestFlags><source>'+ $methodSource +'</source></JadeMethod></Class>'))
 }else{
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
 }
 & $portableGit init --quiet $workspace
 if($LASTEXITCODE -ne 0){throw 'Could not initialise the owned portable Git fixture.'}
 $privateState=Join-Path $temporary 'broker';$privateConnections=Join-Path $temporary 'connections.json'
 $env:PATH=(Join-Path $env:SystemRoot 'System32')+';'+[IO.Path]::GetDirectoryName($portableGit);$env:JADE_TOOLS_STATE_DIRECTORY=$privateState;$env:JADE_TOOLS_CONNECTIONS_FILE=$privateConnections;Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
 if(Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue){throw 'Portable child PATH unexpectedly contains Node.'}
 Set-Location -LiteralPath $workspace
 $privateContextReady=$true;$nativeAttempted=$true
 if($joxMode){
  $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$cli;$start.WorkingDirectory=$workspace;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  $start.ArgumentList.Add('service');$start.ArgumentList.Add('--stdio')
  $joxService=[Diagnostics.Process]::new();$joxService.StartInfo=$start
  if(!$joxService.Start()){throw 'The extracted JOX service did not start.'}
  $joxErrors=$joxService.StandardError.ReadToEndAsync()
  function Invoke-PortableJoxRequest($request){
   $deadline=[Environment]::TickCount64+30000
   $joxService.StandardInput.WriteLine(($request|ConvertTo-Json -Depth 20 -Compress));$joxService.StandardInput.Flush()
   for($lines=0;$lines -lt 200;$lines++){
    $remaining=$deadline-[Environment]::TickCount64;if($remaining -le 0){throw 'Portable JOX metadata request timed out.'}
    $line=$joxService.StandardOutput.ReadLineAsync();if(!$line.Wait([int]$remaining)){throw 'Portable JOX metadata response timed out.'}
    if($null -eq $line.Result){throw 'Portable JOX service closed without its result.'}
    $packet=$line.Result|ConvertFrom-Json -AsHashtable
    if($packet.event -eq 'result' -and $packet.id -eq $request.id){
     if(!$packet.result.passed -or $packet.result.code -ne 0){throw ('Portable JOX metadata failed: '+($packet.result|ConvertTo-Json -Depth 8 -Compress))}
     return $packet.result.body
    }
   }
   throw 'Portable JOX metadata response exceeded its event bound.'
  }
  $prepared=Invoke-PortableJoxRequest @{id=1;command='source.semantic.prepare';cwd=$workspace;config=@{sourceFormat='jox'}}
  $page=Invoke-PortableJoxRequest @{id=2;command='source.semantic.query';provider='jox';projectId=$prepared.projectId;generation=$prepared.generation;kind='test';offset=0;limit=100}
  if($page.total -ne 1 -or $page.items.Count -ne 1 -or $page.items[0].testIdentity.schema -ne 'PortableSchema' -or $page.items[0].testIdentity.class -ne 'PortableTests' -or $page.items[0].testIdentity.method -ne 'portableProbe'){throw 'Portable native JOX discovery did not preserve the synthetic test identity.'}
  $joxService.StandardInput.Close();if(!$joxService.WaitForExit(5000) -or $joxService.ExitCode -ne 0){throw 'Portable JOX stdio service exit was not confirmed.'}
  $joxService.Dispose();$joxService=$null
  if(Test-Path -LiteralPath (Join-Path $workspace '.jade/source-index')){throw 'Portable JOX metadata invoked the retired CLS source-index preparation.'}
 }else{
 $refreshed=& $cli source refresh --workspace $workspace --json
 if($LASTEXITCODE -ne 0){throw ('Extracted native source refresh failed: '+($refreshed -join "`n"))}
 $sourceIndex=($refreshed -join "`n")|ConvertFrom-Json
 if(!$sourceIndex.passed -or $sourceIndex.cache.format -ne 2){throw 'Extracted native source refresh did not create the shared format2 index.'}
 $output=& $cli tests list --json
 if($LASTEXITCODE -ne 0){throw ('Extracted native CLI failed: '+($output -join "`n"))}
 $result=($output -join "`n")|ConvertFrom-Json
 if(!$result.passed -or $result.rows.Count -ne 1 -or $result.rows[0].owner -ne 'PortableTests' -or $result.rows[0].method -ne 'portableProbe'){throw ('Extracted native discovery returned unexpected results: '+($output -join "`n"))}
 }
 if(Test-Path -LiteralPath (Join-Path $temporary 'database-must-not-be-opened')){throw 'Database-free discovery created a database directory.'}
 Write-Output 'PASS extracted VSIX native CLI outside checkout; no Node on PATH; workspace test discovery; no database connection.'
 Write-Output ('Git prerequisite: '+$portableGit+' | '+$gitVersion+' | SHA256 '+$gitHash)
}finally{
 $cleanupFailure=$null
 try{
 if($joxService){$joxService.StandardInput.Close();if(!$joxService.WaitForExit(5000)){$joxService.Kill();[void]$joxService.WaitForExit(5000);throw 'Portable owned stdio service required forced cleanup; preserve its fixture.'};$joxService.Dispose();$joxService=$null}
 if($distributionVerified -and $privateContextReady -and $nativeAttempted -and $cli -and (Test-Path -LiteralPath $cli)){
  # A failure may only clean up the verified payload in its owned context.
  $env:JADE_TOOLS_STATE_DIRECTORY=$privateState;$env:JADE_TOOLS_CONNECTIONS_FILE=$privateConnections
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
 if($null -eq $oldConnections){Remove-Item Env:JADE_TOOLS_CONNECTIONS_FILE -ErrorAction SilentlyContinue}else{$env:JADE_TOOLS_CONNECTIONS_FILE=$oldConnections}
 if($cleanupFailure){throw $cleanupFailure}
 if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary -Recurse -Force}
}
