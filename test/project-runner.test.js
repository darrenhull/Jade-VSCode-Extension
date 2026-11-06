'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {dynamicDependencies,subsetProject}=require('../extension/src/project-runner');
test('dynamic class lookups select the complete workspace while static tests keep unrelated types out',()=>{
 const header={file:'A.scm',hash:'header'},staticClass={file:'Tests.cls',owner:'Tests',model:{code:'create cat transient;'}};
 const project={schemas:[{name:'A',parent:'RootSchema',header,classes:[staticClass,{file:'Dynamic.cls',owner:'Dynamic',model:{code:'c := schema.getClass(typeName); create obj as c transient;'}}],entries:[{file:'Tests.cls',extension:'.cls',hash:'a'},{file:'Dynamic.cls',extension:'.cls',hash:'b'},{file:'locale.sec',extension:'.sec',hash:'c'}]}]};
 assert.equal(dynamicDependencies(project,['Tests.cls']),false);assert.equal(dynamicDependencies(project,['Dynamic.cls']),true);
 const subset=subsetProject(project,['Tests.cls']);assert.deepEqual(subset.schemas[0].classes.map(c=>c.owner),['Tests']);assert.ok(subset.entries.some(e=>e.file==='locale.sec'));
});
