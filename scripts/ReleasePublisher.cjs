'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {releaseNotesForVersion}=require('./ReleaseNotes.cjs');

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
    const ref=this.run('git',['rev-parse','--verify','refs/tags/'+tag+'^{commit}']);
    if(existing&&!existing.draft) {
      if(ref.status!==0||this.run('git',['merge-base','--is-ancestor',ref.stdout.trim(),'origin/main']).status!==0)throw Error('Published release tag must belong to approved main.');
      const required=this.assets(directory).map(file=>path.basename(file));
      for(const name of required)if(!existing.assets?.some(asset=>asset.name===name))throw Error('Published release is missing required asset: '+name);
      const downloaded=fs.mkdtempSync(path.join(os.tmpdir(),'jade-published-release-'));
      try {
        const args=['release','download',tag,'--repo',repository,'--dir',downloaded];
        for(const name of required)args.push('--pattern',name);
        this.command('gh',args);
        const verified=new Set(this.assets(downloaded).map(file=>path.basename(file)));
        for(const name of required)if(!verified.has(name))throw Error('Published release checksums are missing required asset: '+name);
      } finally {fs.rmSync(downloaded,{recursive:true,force:true});}
      return {published:false,skipped:true,tag,reason:'Existing approved release assets verified; published version remains immutable.'};
    }
    if(ref.status===0&&ref.stdout.trim()!==sha)throw Error('The release tag points to a different commit.');
    if(existing&&ref.status!==0&&existing.target_commitish!==sha)throw Error('The draft release belongs to a different commit.');
    const assets=this.assets(directory);
    const changelog=path.join(this.root,'extension','CHANGELOG.md'),notesFile=path.join(directory,'RELEASE_NOTES.md');
    fs.writeFileSync(notesFile,releaseNotesForVersion(fs.existsSync(changelog)?fs.readFileSync(changelog,'utf8'):'',version));
    if(!existing)this.command('gh',['release','create',tag,'--repo',repository,'--draft','--target',sha,'--title',tag,'--notes-file',notesFile]);
    else this.command('gh',['release','edit',tag,'--repo',repository,'--notes-file',notesFile]);
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
