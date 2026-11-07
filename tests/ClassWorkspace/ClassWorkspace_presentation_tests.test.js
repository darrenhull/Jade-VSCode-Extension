"use strict";
const test=require("node:test"), assert=require("node:assert/strict");
const ui=require("../../extension/media/class-workspace");
test("member presentation follows fixed groups and never renders beyond one hundred members",()=>{
 const groups=ui.visibleGroups([{label:"Methods",items:Array.from({length:10000},(_,i)=>({id:String(i)}))},{label:"Properties",items:[{id:"p"}]},{label:"Constants",items:[]}]);
 assert.equal(groups[0].label,"Properties"); assert.equal(groups.flatMap(g=>g.items).length,100); assert.equal(groups.length,2);
});
test("shortcuts never take slash away from code or editable controls",()=>{
 for(const target of [{tagName:"INPUT"},{tagName:"TEXTAREA"},{isContentEditable:true},{closest:selector=>selector.includes(".cm-editor")?{}:null}]) assert.equal(ui.ownsSearchShortcut(target),false);
 assert.equal(ui.ownsSearchShortcut({tagName:"BUTTON",closest:()=>null}),true);
});
test("overview distinguishes unknown metadata from valid zero and false values",()=>{
 assert.equal(ui.displayValue(undefined),"Not available"); assert.equal(ui.displayValue(0),"0"); assert.equal(ui.displayValue(false),"false");
});
test("arrow selection wraps and empty collections remain unselected",()=>{
 assert.equal(ui.nextIndex(0,-1,3),2); assert.equal(ui.nextIndex(2,1,3),0); assert.equal(ui.nextIndex(0,1,0),-1);
});
