'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const STATE='jade.projectLanguageSkill.v1',hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
/** Installs the bundled language guidance without replacing user-authored files. */
class ProjectSkillInstaller {
  constructor({bundle,state,isTrusted,name='jade-language'}){if(typeof name!=='string'||name.length>63||!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name))throw Error('Invalid project skill name.');Object.assign(this,{bundle,state,isTrusted,name});this.stateKey=name==='jade-language'?STATE:STATE+'.'+name;this.tail=Promise.resolve();}
  install(folder,options={}){const run=this.tail.then(()=>this.installNow(folder,options));this.tail=run.catch(()=>{});return run;}
  safe(root,relative){
    const target=path.resolve(root,relative),inside=path.relative(root,target);
    if(inside==='..'||inside.startsWith('..'+path.sep)||path.isAbsolute(inside))throw Error('Skill destination escapes its project.');
    let current=root;if(fs.lstatSync(root).isSymbolicLink())throw Error('Skill root is a symbolic link.');
    for(const part of inside.split(path.sep).filter(Boolean)){current=path.join(current,part);let stat;try{stat=fs.lstatSync(current);}catch(error){if(error.code!=='ENOENT')throw error;}if(stat?.isSymbolicLink())throw Error('Skill path contains a symbolic link.');}
    return target;
  }
  async installNow(folder,{knownJade=false,dirtyPaths=[]}={}){
    if(!this.isTrusted()||folder?.uri?.scheme!=='file')return {installed:0};
    const root=folder.uri.fsPath;if(!root||!fs.existsSync(root))return {installed:0};
    if(!knownJade&&!fs.existsSync(path.join(root,'jade.json')))return {installed:0};
    const files=['SKILL.md'],references=this.safe(this.bundle,'references');
    if(fs.existsSync(references))for(const entry of fs.readdirSync(references,{withFileTypes:true}))if(entry.isFile()&&entry.name.endsWith('.md'))files.push('references/'+entry.name);
    if(files.length>32)throw Error('Bundled Jade skill has too many files.');
    const payloads=files.map(relative=>{const source=this.safe(this.bundle,relative);if(!fs.statSync(source).isFile()||fs.statSync(source).size>262144)throw Error('Bundled Jade skill file exceeds its size limit.');return {relative,bytes:fs.readFileSync(source)};});
    const project=folder.uri.toString(),stored=this.state.get(this.stateKey)||{},receipt=stored[project]||{},prefix='.github/skills/'+this.name+'/',main=this.safe(root,prefix+'SKILL.md');
    const normalized=file=>process.platform==='win32'?path.resolve(file).toLowerCase():path.resolve(file),dirty=new Set([...dirtyPaths,...(this.getDirtyPaths?.()||[])].map(normalized));
    if(dirty.has(normalized(main)))return {installed:0,preserved:true};
    if(fs.existsSync(main)){const stat=fs.statSync(main);if(!stat.isFile()||stat.size>262144)return {installed:0,preserved:true};const current=hash(fs.readFileSync(main));if(current!==receipt['SKILL.md']&&current!==hash(payloads[0].bytes))return {installed:0,preserved:true};}
    let installed=0;const next={...receipt};
    for(const {relative,bytes} of payloads){
      const target=this.safe(root,prefix+relative),digest=hash(bytes);
      if(dirty.has(normalized(target)))continue;
      if(fs.existsSync(target)){
        const stat=fs.statSync(target);if(!stat.isFile()||stat.size>262144)continue;
        const current=hash(fs.readFileSync(target));if(current===digest){next[relative]=digest;continue;}if(current!==receipt[relative])continue;
      }
      fs.mkdirSync(path.dirname(target),{recursive:true});this.safe(root,prefix+relative);
      fs.writeFileSync(target,bytes,{flag:fs.existsSync(target)?'w':'wx'});next[relative]=digest;installed++;
    }
    const entries=Object.entries(stored).filter(([key])=>key!==project).slice(-63);entries.push([project,next]);await this.state.update(this.stateKey,Object.fromEntries(entries));
    return {installed};
  }
  start(vscode,context,index){
    let disposed=false;
    this.getDirtyPaths=()=>[...(vscode.workspace.textDocuments||[])].filter(document=>document.isDirty&&document.uri.scheme==='file').map(document=>document.uri.fsPath);
    const knownFolder=folder=>[...(index?.project?.models?.values?.()||[])].some(model=>model.schema&&vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(model.uri))?.uri.toString()===folder.uri.toString());
    const schedule=(folder,knownJade=false)=>{if(!disposed&&folder)void this.install(folder,{knownJade}).catch(error=>console.warn('Jade language skill: '+error.message));};
    const opened=document=>{if(document.uri.scheme!=='file'||!['jade-nz'].includes(document.languageId))return;const text=document.getText().slice(0,8192);if(/\bschemaDefinition\b|\btypeHeaders\b/.test(text))schedule(vscode.workspace.getWorkspaceFolder(document.uri),true);};
    const scan=()=>{for(const folder of vscode.workspace.workspaceFolders||[])schedule(folder,knownFolder(folder));for(const document of vscode.workspace.textDocuments||[])opened(document);};
    context.subscriptions.push({dispose:()=>{disposed=true;}},vscode.workspace.onDidOpenTextDocument(opened),vscode.workspace.onDidChangeWorkspaceFolders(event=>{for(const folder of event.added)schedule(folder,knownFolder(folder));}));
    if(vscode.workspace.onDidGrantWorkspaceTrust)context.subscriptions.push(vscode.workspace.onDidGrantWorkspaceTrust(scan));
    scan();
  }
}
module.exports={ProjectSkillInstaller};
