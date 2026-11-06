'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');

/** Publishes verified consumer artifacts without changing an existing release. */
class ReleasePublisher {
  constructor({root=process.cwd(),run}={}) {
    this.root=root;
    this.run=run||((program,args)=>spawnSync(program,args,{cwd:root,encoding:'utf8',windowsHide:true}));
  }
  command(program,args) {
    const result=this.run(program,args);
    if(result.error||result.status!==0)throw Error(result.error?.message||result.stderr||program+' failed.');
    return result.stdout||'';
  }
  assets(directory) {
    const rows=fs.readFileSync(path.join(directory,'SHA256SUMS'),'utf8').trim().split(/\r?\n/),seen=new Set(),files=[];
    for(const row of rows) {
      const match=/^([a-f0-9]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)$/i.exec(row);
      if(!match||seen.has(match[2]))throw Error('Invalid or duplicate release checksum entry.');
      const file=path.join(directory,match[2]);
      if(!fs.statSync(file).isFile()||crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==match[1].toLowerCase())throw Error('Release checksum mismatch: '+match[2]);
      seen.add(match[2]);files.push(file);
    }
    return [...files,path.join(directory,'SHA256SUMS')];
  }
  publish({repository,sha,tag:requestedTag,directory=path.join(this.root,'release')}) {
    if(!['darrenhull/Jade-VSCode-Extension','darrenhull/Jade-Local-MCP'].includes(repository)||!/^[a-f0-9]{40}$/i.test(sha||''))throw Error('A trusted consumer and source commit are required.');
    const {version}=JSON.parse(fs.readFileSync(path.join(this.root,'package.json'),'utf8'));
    if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('A stable package version is required.');
    const tag='v'+version;
    if(requestedTag&&requestedTag!==tag)throw Error('The requested release tag does not match the package version.');
    if(this.command('git',['rev-parse','HEAD']).trim()!==sha)throw Error('Checkout does not match the release source commit.');
    if(this.run('git',['merge-base','--is-ancestor',sha,'origin/main']).status!==0)throw Error('Release source must belong to approved main.');
    const found=this.run('gh',['api','repos/'+repository+'/releases/tags/'+tag]);
    let existing;
    if(found.status===0)existing=JSON.parse(found.stdout);
    else if(!/\b404\b/.test((found.stderr||'')+(found.stdout||'')))throw Error(found.stderr||'Could not check the existing release.');
    if(existing&&existing.tag_name!==tag)throw Error('Unexpected release identity.');
    if(existing&&!existing.draft)return {published:false,skipped:true,tag,reason:'This version is already published; its artifacts remain unchanged.'};
    const ref=this.run('git',['rev-parse','--verify','refs/tags/'+tag+'^{commit}']);
    if(ref.status===0&&ref.stdout.trim()!==sha)throw Error('The release tag points to a different commit.');
    if(existing&&ref.status!==0&&existing.target_commitish!==sha)throw Error('The draft release belongs to a different commit.');
    const assets=this.assets(directory);
    if(!existing)this.command('gh',['release','create',tag,'--repo',repository,'--draft','--target',sha,'--title',tag,'--generate-notes']);
    this.command('gh',['release','upload',tag,...assets,'--repo',repository,'--clobber']);
    this.command('gh',['release','edit',tag,'--repo',repository,'--draft=false','--latest']);
    return {published:true,skipped:false,tag,sha};
  }
}

if(require.main===module) {
  try {
    const result=new ReleasePublisher().publish({repository:process.env.GITHUB_REPOSITORY,sha:process.env.GITHUB_SHA,tag:process.env.GITHUB_REF_TYPE==='tag'?process.env.GITHUB_REF_NAME:undefined});
    console.log(JSON.stringify(result));
    if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,(result.skipped?'Skipped existing immutable release ':'Published ')+result.tag+'\n');
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
module.exports={ReleasePublisher};
