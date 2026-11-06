'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {scanProject,stageProject,minimalSchema,joinDdx}=require('../extension/src/native-project');
test('native project staging keeps the header beside its folder and creates section indexes for arbitrarily located new class files',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-project-')),source=path.join(root,'source');fs.mkdirSync(path.join(source,'schemas/Pets/types'),{recursive:true});
 fs.writeFileSync(path.join(source,'schemas/Pets.scm'),minimalSchema('Pets','RootSchema','25.0.02'));
 const cls='jadeVersionNumber "25.0.02";\nschemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\nCat subclassOf Object transient;\ntypeDefinitions\nCat completeDefinition\n(\n)\ntypeSources\n';
 fs.mkdirSync(path.join(source,'different-folder'));const file=path.join(source,'different-folder/anything.cls');fs.writeFileSync(file,cls);
 const project=await scanProject(source);assert.equal(project.schemas.length,1);assert.equal(project.schemas[0].name,'Pets');
 const staged=await stageProject(project,path.join(root,'stage'));const schema=staged.schemas[0];
 assert.ok(fs.existsSync(path.join(schema.directory,'Types/Cat.cls')));assert.match(fs.readFileSync(path.join(schema.directory,'typeHeaders.sec'),'utf8'),/Cat/);
 assert.match(fs.readFileSync(path.join(schema.directory,'Types/Cat.cls'),'utf8'),/databaseDefinitions/,'native join requires the empty native boundary marker');
 assert.equal(fs.readFileSync(file,'utf8'),cls,'source files are never reformatted');
});
test('a minimal schema rejects invalid names and does not include application class copies',()=>{
 assert.throws(()=>minimalSchema('../bad','RootSchema','25.0.02'),/schema name/i);
 assert.match(minimalSchema('Pets','RootSchema','25.0.02'),/Pets subschemaOf RootSchema completeDefinition/);
 assert.doesNotMatch(minimalSchema('Pets','RootSchema','25.0.02'),/typeDefinitions/);
});
test('cancelled native staging stops before creating a partial bundle or starting Jade',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-stage-cancel-')),destination=path.join(root,'staging'),abort=new AbortController();abort.abort();
 try{await assert.rejects(stageProject({schemas:[]},destination,{signal:abort.signal}),/cancel/i);assert.equal(fs.existsSync(destination),false);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('DDX staging combines native XML resources without serializing their properties',()=>{
 const schema={name:'Pets',entries:[{extension:'.ddx',file:'app.ddx',text:'<?xml version="1.0"?><schema name="Pets" CompleteDefinition="false"><Application name="Pets"><name>Pets</name></Application></schema>'},{extension:'.ddx',file:'form.ddx',text:'<schema name="Pets" CompleteDefinition="false"><Form name="Screen"><caption>A &amp; B</caption></Form></schema>'}]};
 const xml=joinDdx(schema);assert.match(xml,/CompleteDefinition="true"/);assert.match(xml,/<caption>A &amp; B<\/caption>/);
 assert.throws(()=>joinDdx({...schema,entries:[...schema.entries,schema.entries[0]]}),/Duplicate DDX/);
});
