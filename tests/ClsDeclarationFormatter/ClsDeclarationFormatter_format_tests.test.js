'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {formattingEdits}=require('../../extension/src/jade-formatter');
function apply(text,options={},selection){for(const edit of formattingEdits(text,{tabSize:4,insertSpaces:true,...options},selection,'Cow.cls').reverse())text=text.slice(0,edit.start)+edit.text+text.slice(edit.end);return text;}
const cow=`jadeVersionNumber "25.0.02";
schemaDefinition
SJetSchema subschemaOf RootSchema partialDefinition;
typeHeaders
    Cow subclassOf Object transient;
typeDefinitions
    Cow completeDefinition
    (
        setModifiedTimeStamp "Copilot" "25.0.02" 2026:11:06:00:00:00.000;
    attributeDefinitions
        name:                String[50] number = 1, ordinal = 1;
        breed:               String[50] number = 2, ordinal = 2;
        weightKg:            Integer number = 3, ordinal = 3;
        milkLitresPerDay:    Integer number = 4, ordinal = 4;
    dateOfBirth:         Date number = 5, ordinal = 5;
    jadeMethodDefinitions
        a_Documentation() number = 1001;
        documentationText
        \`Cow documentation
  keep this literal spacing
\`
        getName() : String number = 1002;
    )
typeSources
Cow (
jadeMethodSources
getName
{
getName() : String;
begin
    return self.name;
end;
}
)
`;

test('Format Document corrects the outdented Cow property without changing aligned columns or native metadata',()=>{
 const expected=cow.replace('\n    dateOfBirth:', '\n        dateOfBirth:');
 assert.equal(apply(cow),expected);
 assert.equal(apply(expected),expected);
 assert.equal(cow.replace(/^[\t ]+/gm,''),expected.replace(/^[\t ]+/gm,''));
});

test('Format Selection corrects only complete selected declaration lines',()=>{
 const start=cow.indexOf('    dateOfBirth:'),end=cow.indexOf('\n',start);
 assert.equal(apply(cow,{}, {start,end}),cow.replace('\n    dateOfBirth:', '\n        dateOfBirth:'));
 assert.equal(apply(cow,{}, {start:start+1,end}),cow,'partial selected line stays untouched');
 assert.equal(apply(cow,{}, {start:0,end:start}),cow,'end-exclusive selection preserves following property');
});

test('native class headers, declaration sections, collection keys and database maps use exported indentation',()=>{
 const source=`typeHeaders\nCow subclassOf Object transient,\nsharedTransientAllowed;\nmembershipDefinitions\nCows of Cow;\ntypeDefinitions\nCow completeDefinition\n(\nattributeDefinitions\nname: String[50];\nreferenceDefinitions\nfriend: Cow;\njadeMethodDefinitions\ngetName() : String;\n)\nmemberKeyDefinitions\nCows completeDefinition\n(\nname;\n)\ndatabaseDefinitions\nDemoDb\n(\ndatabaseFileDefinitions\n"demo";\nclassMapDefinitions\nCow in "demo";\n)\ntypeSources\n`;
 const expected=`typeHeaders\n    Cow subclassOf Object transient,\n        sharedTransientAllowed;\nmembershipDefinitions\n    Cows of Cow;\ntypeDefinitions\n    Cow completeDefinition\n    (\n    attributeDefinitions\n        name: String[50];\n    referenceDefinitions\n        friend: Cow;\n    jadeMethodDefinitions\n        getName() : String;\n    )\nmemberKeyDefinitions\n    Cows completeDefinition\n    (\n        name;\n    )\ndatabaseDefinitions\n    DemoDb\n    (\n    databaseFileDefinitions\n        "demo";\n    classMapDefinitions\n        Cow in "demo";\n    )\ntypeSources\n`;
 assert.equal(apply(source),expected);
 assert.equal(apply(expected),expected);
 assert.equal(source.replace(/\s/g,''),expected.replace(/\s/g,''));
});

