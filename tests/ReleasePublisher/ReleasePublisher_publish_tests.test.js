'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {ReleasePublisher}=require('../../scripts/ReleasePublisher.cjs');
const sha='a'.repeat(40),other='b'.repeat(40);
function fixture(t,{existing,tagSha,approved=true,publishedApproved=true,missingPublished=false,tamperedPublished=false}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-release-publisher-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'1.2.3'}));fs.mkdirSync(path.join(root,'release'));
 fs.writeFileSync(path.join(root,'release','product.zip'),'verified artifact');
 fs.writeFileSync(path.join(root,'release','SHA256SUMS'),crypto.createHash('sha256').update('verified artifact').digest('hex')+'  product.zip\n');
 const calls=[];
 const run=(program,args)=>{calls.push({program,args});if(program==='git'){
  if(args[0]==='merge-base')return{status:(args[2]===other?publishedApproved:approved)?0:1,stdout:''};
  if(args.includes('HEAD'))return{status:0,stdout:sha};
  return{status:tagSha?0:128,stdout:tagSha||''};
 }if(args[0]==='release'&&args[1]==='download'){const dir=args[args.indexOf('--dir')+1];fs.writeFileSync(path.join(dir,'product.zip'),'older approved build bytes');fs.writeFileSync(path.join(dir,'SHA256SUMS'),crypto.createHash('sha256').update('older approved build bytes').digest('hex')+'  product.zip\n');if(tamperedPublished)fs.writeFileSync(path.join(dir,'product.zip'),'changed published bytes');return{status:0,stdout:''};}if(args[0]==='api')return existing?{status:0,stdout:JSON.stringify({tag_name:'v1.2.3',assets:missingPublished?[]:[{name:'product.zip'},{name:'SHA256SUMS'}],...existing})}:{status:1,stdout:'',stderr:'HTTP 404 Not Found'};return{status:0,stdout:''};};
 return {root,calls,publisher:new ReleasePublisher({root,run})};
}
test('publishes a new version at the approved main SHA using verified build assets',t=>{const f=fixture(t),result=f.publisher.publish({repository:'darrenhull/Jade-VSCode-Extension',sha});assert.equal(result.published,true);const create=f.calls.find(c=>c.args[0]==='release'&&c.args[1]==='create');assert.ok(create.args.includes('--draft'));assert.ok(create.args.includes('--target'));assert.ok(create.args.includes(sha));assert.ok(f.calls.some(c=>c.args[1]==='upload'));assert.ok(f.calls.some(c=>c.args[1]==='edit'&&c.args.includes('--draft=false')));});
test('an already published version skips without overwriting it on a later docs-only main commit',t=>{const f=fixture(t,{existing:{draft:false,target_commitish:other},tagSha:other}),result=f.publisher.publish({repository:'darrenhull/Jade-Local-MCP',sha});assert.equal(result.skipped,true);assert.equal(f.calls.filter(c=>c.args[0]==='release'&&c.args[1]!=='download').length,0);});
test('retries a partial draft only at the same verified commit',t=>{const f=fixture(t,{existing:{draft:true,target_commitish:sha},tagSha:sha});assert.equal(f.publisher.publish({repository:'darrenhull/Jade-Local-MCP',sha}).published,true);assert.equal(f.calls.some(c=>c.args[1]==='create'),false);assert.ok(f.calls.some(c=>c.args[1]==='upload'&&c.args.includes('--clobber')));});
test('rejects mismatched tags, unreviewed commits and altered assets before publication',t=>{
 const mismatch=fixture(t,{tagSha:other});assert.throws(()=>mismatch.publisher.publish({repository:'darrenhull/Jade-Local-MCP',sha}),/tag.*commit/i);
 const unreviewed=fixture(t,{approved:false});assert.throws(()=>unreviewed.publisher.publish({repository:'darrenhull/Jade-Local-MCP',sha}),/approved main/i);
 const corrupt=fixture(t);fs.writeFileSync(path.join(corrupt.root,'release/product.zip'),'altered');assert.throws(()=>corrupt.publisher.publish({repository:'darrenhull/Jade-Local-MCP',sha}),/checksum/i);assert.equal(corrupt.calls.some(c=>c.args[0]==='release'),false);
});

test('published versions are skipped only after approved tag and existing assets are verified',t=>{for(const options of [{publishedApproved:false},{missingPublished:true},{tamperedPublished:true}]){const f=fixture(t,{existing:{draft:false,target_commitish:other},tagSha:other,...options});assert.throws(()=>f.publisher.publish({repository:'darrenhull/Jade-Local-MCP',sha}),/approved main|missing|checksum/i);assert.equal(f.calls.some(c=>c.args[1]==='upload'||c.args[1]==='edit'),false);}});
