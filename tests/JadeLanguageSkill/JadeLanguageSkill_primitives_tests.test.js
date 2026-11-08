'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const crypto=require('node:crypto');
const types=['Any','Binary','Boolean','Byte','Character','Date','Decimal','Integer','Integer64','MemoryAddress','Point','Real','String','StringUtf8','Time','TimeStamp','TimeStampInterval','TimeStampOffset'];
test('primitive guide and native declaration fixture cover every primitive in the official Jade2025 index without invented types',()=>{
 const guide=fs.readFileSync(path.resolve(__dirname,'../../extension/skills/jade-language/references/primitive-types.md'),'utf8'),fixture=fs.readFileSync(path.resolve(__dirname,'../../test/fixtures/jade-primitive-matrix.jade'),'utf8');
 for(const type of types){assert.ok(guide.includes('| `'+type+'` |'),'Missing official primitive '+type);assert.match(fixture,new RegExp(':\\s*'+type+'(?:\\[|\\s*;)'),'Missing native declaration for '+type);}
 assert.equal([...guide.matchAll(/^\| `(?:\w+)` \|/gm)].length,18);assert.match(guide,/Duration.*not|not.*Duration/i);assert.match(guide,/MemoryAddress.*null/i);assert.match(guide,/actualTime.*TimeStamp/);assert.match(guide,/actualDate/);assert.match(guide,/#FF/);
 assert.match(fixture,/Decimal\[12,2\]/);assert.match(fixture,/\.Byte/);assert.match(fixture,/addressValue := null;/);assert.match(fixture,/utf8Value := @"Jade";/);
 const skill=fs.readFileSync(path.resolve(__dirname,'../../extension/skills/jade-language/SKILL.md'),'utf8');assert.match(skill,/references\/primitive-types\.md/);
});
test('actual native audit covers the fixture inventory and distinguishes compile rejection from runtime overflow',()=>{
 const root=path.resolve(__dirname,'../..'),audit=JSON.parse(fs.readFileSync(path.join(root,'docs/test-evidence/primitive-audit.json'),'utf8'));assert.deepEqual(audit.primitiveTypes,types);assert.equal(audit.records.length,9);
 for(const record of audit.records){const bytes=fs.readFileSync(path.join(root,record.fixture));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),record.sourceSha256,'Re-run native verification when its fixture changes.');}
 const get=name=>audit.records.find(record=>record.fixture.endsWith('/'+name+'.jade'));
 for(const name of ['jade-primitive-matrix','jade-primitive-defaults','jade-current-clock-conversions','jade-byte-boundaries']){assert.equal(get(name).passed,true);assert.equal(get(name).compiled,true);assert.equal(get(name).executed,true);}
 assert.match(get('jade-primitive-matrix').output,/Integer64=2147483648/);assert.equal(get('jade-byte-boundaries').output,'0\n255\n');assert.match(get('jade-current-clock-conversions').output,/Byte=255/);
 for(const name of ['jade-byte-hex-unconverted','jade-application-time-unconverted']){assert.equal(get(name).code,6072);assert.equal(get(name).compiled,false);assert.equal(get(name).executed,false);}
 assert.equal(get('jade-application-actual-date').code,6026);
 for(const name of ['jade-byte-overflow-positive','jade-byte-overflow-negative']){assert.equal(get(name).code,4011);assert.equal(get(name).compiled,true);assert.equal(get(name).executed,true);assert.equal(get(name).output,'');assert.equal(get(name).runtimeError,4011);}
});

test('every native audit fixture retains exact verified bytes across Git checkout',()=>{const root=path.resolve(__dirname,'../..'),audit=JSON.parse(fs.readFileSync(path.join(root,'docs/test-evidence/primitive-audit.json'),'utf8')),{execFileSync}=require('node:child_process');const fixtures=audit.records.map(record=>record.fixture),attributes=execFileSync('git',['check-attr','text','--',...fixtures],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/);assert.deepEqual(attributes,fixtures.map(fixture=>fixture+': text: unset'),'Native receipts hash the exact compiled bytes; Git must not normalize them.');});
