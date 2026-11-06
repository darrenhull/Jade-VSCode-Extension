'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
function run(t,author='github-actions[bot]',draft=true,mutate=()=>{}) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-consumer-draft-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const workflow=fs.readFileSync(path.resolve(__dirname,'../../.github/workflows/update-consumer.yml'),'utf8').replace(/\r\n/g,'\n'),marker='        run: |\n',body=workflow.slice(workflow.lastIndexOf(marker)+marker.length).split('\n').map(line=>line.replace(/^          /,'')).join('\n');
 const calls=path.join(root,'calls.jsonl'),current={draft,user:{login:author,type:author==='github-actions[bot]'?'Bot':'User'},head:{ref:'cli/update-v0.4.0',sha:'a'.repeat(40),repo:{full_name:'darrenhull/Jade-VSCode-Extension'}},base:{ref:'main'},requested_reviewers:[]};
 mutate(current);fs.writeFileSync(path.join(root,'current.json'),JSON.stringify(current));
 const prefix=String.raw`function git { $global:LASTEXITCODE=0 }
function gh {
 $global:LASTEXITCODE=0
 [IO.File]::AppendAllText($env:CALLS,(ConvertTo-Json -InputObject @($args) -Compress)+[Environment]::NewLine)
 if($args[0] -eq 'pr' -and $args[1] -eq 'view'){return '6'}
 if($args[0] -eq 'api'){Get-Content -LiteralPath $env:CURRENT -Raw;return}
}
`;
 const script=path.join(root,'workflow.ps1');fs.writeFileSync(script,prefix+body);
 const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',script],{cwd:root,windowsHide:true,encoding:'utf8',env:{...process.env,CLI_BRANCH:'cli/update-v0.4.0',CLI_TAG:'v0.4.0',CLI_SHA:'b'.repeat(64),DEPENDENCY_CHANGED:'false',BASE_BRANCH:'main',GH_REPO:'darrenhull/Jade-VSCode-Extension',RUNNER_TEMP:root,GITHUB_STEP_SUMMARY:path.join(root,'summary'),CALLS:calls,CURRENT:path.join(root,'current.json')}});
 return {result,calls:fs.readFileSync(calls,'utf8').trim().split(/\r?\n/).map(JSON.parse)};
}
test('release dependency updates create Draft bot PRs without requesting owner review or auto-merge',t=>{
 const {result,calls}=run(t);assert.equal(result.status,0,result.stderr);const create=calls.find(args=>args[0]==='pr'&&args[1]==='create');assert.ok(create.includes('--draft'));assert.equal(calls.some(args=>args.includes('--reviewer')||args.includes('merge')||args.some(value=>String(value).includes('requested_reviewers'))),false);
});
test('dependency updater still verifies bot repository branch and exact head identity',t=>{
 for(const mutate of [value=>value.user.login='darrenhull',value=>value.head.ref='other',value=>value.head.repo.full_name='other/repo',value=>value.base.ref='other',value=>value.head.sha='invalid']){const {result,calls}=run(t,'github-actions[bot]',true,mutate);assert.notEqual(result.status,0);assert.match(result.stderr,/Unexpected dependency pull request identity/);assert.equal(calls.some(args=>args.includes('merge')),false);}
});
test('dependency updater refuses a non-Draft creation instead of quietly requesting review',t=>{
 const {result,calls}=run(t,'github-actions[bot]',false);assert.notEqual(result.status,0);assert.match(result.stderr,/draft/i);assert.equal(calls.some(args=>args.includes('--reviewer')||args.includes('merge')),false);
});
