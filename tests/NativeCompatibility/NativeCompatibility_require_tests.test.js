'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {requireNativeVersion}=require('../../scripts/NativeCompatibility.cjs');
test('Scratch Pad packages fail before staging a backend that cannot execute Workspaces',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-native-compatibility-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const version of ['0.3.0','0.3.1']){fs.writeFileSync(path.join(root,'distribution.json'),JSON.stringify({packageVersion:version}));assert.throws(()=>requireNativeVersion(root,'0.4.0'),/requires.*0\.4\.0/i);}
 for(const version of ['0.4.0','0.4.1','0.10.0','1.0.0']){fs.writeFileSync(path.join(root,'distribution.json'),JSON.stringify({packageVersion:version}));assert.equal(requireNativeVersion(root,'0.4.0'),version);}
 fs.writeFileSync(path.join(root,'distribution.json'),JSON.stringify({packageVersion:'0.4.0-preview'}));assert.throws(()=>requireNativeVersion(root,'0.4.0'),/version/i);
});