test('tabs, CRLF and literal/documentation interior bytes survive structural formatting',()=>{
 const source=cow.replace(/\n/g,'\r\n'),formatted=apply(source,{insertSpaces:false});
 assert.ok(formatted.includes('\r\n\t\tdateOfBirth:         Date number = 5, ordinal = 5;'));
 assert.ok(formatted.includes('`Cow documentation\r\n  keep this literal spacing\r\n`'));
 assert.equal(formatted.replace(/^[\t ]+/gm,''),source.replace(/^[\t ]+/gm,''));
 assert.equal(apply(formatted,{insertSpaces:false}),formatted);
});

test('incomplete and unknown definition blocks are preserved instead of guessing their structure',()=>{
 for(const source of [
  'typeDefinitions\nCow completeDefinition\n(\nattributeDefinitions\nname: String;\ntypeSources\n',
  'typeDefinitions\nCow completeDefinition\n(\nunknownDefinitions\nname: String;\n)\ntypeSources\n',
  'typeDefinitions\nCow completeDefinition\n(\nattributeDefinitions\nname: String;\n/* unfinished\n)\ntypeSources\n',
 ])assert.equal(apply(source),source);
});

test('multiline declaration continuations retain their relative indentation and literal bytes',()=>{
 const source='typeDefinitions\nCow completeDefinition\n(\njadeMethodDefinitions\n  setValues(\n      first: Integer;\n        second: String) updating number = 1002;\nattributeDefinitions\n  title: String[50]\n      protected, readonly,\n        number = 3;\n)\ntypeSources\n';
 const expected='typeDefinitions\n    Cow completeDefinition\n    (\n    jadeMethodDefinitions\n        setValues(\n            first: Integer;\n              second: String) updating number = 1002;\n    attributeDefinitions\n        title: String[50]\n            protected, readonly,\n              number = 3;\n    )\ntypeSources\n';
 assert.equal(apply(source),expected);
 assert.equal(apply(expected),expected);
});

test('an incomplete declaration sibling does not suppress a complete independent owner',()=>{
 const source='typeDefinitions\nCow completeDefinition\n(\nattributeDefinitions\nname: String;\n)\nFish completeDefinition\n(\nattributeDefinitions\nname: String;\ntypeSources\n';
 assert.equal(apply(source),'typeDefinitions\n    Cow completeDefinition\n    (\n    attributeDefinitions\n        name: String;\n    )\nFish completeDefinition\n(\nattributeDefinitions\nname: String;\ntypeSources\n');
});

test('whole CLS metadata covers schema, interfaces, primitives, categorized constants, locales, libraries and external functions',()=>{
 const expected=`jadeVersionNumber "25.0.02";
schemaDefinition
Demo subschemaOf RootSchema partialDefinition;
    setModifiedTimeStamp "author" "25.0.02" 2026:11:06:00:00:00;
constantDefinitions
    categoryDefinition Status
        Open: Integer = 1;
        setModifiedTimeStamp "author" "25.0.02" 2026:11:06:00:00:00;
localeDefinitions
    2057 "English (United Kingdom)" schemaDefaultLocale;
libraryDefinitions
    "demo";
externalFunctionDefinitions
    nativeValue(
        value: Integer): Integer is "nativeValue" in "demo";
interfaceDefs
    IAnimal subInterfaceOf JadeInterface;
typeHeaders
    Score subclassOf Integer primitive;
typeDefinitions
    IAnimal completeDefinition
    (
    jadeMethodDefinitions
        getName() : String;
    )
    Score completeDefinition
    (
    constantDefinitions
        Empty: Integer = 0;
    )
translatableStringDefinitions
    2057 "English (United Kingdom)"
    (
        Greeting = "Hello";
    )
typeSources
`;
 const source=expected.replace(/^[\t ]+/gm,'');
 assert.equal(apply(source),expected);
 assert.equal(apply(expected),expected);
 assert.equal(source.replace(/\s/g,''),expected.replace(/\s/g,''));
});

