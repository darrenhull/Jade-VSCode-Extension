'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {ClassBrowserModel}=require('../../extension/src/class-browser-model');
test('retains same-named classes from different projects and requires project to resolve them',()=>{
 const model=new ClassBrowserModel();model.setClasses([{schema:'Pets',name:'Fish',projectId:'file:///one'},{schema:'Pets',name:'Fish',projectId:'file:///two'}]);
 assert.equal(model.page().total,2);assert.equal(model.find({schema:'Pets',name:'Fish'}),undefined);
 const first=model.find({schema:'Pets',name:'Fish',projectId:'file:///one'});assert.ok(first);assert.notEqual(first.browserId,model.rows[1].browserId);
 assert.equal(model.positionOf({schema:'Pets',name:'Fish',projectId:'file:///two'}).position,2);
});
