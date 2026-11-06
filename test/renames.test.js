'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {readRenames,planRenames}=require('../extension/src/native-renames');
test('native class rename migrations preserve explicit intent and are safe to replay or bootstrap',()=>{
 const operations=readRenames('JadeCommandFile\nJadeVersionNumber 25.0.02\nCommands\nRename Class Pets::Cat Feline\n','rename.jcf');assert.equal(operations[0].old,'Pets::Cat');
 const source=new Set(['Pets::Feline']);assert.equal(planRenames(operations,new Set(['Pets::Cat']),source).length,1);
 assert.equal(planRenames(operations,new Set(['Pets::Feline']),source).length,0);
 assert.equal(planRenames(operations,new Set(),source).length,0,'a fresh install creates the final type from source');
 assert.throws(()=>planRenames(operations,new Set(['Pets::Cat','Pets::Feline']),source),/both exist/);
 assert.throws(()=>planRenames(operations,new Set(['Pets::Cat']),new Set(['Pets::Cat'])),/Rename the source/);
});
