'use strict';
// Explicit owned-fixture driver. Not included in the default database-free suite.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const {CliWorkingSession}=require('../../extension/src/cli-client'),gateway=require('../../extension/src/cli-gateway');
const {scanProject}=require('../../extension/src/native-project'),{registerProjectTools}=require('../../extension/src/project-tools');
async function main(){
 if(process.env.JADE_PUBLISH_OWNED_NATIVE!=='1')throw Error('Explicit JADE_PUBLISH_OWNED_NATIVE=1 is required.');
 const [entry,fixtureRoot,workspaceArgument,workingFile,targetFile,evidenceArgument]=process.argv.slice(2);
 if(![entry,fixtureRoot,workspaceArgument,workingFile,targetFile,evidenceArgument].every(Boolean))throw Error('Arguments: CLI-exe FixtureRoot ExtractedWorkspace WorkingConfig TargetConfig EvidenceDirectory');
 const fixture=fs.realpathSync(fixtureRoot),temp=fs.realpathSync(os.tmpdir()),under=(base,file)=>{const relative=path.relative(base,file);return relative&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
 if(path.dirname(fixture).toLowerCase()!==temp.toLowerCase()||!path.basename(fixture).startsWith('jade-cli-stream-seed-'))throw Error('An existing owned disposable native stream seed is required.');
 const owned=file=>{const value=fs.realpathSync(file);if(!under(fixture,value))throw Error('Native test path escapes its admitted fixture.');return value;};
 const workspace=owned(workspaceArgument),working=JSON.parse(fs.readFileSync(owned(workingFile))),target=JSON.parse(fs.readFileSync(owned(targetFile)));
 for(const config of [working,target]){owned(config.databasePath);owned(config.iniPath);owned(path.join(config.databasePath,'_control.dat'));}
 if(fs.realpathSync(working.databasePath).toLowerCase()===fs.realpathSync(target.databasePath).toLowerCase())throw Error('Working and publication target must be separate owned databases.');
 const project=await scanProject(workspace);if(!project.schemas.length)throw Error('The explicit workspace must already contain extracted native schemas.');
 const evidence=path.resolve(evidenceArgument);if(under(fixture,evidence))throw Error('Evidence must survive outside the disposable fixture.');fs.mkdirSync(evidence,{recursive:true});const run=fs.mkdtempSync(path.join(fixture,'publish-command-'));
 const prior={state:process.env.JADE_TOOLS_STATE_DIRECTORY,connections:process.env.JADE_TOOLS_CONNECTIONS_FILE};process.env.JADE_TOOLS_STATE_DIRECTORY=path.join(run,'broker');process.env.JADE_TOOLS_CONNECTIONS_FILE=path.join(run,'connections.json');
 const session=new CliWorkingSession({entry:path.resolve(entry)}),calls=[];let approved=false,busy=false,log='';
 const record=text=>{if(log.length<131072)log+=String(text).slice(0,131072-log.length);};
 const service={runNative:async(executable,args,options,output)=>{
  if(args.includes('app=JadeBatchExtract'))throw Error('Native publication unexpectedly used legacy Every extraction.');
  const publishing=args.includes('path='+target.databasePath)&&args.some(value=>value.startsWith('schemaFile='));if(publishing&&!approved)throw Error('Target load began without explicit fixture approval.');
  const input=args.find(value=>value.startsWith('schemaFile='))?.slice('schemaFile='.length);let frozenBundleSha256;
  if(input){const directory=path.dirname(input),digest=crypto.createHash('sha256');for(const file of fs.readdirSync(directory).filter(file=>/\.(mul|scm|ddx)$/i.test(file)).sort()){digest.update(file);digest.update(fs.readFileSync(path.join(directory,file)));}frozenBundleSha256=digest.digest('hex');}
  calls.push({application:args.find(value=>value.startsWith('app='))||'jadloadb',publishing,...(frozenBundleSha256?{frozenBundleSha256}:{})});return session.runNative(executable,args,options,output);
 }};
 gateway.configure(service);
 const folder={uri:{scheme:'file',fsPath:workspace}},commands=new Map(),context={subscriptions:[],workspaceState:{get:(_key,fallback)=>fallback,update:async()=>{}}};
 const vscode={workspace:{workspaceFolders:[folder],textDocuments:[],openTextDocument:async file=>({uri:{scheme:'file',fsPath:file}})},commands:{registerCommand:(name,handler)=>(commands.set(name,handler),{dispose(){}})},window:{showErrorMessage:async text=>record(text),showInformationMessage:async text=>record(text),showWarningMessage:async()=>{approved=true;return 'Update Jade Base';}}};
 try{
  working.root=working.root||working.storagePath||path.join(run,'working-state');if(!under(fixture,path.resolve(working.root)))throw Error('Working staging root escapes its admitted fixture.');
  fs.mkdirSync(path.join(working.root,'logs'),{recursive:true});target.workspaceRoots=[workspace];target.schema=project.schemas[0].name;
  registerProjectTools(vscode,context,{service:session,config:()=>target,isBusy:()=>busy,setBusy:async value=>busy=value,output:{clear(){},show(){},append:record,appendLine:text=>record(text+'\n')},prepareWorking:async()=>working});
  const result=await commands.get('jadeNative.publishWorkspace')();
  const receipt={success:result?.success===true,code:result?.code,approved,sourceSnapshotSha256:project.hash,workspaceSchemaCount:project.schemas.length,workspaceEntryCount:project.entries.length,aggregateDdx:project.entries.filter(entry=>path.basename(entry.file)==='schemaResources.ddx').length,nativeExposureSections:project.entries.filter(entry=>path.basename(entry.file)==='_exposedListDefinitions.sec').length,targetLoads:calls.filter(call=>call.publishing).length,nativeCalls:calls,busyReleased:busy===false,userDatabaseOpened:false,ownedTargetPublished:result?.success===true,legacyEveryUsed:false};
  const bundleHashes=calls.filter(call=>call.frozenBundleSha256).map(call=>call.frozenBundleSha256);receipt.identicalFrozenBundle=bundleHashes.length===2&&bundleHashes[0]===bundleHashes[1];
  fs.writeFileSync(path.join(evidence,'registered-full-publish.json'),JSON.stringify(receipt,null,2));fs.writeFileSync(path.join(evidence,'registered-full-publish.log'),log);

  if(!receipt.success||!approved||receipt.targetLoads!==1||busy)throw Error('Actual owned-fixture full publication failed: '+(result?.error||result?.code));
  if(!receipt.identicalFrozenBundle)throw Error('Working validation and target publication did not consume identical frozen joined inputs.');
  console.log(JSON.stringify(receipt));
 }finally{
  gateway.configure(undefined);await session.dispose();const stopped=cp.spawnSync(path.resolve(entry),['shutdown','--json'],{cwd:run,env:process.env,encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:1048576});
  if(prior.state===undefined)delete process.env.JADE_TOOLS_STATE_DIRECTORY;else process.env.JADE_TOOLS_STATE_DIRECTORY=prior.state;
  if(prior.connections===undefined)delete process.env.JADE_TOOLS_CONNECTIONS_FILE;else process.env.JADE_TOOLS_CONNECTIONS_FILE=prior.connections;
  if(stopped.status===0)fs.rmSync(run,{recursive:true,force:true});else throw Error('Owned broker shutdown failed; retained disposable run '+run);
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
