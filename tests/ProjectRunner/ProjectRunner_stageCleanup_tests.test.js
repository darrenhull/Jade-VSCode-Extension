'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{createRequire}=require('node:module');
function setup(t,mode){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-runner-stage-test-')),stage=path.join(root,'stage');fs.mkdirSync(stage);fs.writeFileSync(path.join(stage,'frozen.scm'),'frozen');t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const filename=path.resolve(__dirname,'../../extension/src/project-runner.js'),localRequire=createRequire(filename),module={exports:{}};let closed=false,cleaned=0;
 const build={joinProject:async()=>({directory:stage,cleanup(){assert.equal(closed,true,'cleanup ran before native load closed');cleaned++;fs.rmSync(stage,{recursive:true});}}),loadProject:async()=>{await Promise.resolve();closed=true;if(mode==='throw')throw Error('native transport failed');return {success:mode==='success',code:mode==='success'?0:mode==='cancel'?130:6023,cancelled:mode==='cancel',diagnostics:[]};}};
 vm.runInNewContext('(function(require,module){'+fs.readFileSync(filename,'utf8')+'\n})',{Buffer,console})(name=>name==='./native-project-build'?build:name==='./native-renames'?{applyRenames:async()=>{}}:localRequire(name),module);
 return {stage,get cleaned(){return cleaned;},run:()=>module.exports.runProject({}, {root,installPath:root,databasePath:path.join(root,'system')},{hash:'snapshot',schemas:[],entries:[],migrations:[]},'compile',[])};
}
for(const mode of ['success','failure','cancel','throw'])test('Working '+mode+' closes its native consumer before removing the owned frozen bundle',async t=>{
 const fixture=setup(t,mode);if(mode==='throw')await assert.rejects(fixture.run(),/native transport failed/);else{const result=await fixture.run();assert.equal(result.code,mode==='success'?0:mode==='cancel'?130:6023);assert.equal(result.passed,mode==='success');}
 assert.equal(fixture.cleaned,1,'Working runner leaked its joined schema bundle');assert.equal(fs.existsSync(fixture.stage),false);
});