test('nested exported and imported package owners preserve structural depth',()=>{
 const expected=`exportedPackageDefinitions
    AnimalPackage
    (
    exportedClassDefinitions
        Cow
        (
        exportedPropertyDefinitions
            name;
        exportedMethodDefinitions
            getName;
        )
    exportedInterfaceDefinitions
        IAnimal;
    )
importedPackageDefinitions
    ImportedAnimals
    (
    importedClassDefinitions
        Cow;
    importedInterfaceDefinitions
        IAnimal;
    )
schemaViewDefinitions
    DomainTypes
    (
        Cow;
    )
typeSources
`;
 const source=expected.replace(/^[\t ]+/gm,'');
 assert.equal(apply(source),expected);
 assert.equal(apply(expected),expected);
});

test('many native owners are traversed with a bounded shared source pass',()=>{
 const headers=Array.from({length:500},(_,i)=>`Type${i} subclassOf Object;`).join('\n');
 const definitions=Array.from({length:500},(_,i)=>`Type${i} completeDefinition\n(\nattributeDefinitions\nvalue: Integer;\n)`).join('\n');
 const source=`typeHeaders\n${headers}\ntypeDefinitions\n${definitions}\ntypeSources\n`;
 const original=Array.prototype[Symbol.iterator];let visits=0,formatted;
 Array.prototype[Symbol.iterator]=function*(){const iterator=original.call(this);for(let item=iterator.next();!item.done;item=iterator.next()){visits++;yield item.value;}};
 try{formatted=apply(source);}finally{Array.prototype[Symbol.iterator]=original;}
 assert.equal((formatted.match(/\n        value: Integer;/g)||[]).length,500);
 assert.ok(visits<200000,`Formatting traversed ${visits} array entries for 500 simple types.`);
 assert.equal(apply(formatted),formatted);
});

test('header-like property and local names retain their declaration and method indentation without overlapping edits',()=>{
 const source='jadeVersionNumber "25.0.02";\nschemaDefinition\nDemo subschemaOf RootSchema partialDefinition;\ntypeHeaders\nProbe subclassOf Object transient;\ntypeDefinitions\nProbe completeDefinition\n(\nattributeDefinitions\n jadeVersionNumber: Integer;\n jadePatchRelease: Integer;\njadeMethodDefinitions\nrun();\n)\ntypeSources\nProbe (\njadeMethodSources\nrun\n{\nrun();\nvars\n jadeVersionNumber: Integer;\n jadePatchRelease: Integer;\nbegin\n jadeVersionNumber := 1;\n jadePatchRelease := jadeVersionNumber;\nend;\n}\n)\n';
 const edits=formattingEdits(source,{tabSize:4,insertSpaces:true},undefined,'Probe.cls');
 for(let i=1;i<edits.length;i++)assert.ok(edits[i-1].end<=edits[i].start,'formatter edits must not overlap');
 const formatted=apply(source);assert.ok(formatted.includes('\n        jadeVersionNumber: Integer;'));assert.ok(formatted.includes('\n    jadeVersionNumber: Integer;'));assert.ok(formatted.includes('\n    jadePatchRelease := jadeVersionNumber;'));assert.equal(apply(formatted),formatted);
 const start=source.indexOf(' jadeVersionNumber := 1;'),end=source.indexOf('\n',start),selected=apply(source,{}, {start,end});
 assert.equal(selected,source.slice(0,start)+'    jadeVersionNumber := 1;'+source.slice(end));
});
test('only actual leading metadata directives are outdented through header comments and BOM',()=>{
 const source='\uFEFF    jadeVersionNumber "25.0.02";\n// keep header comment\n/* keep\n   comment */\n    jadePatchRelease "0";\nschemaDefinition\nDemo subschemaOf RootSchema partialDefinition;\ntypeSources\n';
 const expected=source.replace('\uFEFF    jadeVersionNumber','\uFEFFjadeVersionNumber').replace('    jadePatchRelease','jadePatchRelease');
 assert.equal(apply(source),expected);assert.equal(apply(expected),expected);assert.equal(apply(source,{}, {start:source.indexOf('    jadePatchRelease'),end:source.indexOf('\nschemaDefinition')}),source.replace('    jadePatchRelease','jadePatchRelease'));
});
