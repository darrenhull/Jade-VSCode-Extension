'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process'),{pathToFileURL,fileURLToPath}=require('node:url');
const {OwnedCliFixture}=require('../../test/OwnedCliFixture');
const {registerLanguageTools}=require('../../extension/src/language-tools');
const {ClassBrowserModel}=require('../../extension/src/class-browser-model');
const {createClassDiscoveryRows}=require('../../extension/src/class-discovery-rows');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
test('actual native missing/version cache repair indexes all extracted-layout classes and search',{skip:process.env.JADE_SOURCE_INDEX_STARTUP_PROOF!=='1',timeout:60000},async()=>{
 const entry=path.resolve(process.env.JADE_CLI_ENTRY||'packages/jade-cli-win-x64/jade-cli.exe'),fixture=new OwnedCliFixture({entry}),receipt=await fixture.run(async({root:stage,session})=>{
  const root=path.join(stage,'SourceStartup'),template=fs.readFileSync(path.join(__dirname,'../SourceIndexCache/fixtures/BrowserMetadata.cls'),'utf8');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'.jade-extraction'),'opened extraction root');
  const git=spawnSync('git',['init','--quiet',root],{encoding:'utf8',windowsHide:true});assert.equal(git.status,0,git.stderr);const hashes=new Map();
  for(let s=0;s<4;s++){const schema='Schema'+s,types=path.join(root,'schemas',schema,'types');fs.mkdirSync(types,{recursive:true});fs.writeFileSync(path.join(root,'schemas',schema+'.scm'),'schemaDefinition\n'+schema+' subschemaOf RootSchema partialDefinition;\n');for(let c=0;c<4;c++){const name='Fish'+s+c,file=path.join(types,name+'.cls'),bytes=Buffer.from(template.replaceAll('Pets',schema).replaceAll('Fish',name));fs.writeFileSync(file,bytes);hashes.set(file,digest(bytes));}}
  const cases=[];for(const invalid of ['missing','old-version']){
   const directory=path.join(root,'.jade/source-index');if(invalid==='old-version')for(const name of fs.readdirSync(directory).filter(value=>/^v2-\d+\.json$/.test(value))){const file=path.join(directory,name),row=JSON.parse(fs.readFileSync(file,'utf8'));row.nativeVersion='jade-cli/0.0.0/source-index/2';fs.writeFileSync(file,JSON.stringify(row));}
   const uri=file=>({scheme:'file',fsPath:file,toString:()=>pathToFileURL(file).href}),folder={uri:uri(root.toLowerCase()),name:'SourceStartup'},noop=()=>({dispose(){}}),calls=[],logs=[],reads=[];
   const client={sourceCapabilities:config=>session.sourceCapabilities(config),request:(command,body,...args)=>{calls.push({command,body});return session.request(command,body,...args);}};
   const vscode={CompletionItemKind:{Class:1,Property:2,Method:3,Variable:4,Keyword:5},languages:new Proxy({},{get:()=>noop}),window:{createOutputChannel:()=>({appendLine:line=>logs.push(line),dispose(){}})},Uri:{file:uri,parse:value=>uri(fileURLToPath(value))},workspace:{workspaceFolders:[folder],textDocuments:[],getConfiguration:()=>({get:(_name,fallback)=>fallback}),getWorkspaceFolder:()=>folder,findFiles:async()=>assert.fail('Native discovery must own the source list'),fs:{readFile:resource=>{reads.push(resource.fsPath);return fsp.readFile(resource.fsPath);}},createFileSystemWatcher:()=>({dispose(){},onDidCreate:noop,onDidChange:noop,onDidDelete:noop}),onDidOpenTextDocument:noop,onDidChangeTextDocument:noop,onDidCloseTextDocument:noop,onDidChangeWorkspaceFolders:noop,onDidChangeConfiguration:noop}};
   const language=registerLanguageTools(vscode,{subscriptions:[]},{client});try{
    // This first-use execution gate must not hydrate JavaScript browser models.
    await language.ensureSourceIndex({workspaceRoots:[root]});assert.equal(reads.length,0);assert.equal(language.index.records.size,0);
    const count=calls.length;await language.ensureSourceIndex({workspaceRoots:[root]});assert.equal(calls.length,count,'Unchanged warm execution adds no source preparation');
    await language.index.ready();await language.index.persist();const browser=new ClassBrowserModel();browser.setClasses(createClassDiscoveryRows(()=>folder)(language.index.project.groups));
    assert.equal(browser.rows.length,16);assert.equal(browser.schemas().length,4);assert.equal(browser.search('Fish').total,16);assert.equal(browser.search('Fish32').items[0]?.schema,'Schema3');
    assert.equal(calls.filter(row=>row.command==='source.index.refresh').length,1);assert.ok(calls.filter(row=>row.command==='source.index.prepare').every(row=>row.body.config.timeoutMilliseconds<=600000&&row.body.config.timeoutMilliseconds>590000));
    for(const [file,hash]of hashes)assert.equal(digest(fs.readFileSync(file)),hash);
    assert.ok(!logs.some(line=>/missing, corrupt|Initialise or refresh/.test(line)),logs.join('\n'));
    cases.push({invalid,classes:browser.rows.length,schemas:browser.schemas().length,searchMatches:browser.search('Fish').total,nativeRefreshes:1,executionGateSourceReads:0,warmGateRequests:0});
   }finally{await language.index.persist();language.index.dispose();}
  }
  const directory=path.join(root,'.jade/source-index'),before=new Map(fs.readdirSync(directory).filter(name=>/^v2-\d+\.json$/.test(name)).map(name=>[name,digest(fs.readFileSync(path.join(directory,name)))]));
  const failed=await session.request('source.index.refresh',{config:{workspaceRoots:[root],timeoutMilliseconds:1}}).promise;assert.equal(failed.passed,false);assert.equal(failed.timedOut,true);for(const [name,hash]of before)assert.equal(digest(fs.readFileSync(path.join(directory,name))),hash,'An expired pre-capture refresh changed a valid shard');
  return{cases,expiredDeadlinePreservedShards:true,sourceFilesUntouched:true,databaseOpened:false,nativeExecutableSha256:digest(fs.readFileSync(entry))};
 });
 fs.mkdirSync(path.join(__dirname,'receipts'),{recursive:true});fs.writeFileSync(path.join(__dirname,'receipts/native-startup.json'),JSON.stringify({...receipt,ownedBrokerExited:true},null,2)+'\n');console.log(JSON.stringify(receipt));
});
