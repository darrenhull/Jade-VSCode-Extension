'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const gateway=require('../../extension/src/cli-gateway');
const {joinProject}=require('../../extension/src/native-project-build');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-bundle-lifecycle-test-'));
 const identity=crypto.createHash('sha256').update(path.resolve(root).toLowerCase()).digest('hex').slice(0,8),prefix='jd-'+identity;
 const stages=()=>fs.readdirSync(os.tmpdir()).filter(name=>name===prefix||name.startsWith(prefix+'-')).map(name=>path.join(os.tmpdir(),name));
 t.after(()=>{gateway.configure(undefined);for(const dir of stages())fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(root,{recursive:true,force:true});});
 return {root,stages,working:{root,installPath:root,databasePath:path.join(root,'system'),iniPath:path.join(root,'working.ini')},project:{root,entries:[],schemas:[{name:'Pets',header:{text:'jadeVersionNumber "25.0.02";\r\nschemaDefinition\r\nPets subschemaOf RootSchema completeDefinition;\r\n'},entries:[],classes:[]}]}};
}
test('a joined frozen bundle remains readable across validation and publish, then exposes idempotent owned cleanup',async t=>{
 const f=fixture(t);let calls=0;
 gateway.configure({runNative:async(_exe,args)=>{calls++;fs.writeFileSync(args.at(-2),'jadeVersionNumber "25.0.02";\r\nschemaDefinition\r\nPets subschemaOf RootSchema completeDefinition;\r\n');return {success:true,code:0,output:''};}});
 const bundle=await joinProject(f.working,f.project);
 assert.equal(calls,1);assert.ok(fs.existsSync(bundle.batch));assert.ok(fs.existsSync(bundle.schemas[0].output));
 assert.equal(typeof bundle.cleanup,'function','joined bundle must expose owned cleanup after its final consumer');
 const sentinel=path.join(f.root,'source-sentinel');fs.writeFileSync(sentinel,'unpublished');
 await bundle.cleanup();await bundle.cleanup();assert.equal(fs.existsSync(bundle.directory),false);assert.equal(fs.readFileSync(sentinel,'utf8'),'unpublished');assert.deepEqual(f.stages(),[]);
});
test('native join failure removes only its owned partially staged bundle',async t=>{
 const f=fixture(t);gateway.configure({runNative:async()=>({success:false,code:6023,output:'native error 6023'})});
 await assert.rejects(joinProject(f.working,f.project),/native error 6023/);assert.deepEqual(f.stages(),[],'failed join leaked its private staged schema tree');
});
test('a staging failure after creating schema files removes the incomplete bundle without launching Jade',async t=>{
 const f=fixture(t);f.project.schemas[0].entries.push({extension:'.ddx',file:path.join(f.root,'bad.ddx'),text:'not XML'});let calls=0;
 gateway.configure({runNative:async()=>{calls++;throw Error('must not launch');}});
 await assert.rejects(joinProject(f.working,f.project),/XML|DDX|schema/i);assert.equal(calls,0);assert.deepEqual(f.stages(),[],'partial stage failure leaked native source files');
});
test('cancelled staging cleans its owned allocation and never launches Jade',async t=>{
 const f=fixture(t),abort=new AbortController();abort.abort();f.working.signal=abort.signal;let calls=0;
 gateway.configure({runNative:async()=>{calls++;throw Error('must not launch');}});
 await assert.rejects(joinProject(f.working,f.project),/cancel/i);assert.equal(calls,0);assert.deepEqual(f.stages(),[]);
});