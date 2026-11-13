'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');const {scanProject}=require('../../extension/src/native-project'),{isIndexableSourcePath}=require('../../extension/src/source-index-scope');
test('source indexing and publication discovery exclude managed Working files',async t=>{
 assert.equal(isIndexableSourcePath('C:/project/.jade/working/Hidden.cls'),false);assert.equal(isIndexableSourcePath('C:/project/.JADE/source-index/Hidden.cls'),false);assert.equal(isIndexableSourcePath('C:/project/types/Pet.cls'),true);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'jade-managed-source-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'.jade','working'),{recursive:true});await fs.writeFile(path.join(root,'.jade','working','Bad.scm'),'This is managed state, not source');const project=await scanProject(root);assert.equal(project.schemas.length,0);assert.equal(project.entries.length,0);
});
