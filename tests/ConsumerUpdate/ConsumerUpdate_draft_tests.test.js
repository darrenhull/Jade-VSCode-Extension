'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
function run(t,author='github-actions[bot]',draft=true,mutate=()=>{},options={}) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-consumer-draft-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const workflow=fs.readFileSync(path.resolve(__dirname,'../../.github/workflows/update-consumer.yml'),'utf8').replace(/\r\n/g,'\n'),marker='        run: |\n',body=workflow.slice(workflow.lastIndexOf(marker)+marker.length).split('\n').map(line=>line.replace(/^          /,'')).join('\n');
 fs.mkdirSync(path.join(root,'extension'));fs.writeFileSync(path.join(root,'extension/CHANGELOG.md'),'# Existing');
 const calls=path.join(root,'calls.jsonl'),current={draft,user:{login:author,type:author==='github-actions[bot]'?'Bot':'User'},head:{ref:'cli/update-v0.4.0',sha:'a'.repeat(40),repo:{full_name:'darrenhull/Jade-VSCode-Extension'}},base:{ref:'main'},requested_reviewers:[]};
 mutate(current);fs.writeFileSync(path.join(root,'current.json'),JSON.stringify(current));
 const prefix=String.raw`function git { $global:LASTEXITCODE=0; [IO.File]::AppendAllText($env:CALLS,(ConvertTo-Json -InputObject (@('git')+$args) -Compress)+[Environment]::NewLine) }
function node { $global:LASTEXITCODE=[int]$env:ISSUE_EXIT; return $env:ISSUE_NUMBER }
function gh {
 $global:LASTEXITCODE=0
 [IO.File]::AppendAllText($env:CALLS,(ConvertTo-Json -InputObject @($args) -Compress)+[Environment]::NewLine)
 if($args[0] -eq 'pr' -and $args[1] -eq 'list' -and $env:EXISTING_PR){return $env:EXISTING_PR}
 if($args[0] -eq 'pr' -and $args[1] -eq 'create'){Copy-Item -LiteralPath $args[([array]::IndexOf($args,'--body-file')+1)] -Destination $env:BODY}
 if($args[0] -eq 'pr' -and $args[1] -eq 'view'){return '6'}
 if($args[0] -eq 'api'){Get-Content -LiteralPath $env:CURRENT -Raw;return}
}
`;
 const script=path.join(root,'workflow.ps1');fs.writeFileSync(script,prefix+body);
 const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',script],{cwd:root,windowsHide:true,encoding:'utf8',env:{...process.env,CLI_BRANCH:'cli/update-v0.4.0',CLI_TAG:'v0.4.0',CLI_SHA:'b'.repeat(64),DEPENDENCY_CHANGED:'false',BASE_BRANCH:'main',GH_REPO:'darrenhull/Jade-VSCode-Extension',RUNNER_TEMP:root,GITHUB_STEP_SUMMARY:path.join(root,'summary'),CALLS:calls,CURRENT:path.join(root,'current.json'),BODY:path.join(root,'body.md'),ISSUE_EXIT:String(options.issueExit||0),ISSUE_NUMBER:options.issueNumber??'65',EXISTING_PR:options.existing||''}});
 return {result,body:fs.existsSync(path.join(root,'body.md'))?fs.readFileSync(path.join(root,'body.md'),'utf8'):'',calls:fs.readFileSync(calls,'utf8').trim().split(/\r?\n/).map(JSON.parse)};
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

test('dependency PR links its real tracking issue and commits exact release notes',t=>{
 const {result,calls,body}=run(t);assert.equal(result.status,0,result.stderr);assert.match(body,/Closes #65/);assert.match(body,/Prepared by Codex on behalf of @darrenhull/);
 assert.ok(calls.find(args=>args[0]==='git'&&args[1]==='add').includes('extension/CHANGELOG.md'));
 for(const file of ['update-consumer.yml','update-cli.yml'])assert.match(fs.readFileSync(path.resolve(__dirname,'../../.github/workflows',file),'utf8'),/issues: write/);
});

test('dependency updater fails before committing or pushing if tracking issue preparation fails',t=>{
 for(const options of [{issueExit:1},{issueNumber:'not-an-issue'}]){
  const {result,calls}=run(t,'github-actions[bot]',true,()=>{},options);assert.notEqual(result.status,0);assert.match(result.stderr,/tracking issue/);
  assert.equal(calls.some(args=>args[0]==='git'&&['commit','push'].includes(args[1])),false);assert.equal(calls.some(args=>args[0]==='pr'&&args[1]==='create'),false);
 }
});
test('dependency updater reuses an existing release PR without committing or creating another',t=>{
 const {result,calls}=run(t,'github-actions[bot]',true,()=>{},{existing:'https://github.com/darrenhull/Jade-VSCode-Extension/pull/66'});assert.equal(result.status,0,result.stderr);assert.equal(calls.length,1);
});