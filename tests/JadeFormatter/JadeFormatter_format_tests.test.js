'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {formattingEdits}=require('../../extension/src/jade-formatter');
function apply(text,options={},range,uri='example.jade') {
  for(const edit of formattingEdits(text,{tabSize:4,insertSpaces:true,...options},range,uri).reverse())
    text=text.slice(0,edit.start)+edit.text+text.slice(edit.end);
  return text;
}
const cls=body=>`jadeVersionNumber "25.0.02";\nschemaDefinition\nDemo subschemaOf RootSchema partialDefinition;\ntypeHeaders\n    Fish subclassOf Object transient;\ntypeDefinitions\n    Fish completeDefinition\n    (\n    attributeDefinitions\n        value: Integer number = 1;\n    )\ntypeSources\nFish (\njadeMethodSources\nrun\n{\n${body}\n}\n)\n`;
test('method formatting indents declarations, nested conditions, loops and epilog without changing tokens',()=>{
  const source='run();\nvars\nx : Integer;\nbegin\nif x = 1 then\nwhile x > 0 do\nx := x - 1; // keep  this\nendwhile;\nelseif x = 2 then\nx := 3;\nelse\nx := 4;\nendif;\nepilog\nx := 0;\nend;';
  const expected='run();\nvars\n    x : Integer;\nbegin\n    if x = 1 then\n        while x > 0 do\n            x := x - 1; // keep  this\n        endwhile;\n    elseif x = 2 then\n        x := 3;\n    else\n        x := 4;\n    endif;\nepilog\n    x := 0;\nend;';
  assert.equal(apply(source),expected);
  assert.equal(apply(expected),expected,'idempotent');
  assert.equal(source.replace(/\s/g,''),expected.replace(/\s/g,''));
});
test('CLS formatting preserves already formatted native declarations while formatting method bodies',()=>{
  const source=cls('run();\nbegin\nreturn;\nend;');
  assert.equal(apply(source,{},undefined,'Fish.cls'),source.replace('\nreturn;','\n    return;'));
});
test('multiline signatures with grouped parameter semicolons are byte-preserved in method and CLS files',()=>{
  const body='run(\n  first : Integer;\n       second : String) updating;\nbegin\nreturn;\nend;';
  assert.equal(apply(body),body.replace('\nreturn;','\n    return;'));
  assert.equal(apply(cls(body),{},undefined,'Fish.cls'),cls(body).replace('\nreturn;','\n    return;'));
});
test('tabs, CRLF, BOM and trailing whitespace outside indentation remain intact',()=>{
  const source='\ufeffrun();\r\nbegin\r\n  return;  \r\nend;\r\n';
  const expected='\ufeffrun();\r\nbegin\r\n\treturn;  \r\nend;\r\n';
  assert.equal(apply(source,{insertSpaces:false,tabSize:8}),expected);
});
test('multiline strings, documentation and block comment contents remain byte-for-byte unchanged',()=>{
  const source='run();\nbegin\nwrite "first\n  if dangerous then\nlast";\n/* comment\n     else\n  */\nwrite `documentation\n then\n`;\nreturn;\nend;';
  const expected='run();\nbegin\n    write "first\n  if dangerous then\nlast";\n    /* comment\n     else\n  */\n    write `documentation\n then\n`;\n    return;\nend;';
  assert.equal(apply(source),expected);
});
test('selection computes nesting from the full method but edits only complete selected lines',()=>{
  const source='run();\nbegin\nif true then\nreturn;\nendif;\nend;';
  const start=source.indexOf('return;'),end=start+'return;'.length;
  assert.equal(apply(source,{}, {start,end}),source.replace('return;','        return;'));
  assert.equal(apply(source,{}, {start:start+2,end}),source,'partial first line left intact');
});
test('end-exclusive selection does not touch the following line',()=>{
  const source='run();\nbegin\nreturn;\nreturn;\nend;';
  const start=source.indexOf('return;'),end=source.indexOf('return;',start+1);
  assert.equal(apply(source,{}, {start,end}),source.slice(0,start)+'    '+source.slice(start));
});
test('incomplete methods, unsupported control structures and non-method native documents are left unchanged',()=>{
  for(const source of ['run();\nbegin\nif true then\nreturn;\nend;', 'run();\nbegin\nreturn;', 'run();\nbegin\nswitch x;\nreturn;\nend;'])
    assert.equal(apply(source),source);
  const source='schemaDefinition\nDemo subschemaOf RootSchema;\nbegin\nreturn;\nend;';
  assert.equal(apply(source,{},undefined,'Demo.scm'),source);
});
test('multiple CLS methods are isolated and an invalid body does not prevent a valid sibling formatting',()=>{
  const source=cls('run();\nbegin\nif true then\nreturn;\nend;').replace('\n}\n)', '\n}\nother\n{\nother();\nbegin\nreturn;\nend;\n}\n)');
  assert.equal(apply(source,{},undefined,'Fish.cls'),source.replace('other();\nbegin\nreturn;', 'other();\nbegin\n    return;'));
});

