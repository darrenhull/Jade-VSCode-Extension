'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
for(const open of [false,true])test('dependency workflow '+(open?'reuses an open update PR':'recreates a closed update on a fresh branch without overwriting it'),()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-update-pr-'));try{
 const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/update-consumer.yml'),'utf8');const script=workflow.slice(workflow.indexOf('          $existing = gh pr list')).split('\n').map(line=>line.startsWith('          ')?line.slice(10):line).join('\n');
 const setup=`$ErrorActionPreference='Stop'
$env:CLI_BRANCH='codex/update-jade-cli-0.2.0';$env:CLI_TAG='v0.2.0';$env:CLI_SHA='59a';$env:BASE_BRANCH='main';$env:GH_REPO='darrenhull/Jade-VSCode-Extension';$env:GITHUB_STEP_SUMMARY=Join-Path $PSScriptRoot 'summary';$env:RUNNER_TEMP=$PSScriptRoot
function gh { $global:LASTEXITCODE=0; Add-Content (Join-Path $PSScriptRoot 'calls') ('gh '+($args -join ' '));if($args[0] -eq 'pr' -and $args[1] -eq 'list'){${open?"'https://example.test/open'":"return"}}elseif($args[0] -eq 'pr' -and $args[1] -eq 'view'){'12'}elseif($args[0] -eq 'api'){@{user=@{login='github-actions[bot]';type='Bot'};head=@{ref=$env:CLI_BRANCH;sha=('a'*40);repo=@{full_name=$env:GH_REPO}};base=@{ref='main'};requested_reviewers=@(@{login='darrenhull'})}|ConvertTo-Json -Depth 5}}
function git { $global:LASTEXITCODE=0;Add-Content (Join-Path $PSScriptRoot 'calls') ('git '+($args -join ' '));if($args[0] -eq 'ls-remote'){'previous-closed-branch'} }
function node { $global:LASTEXITCODE=0 }
`;
 fs.writeFileSync(path.join(root,'proof.ps1'),setup+'\n'+script);const r=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',path.join(root,'proof.ps1')],{encoding:'utf8',windowsHide:true,timeout:20000,cwd:root});assert.ifError(r.error);assert.equal(r.status,0,r.stdout+r.stderr);const calls=fs.readFileSync(path.join(root,'calls'),'utf8');assert.match(calls,/--state open/);if(open)assert.doesNotMatch(calls,/git push|pr create/);else{assert.match(calls,/git push --set-upstream origin codex\/update-jade-cli-0.2.0-retry-[a-f0-9]{32}/);assert.match(calls,/gh pr merge 12 .*--match-head-commit/);assert.doesNotMatch(calls,/--force|--admin/);}
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
