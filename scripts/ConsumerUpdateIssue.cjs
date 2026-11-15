'use strict';
const {spawnSync}=require('node:child_process');
const repository='darrenhull/Jade-VSCode-Extension';
function gh(args,input){
 const result=spawnSync('gh',args,{input,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
 if(result.error)throw result.error;
 if(result.status!==0)throw Error(`GitHub issue request failed: ${result.stderr||result.status}`);
 return result.stdout;
}
function ensureUpdateIssue(repo,tag,run=gh){
 if(repo!==repository||!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)||tag.includes('\n'))throw Error('Expected the extension repository and a stable CLI release tag.');
 const title=`Update bundled Jade CLI to ${tag}`;
 const pages=JSON.parse(run(['api','--paginate','--slurp',`repos/${repo}/issues?state=all&per_page=100`]));
 if(!Array.isArray(pages)||pages.some(page=>!Array.isArray(page)))throw Error('Unexpected tracking issue response.');
 const matches=pages.flat().filter(issue=>!issue.pull_request&&issue.title===title);
 if(matches.length>1)throw Error('More than one tracking issue matches this CLI release.');
 const body=`Prepared by Codex on behalf of @darrenhull.\n\nBundle the verified official [Jade CLI ${tag}](https://github.com/darrenhull/Jade-CLI/releases/tag/${tag}) release.\n\nAcceptance criteria:\n- Given this stable CLI release, when the dependency PR is prepared, then the verified archive, hash pin and matching consumer release notes are committed together.\n- Given the Draft PR, when validation completes, then all required tests, packaging checks and review findings are clear before owner review is requested.\n- The update does not install software or modify a Jade database.\n`;
 const issue=matches[0]||JSON.parse(run(['api','--method','POST',`repos/${repo}/issues`,'--input','-'],JSON.stringify({title,body})));
 if(issue.title!==title||!Number.isSafeInteger(issue.number)||issue.number<1||issue.html_url!==`https://github.com/${repo}/issues/${issue.number}`)throw Error('Unexpected tracking issue identity.');
 return issue.number;
}
module.exports={ensureUpdateIssue};
if(require.main===module){try{console.log(ensureUpdateIssue(process.env.GH_REPO,process.argv[2]));}catch(error){console.error(error.message);process.exitCode=1;}}
