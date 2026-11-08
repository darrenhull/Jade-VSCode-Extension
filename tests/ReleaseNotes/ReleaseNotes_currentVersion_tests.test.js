'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {releaseNotesForVersion}=require('../../scripts/ReleaseNotes.cjs');
test('the packaged extension version has user-facing release notes before a main release',()=>{
 const root=path.resolve(__dirname,'../..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'extension/package.json'),'utf8'));
 const notes=releaseNotesForVersion(fs.readFileSync(path.join(root,'extension/CHANGELOG.md'),'utf8'),manifest.version);
 assert.ok(notes.trim(),'The current extension version must not publish an empty release body.');
});