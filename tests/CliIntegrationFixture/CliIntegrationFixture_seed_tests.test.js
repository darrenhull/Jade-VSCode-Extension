'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {requirePrivateSeed}=require('../../test/cli-integration-fixture');
test('native fixture rejects copied external INI state before any CLI/native process',{concurrency:false},t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-cli-integration-seed-preflight-')),database=path.join(root,'system'),ini=path.join(root,'working.ini');fs.mkdirSync(database);
 const oldSeed=process.env.JADE_TEST_SEED,oldIni=process.env.JADE_TEST_INI;
 t.after(()=>{for(const[key,value]of[['JADE_TEST_SEED',oldSeed],['JADE_TEST_INI',oldIni]])if(value===undefined)delete process.env[key];else process.env[key]=value;assert.equal(path.dirname(root),fs.realpathSync(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});});
 process.env.JADE_TEST_SEED=database;process.env.JADE_TEST_INI=ini;
 fs.writeFileSync(ini,`[PersistentDb]\nJournalRootDirectory=${path.join(root,'..','other-journals')}\n[TransientDb]\nFileDirectory=${path.join(root,'transient')}\n`);
 assert.throws(()=>requirePrivateSeed(),/INI.*outside|owned fixture/);
 fs.writeFileSync(ini,`[PersistentDb]\nJournalRootDirectory=${path.join(root,'journals')}\n[TransientDb]\nFileDirectory=${path.join(root,'transient')}\n`);
 assert.equal(requirePrivateSeed().databasePath,fs.realpathSync(database));
});
