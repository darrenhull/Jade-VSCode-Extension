'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
test('the updater entry verifies the native CLI distribution without a sibling checkout',t=>{
 const source=fs.mkdtempSync(path.join(os.tmpdir(),'jade-native-pin-'));t.after(()=>fs.rmSync(source,{recursive:true,force:true}));
 fs.writeFileSync(path.join(source,'jade-cli.exe'),'native');fs.writeFileSync(path.join(source,'distribution.json'),JSON.stringify({formatVersion:2,runtime:'native-cpp',platform:'win32',arch:'x64',executable:'jade-cli.exe',executableSha256:crypto.createHash('sha256').update('native').digest('hex'),runtimeFiles:{}}));
 const entry=path.resolve(__dirname,'../../scripts/update-cli.cjs');
 const result=spawnSync(process.execPath,[entry,'--verify-lock'],{cwd:os.tmpdir(),env:{...process.env,JADE_CLI_DISTRIBUTION:source},windowsHide:true,encoding:'utf8',timeout:10000});
 assert.ifError(result.error);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/integrity verified/);
});
