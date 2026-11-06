'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
test('the updater entry verifies the pinned public SDK dependency without a sibling checkout',()=>{
 const helper=require('jade-tools-cli/automation/cli-release-updater');
 assert.equal(typeof helper.prototype.run,'function');
 const entry=path.resolve(__dirname,'../../scripts/update-cli.cjs');
 const result=spawnSync(process.execPath,[entry,'--verify-lock'],{cwd:os.tmpdir(),windowsHide:true,encoding:'utf8',timeout:10000});
 assert.ifError(result.error);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/integrity verified/);
});
