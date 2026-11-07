'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {assertPrivateIniPaths}=require('../../test/PrivateNativeFixture');
const root=path.resolve(require('node:os').tmpdir(),'jade-cli-integration-seed-owned');
test('copied fixture INI cannot retain another fixture journal/log/transient directory',()=>{
 for(const key of ['JournalRootDirectory','ActivityLogDirectory','FileDirectory','ProgramDataDirectory','JadeWorkDirectory','LogDirectory','CrashLogDirectory'])assert.throws(()=>assertPrivateIniPaths(path.join(root,'system'),`${key}=${path.resolve(root,'../jade-cli-integration-seed-other/journals')}\n`),/outside.*fixture/i);
});
test('state directories within the owned fixture are accepted unchanged',()=>{
 assert.doesNotThrow(()=>assertPrivateIniPaths(path.join(root,'system'),`JournalRootDirectory=${path.join(root,'journals')}\nFileDirectory=${path.join(root,'transient')}\nLogDirectory=<default>\n`));
});
test('fixture journals and transient directory must be explicitly isolated',()=>{for(const ini of ['', 'JournalRootDirectory=<default>\n','JournalRootDirectory='+path.join(root,'journals')+'\n'])assert.throws(()=>assertPrivateIniPaths(path.join(root,'system'),ini),/explicit.*fixture/i);});
