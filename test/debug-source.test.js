'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {debugMethods,nativeLocation,breakpointPosition}=require('../extension/src/debug-source');
const text='jadeVersionNumber "25.0.02";\nschemaDefinition\nDemo subschemaOf RootSchema partialDefinition;\ntypeHeaders\nThing subclassOf Object transient;\ntypeDefinitions\nThing completeDefinition\n(\njadeMethodDefinitions\ncalculate() : Integer;\n)\ntypeSources\nThing (\njadeMethodSources\ncalculate\n{\ncalculate() : Integer;\nvars\n answer : Integer;\nbegin\n answer := 40;\n answer := answer + 2;\n return answer;\nend;\n}\n)';
test('native method positions map to original CLS lines across CRLF and LF',()=>{
 const method=debugMethods(text,'Thing.cls')[0];assert.equal(method.owner,'Thing');assert.equal(method.schema,'Demo');
 const native='calculate() : Integer;\r\nvars\r\n answer : Integer;\r\nbegin\r\n answer := 40;\r\n answer := answer + 2;\r\n return answer;\r\nend;';
 const position=native.indexOf('answer := answer');const mapped=nativeLocation(method,native,position);assert.equal(mapped.line,22);
 assert.equal(breakpointPosition(method,native,22),position);
 assert.equal(nativeLocation(method,'\n'+native,position+1).line,22);
 assert.equal(breakpointPosition(method,'\n'+native,22),position+1);
});
test('only parameterless concrete instance methods can be launched initially',()=>{
 assert.equal(debugMethods(text.replaceAll('calculate()','calculate(n : Integer)'),'Thing.cls').length,0);
 assert.equal(debugMethods(text.replaceAll('calculate() : Integer;','calculate() : Integer abstract;'),'Thing.cls').length,0);
});
test('locals include comma declarations and ignore comments containing begin or fake declarations',()=>{
 const source=text.replace(' answer : Integer;',' // begin fake : String;\n first, second : Integer;\n /* ignored : String; */\n answer : Integer;');
 assert.deepEqual(debugMethods(source,'Thing.cls')[0].variables,['first','second','answer']);
});
test('source catalog includes parameters without treating return types as variables',()=>{
 const source=text.replaceAll('calculate()','calculate(left, right : Integer)');
 assert.deepEqual(debugMethods(source,'Thing.cls',false)[0].variables,['left','right','answer']);
});
test('abstract classes are browsable but cannot be launched as new transient instances',()=>{
 const source=text.replace('subclassOf Object transient','subclassOf Object abstract, transient');
 assert.equal(debugMethods(source,'Thing.cls').length,0);
 assert.equal(debugMethods(source,'Thing.cls',false).length,1);
});

test('native unit-test launches are identified from method options for framework execution',()=>{
 const unit=text.replaceAll('calculate() : Integer;','calculate() unitTest;');assert.equal(debugMethods(unit,'Thing.cls')[0].unitTest,true);
 assert.equal(debugMethods(text,'Thing.cls')[0].unitTest,false);
});
