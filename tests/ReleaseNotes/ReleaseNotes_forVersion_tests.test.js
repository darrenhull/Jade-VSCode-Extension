'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {releaseNotesForVersion}=require('../../scripts/ReleaseNotes.cjs');
test('release notes contain exactly the current installed changelog entry',()=>{
 const source='# 0.13.3 — Jade Tools\r\n\r\n- Format complete CLS files.\r\n- Discover Jade Tools.\r\n\r\n# 0.13.2 — Maintenance\r\n\r\n- Internal build changes.\r\n';
 assert.equal(releaseNotesForVersion(source,'0.13.3'),'- Format complete CLS files.\n- Discover Jade Tools.');
 assert.equal(releaseNotesForVersion(source,'0.13.2'),'- Internal build changes.');
});
test('unknown versions cannot inherit older features or generate pull request notes',()=>{
 assert.equal(releaseNotesForVersion('# 0.13.2 — Old\n- Previous feature.\n','0.13.3'),'');
 assert.throws(()=>releaseNotesForVersion('','0.13.3.*'),/version/i);
});
