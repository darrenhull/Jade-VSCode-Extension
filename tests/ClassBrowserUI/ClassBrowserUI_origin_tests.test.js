'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {pickClass}=require('../../extension/src/class-browser-ui');
const {ClassBrowserModel}=require('../../extension/src/class-browser-model');
test('records the actual accepted picker query without changing selected class identity',async()=>{
 const disposable={dispose(){}},picker={selectedItems:[],onDidChangeValue(fn){this.change=fn;return disposable;},onDidAccept(fn){this.accept=fn;return disposable;},onDidHide(){return disposable;},show(){},dispose(){}};
 const browser=new ClassBrowserModel();browser.setClasses([{name:'Fish',schema:'Pets',projectName:'One'}]);let origin;
 const result=pickClass({window:{createQuickPick:()=>picker}},browser,{schema:'Pets',onAccept:(_row,value)=>{origin=value;}});
 picker.value='Pets::Fish';picker.change(picker.value);picker.selectedItems=[picker.items[0]];picker.accept();
 assert.equal(await result,picker.items[0].row);assert.deepEqual(origin,{query:'Pets::Fish',schema:'Pets'});assert.equal(picker.items[0].description,'One');
});
