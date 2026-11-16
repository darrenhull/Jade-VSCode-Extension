'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{pickClass}=require('../../extension/src/class-browser-ui');
test('async native search ignores stale replies and cannot accept the previous row while the next filter is pending',async()=>{
 const disposable={dispose(){}},requests=[],picker={selectedItems:[],items:[],disposed:false,onDidChangeValue(fn){this.change=fn;return disposable;},onDidAccept(fn){this.accept=fn;return disposable;},onDidHide(fn){this.hideEvent=fn;return disposable;},show(){},dispose(){this.disposed=true;}};
 const browser={search:query=>new Promise(resolve=>requests.push({query,resolve}))};
 const result=pickClass({window:{createQuickPick:()=>picker,showErrorMessage:async()=>{}}},browser);
 const page=name=>({items:[{schema:'Pets',name}],total:1,label:'1–1 of 1 classes'});
 try{
  requests[0].resolve(page('Old'));await Promise.resolve();picker.selectedItems=[picker.items[0]];
  picker.value='New';picker.change('New');picker.accept();
  assert.equal(picker.disposed,false,'Pending native filter must not select a stale previous row');
  picker.value='Newest';picker.change('Newest');requests[2].resolve(page('Newest'));await Promise.resolve();
  requests[1].resolve(page('New'));await Promise.resolve();
  assert.equal(picker.items[0].row.name,'Newest');assert.equal(picker.busy,false);
  picker.selectedItems=[picker.items[0]];picker.accept();assert.equal((await result).name,'Newest');
 }finally{picker.hideEvent();await result;}
});