test('multiline calls, operators and comments retain their relative continuation indentation',()=>{
  const source='run();\nbegin\n  value := method(\n      first,\n        nested(second),\n      third);\n  value := first +\n      second;\n  other := method(\n      // explain the argument\n      first\n  );\nend;';
  const expected='run();\nbegin\n    value := method(\n        first,\n          nested(second),\n        third);\n    value := first +\n        second;\n    other := method(\n        // explain the argument\n        first\n    );\nend;';
  assert.equal(apply(source),expected);
  assert.equal(apply(expected),expected);
  const start=source.indexOf('      first,'),end=start+'      first,'.length;
  assert.equal(apply(source,{}, {start,end}),source.slice(0,start)+'        first,'+source.slice(end));
});

test('large extracted classes visit a bounded number of array entries instead of rescanning each method',()=>{
  const methods=Array.from({length:400},(_,i)=>`method${i}\n{\nmethod${i}();\nbegin\n// explain\nreturn;\nend;\n}`).join('\n');
  const source=cls('run();\nbegin\nreturn;\nend;').replace('\n}\n)', '\n}\n'+methods+'\n)');
  const original=Array.prototype[Symbol.iterator];let visits=0,formatted;
  Array.prototype[Symbol.iterator]=function*(){const iterator=original.call(this);for(let item=iterator.next();!item.done;item=iterator.next()){visits++;yield item.value;}};
  try{formatted=apply(source,{},undefined,'ManyMethods.cls');}finally{Array.prototype[Symbol.iterator]=original;}
  assert.equal((formatted.match(/\n    return;/g)||[]).length,401);
  assert.ok(visits<200000,`Formatting visited ${visits} array entries for only 401 short methods.`);
});

test('method switch cases, read transactions and conditional execution nest safely',()=>{
 const source='run();\nbegin\nbeginLock;\nexecuteWhen DebugFlag;\nswitch value do\ncase 1:\nif true then\nreturn;\nendif;\ncase 2: write "two";\ndefault:\nreturn;\nendswitch;\nendExecuteWhen;\nendLock;\nbeginLoad;\nreturn;\nendLoad;\nend;';
 const expected='run();\nbegin\n    beginLock;\n        executeWhen DebugFlag;\n            switch value do\n                case 1:\n                    if true then\n                        return;\n                    endif;\n                case 2: write "two";\n                default:\n                    return;\n            endswitch;\n        endExecuteWhen;\n    endLock;\n    beginLoad;\n        return;\n    endLoad;\nend;';
 assert.equal(apply(source),expected);
 assert.equal(apply(expected),expected);
});

test('CLS source owners, method names, braces and signatures are formatted with their bodies',()=>{
 const source=cls('    run();\n    begin\nreturn;\n    end;').replace('Fish (\njadeMethodSources\nrun\n{', '     Fish (\n     jadeMethodSources\n    run\n    {').replace('\n}\n)', '\n    }\n    )');
 const expected=cls('run();\nbegin\n    return;\nend;');
 assert.equal(apply(source,{},undefined,'Fish.cls'),expected);
 assert.equal(apply(expected,{},undefined,'Fish.cls'),expected);
});
