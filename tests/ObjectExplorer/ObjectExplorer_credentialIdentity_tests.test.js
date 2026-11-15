'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {setup}=require('../../test/fixtures/object-ui.cjs');
const turn=()=>new Promise(resolve=>setImmediate(resolve));

for(const transition of ['appears','disappears','changes canonical spelling','becomes inaccessible']){
 test('Forget retains configured identity when the Source path '+transition,async()=>{
  const s=setup(),original=fs.realpathSync.native,configured=path.resolve(s.config.databasePath);
  let changed=false;
  fs.realpathSync.native=(file,...args)=>{
   if(path.resolve(file)!==configured)return original(file,...args);
   if((transition==='appears'&&!changed)||(transition==='disappears'&&changed))
    throw Object.assign(Error('Owned fixture Source is unavailable'),{code:'ENOENT'});
   if(transition==='becomes inaccessible'&&changed)
    throw Object.assign(Error('Owned fixture Source is offline'),{code:'EACCES'});
   return path.join(s.root,changed&&transition==='changes canonical spelling'?'long-source-spelling':'canonical-source-spelling');
  };
  let forgetting;
  try{
   await s.connect();const saved=[...s.secretValues.keys()][0];
   s.secretValues.set('unrelated-entry','unrelated secure value');changed=true;
   forgetting=s.commands.get('jadeNative.forgetInspectionSignIn')();await turn();s.clients[0].finishClose();
   const result=await forgetting;
   assert.equal(result?.forgotten,true,'Forget must not depend on Source filesystem availability');
   assert.equal(s.secretValues.has(saved),false,'Forget must delete the previously accepted configured-connection entry');
   assert.equal(s.secretValues.get('unrelated-entry'),'unrelated secure value');
   assert.equal(s.controller.session.client,undefined);assert.deepEqual(s.errors,[]);
  }finally{fs.realpathSync.native=original;await forgetting;await s.cleanup();}
 });
}

test('different configured aliases do not silently share saved credentials even when realpath reports one target',async()=>{
 const s=setup(),original=fs.realpathSync.native,first=path.resolve(s.config.databasePath),second=path.join(s.root,'other-configured-alias');
 fs.realpathSync.native=(file,...args)=>[first,second].includes(path.resolve(file))?path.join(s.root,'same-physical-source'):original(file,...args);
 let changing;
 try{
  await s.connect();assert.equal(s.prompts.length,2);
  s.config.databasePath=second;changing=s.changeConfiguration({affectsConfiguration:()=>true});s.clients[0].finishClose();await changing;
  await s.commands.get('jadeNative.connectObjects')();
  assert.equal(s.prompts.length,4,'A different configured connection must require its own sign-in choice');
  assert.equal(s.secretValues.size,2,'Keep the prior configured connection record intact');
 }finally{fs.realpathSync.native=original;await changing;await s.cleanup();}
});
