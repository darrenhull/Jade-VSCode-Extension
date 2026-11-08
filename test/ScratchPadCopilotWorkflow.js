'use strict';
const assert=require('node:assert/strict');
const {parseSource}=require('../extension/src/source_symbols');
/** Acceptance checks for actual UI-produced source; this does not emulate AI. */
class ScratchPadCopilotWorkflow {
  constructor(scenario){this.scenario=scenario;}
  assertSource(text,{initialCellCount,currentCellCount}){
    assert.equal(currentCellCount,initialCellCount,'Editing must retain the existing cell count.');
    const code=parseSource(text,'scratch.jade').code;
    assert.equal([...code.matchAll(/\bbegin\b/g)].length,1,'Accepted code must have one top-level Workspace body.');
    assert.equal([...code.matchAll(/\bend\s*;/g)].length,1,'Accepted code must end one Workspace body.');
    assert.doesNotMatch(code,/:\s*Decimal\s*;/,'Local Decimal requires a descriptor.');
    const declarations=[...code.slice(0,code.search(/\bbegin\b/)).matchAll(/^\s*([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*:\s*([^;]+);/gm)].map(match=>({names:match[1].split(',').map(name=>name.trim()),type:match[2].replace(/\s/g,'')}));
    // This is a narrow regression for known numeric locals, not a type checker.
    // Other receiver APIs (including the legitimate Any.asString) are native.
    for(const declaration of declarations.filter(item=>/^(?:Integer|Integer64|Real|Decimal(?:\[[\d,]+\])?)$/.test(item.type)))for(const name of declaration.names)assert.doesNotMatch(code,new RegExp('\\b'+name+'\\s*\\.\\s*(?:asString|toString|String)\\s*\\('),'Use native primitive .String conversion for numeric local '+name+'.');
    for(const declaration of this.scenario.requiredDeclarations||[])assert.ok(declarations.some(item=>item.names.includes(declaration.name)&&item.type===declaration.type.replace(/\s/g,'')),'Preserve the requested declaration '+declaration.name+'.');
    for(const type of this.scenario.requiredTypes||[])assert.ok(declarations.some(item=>item.type===type.replace(/\s/g,'')),'Include the requested local type '+type+'.');
    for(const value of this.scenario.preservedStrings||[])assert.ok(text.includes(value),'Preserve unrelated output '+JSON.stringify(value)+'.');
  }
  assertAccepted({text,initialCellCount,currentCellCount,nativeResult}){
    this.assertSource(text,{initialCellCount,currentCellCount});
    assert.equal(nativeResult?.code,0,'Actual native compilation must return exit code zero.');
    assert.equal(nativeResult?.passed,true,'Actual native compilation must pass.');
    assert.equal(nativeResult?.report?.compiled,true,'A UI response or accepted suggestion alone is not native compilation evidence.');
  }
}
module.exports={ScratchPadCopilotWorkflow};
