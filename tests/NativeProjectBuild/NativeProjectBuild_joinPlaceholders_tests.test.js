'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {scanProject,minimalSchema}=require('../../extension/src/native-project'),{joinProject}=require('../../extension/src/native-project-build'),gateway=require('../../extension/src/cli-gateway');
async function fixture(t,definition=''){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-native-placeholder-'));t.after(()=>{gateway.configure(undefined);fs.rmSync(root,{recursive:true,force:true});});
 fs.mkdirSync(path.join(root,'Pets/types'),{recursive:true});fs.writeFileSync(path.join(root,'Pets.scm'),minimalSchema('Pets','RootSchema','25.0.02'));
 const own='jadeVersionNumber "25.0.02";\nschemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\n Local subclassOf Object transient;\ntypeDefinitions\n Local completeDefinition\n (\n )\ndatabaseDefinitions\ntypeSources\n';fs.writeFileSync(path.join(root,'Pets/types/Local.cls'),own);
 // Actual native inherited placeholder shape: no own type header/features/source.
 const inherited='jadeVersionNumber "25.0.02";\nschemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\ntypeDefinitions\n Application completeDefinition\n (\n  setModifiedTimeStamp "Copilot" "25.0.02" 2026:11:01:00:00:00.000;\n'+definition+'\n )\ndatabaseDefinitions\ntypeSources\n';fs.writeFileSync(path.join(root,'Pets/types/Application.cls'),inherited);
 gateway.configure({runNative:async(_exe,args)=>{fs.writeFileSync(args.at(-2),own);return {success:true,code:0,output:''};}});
 return {root,project:await scanProject(root),working:{root,installPath:root,databasePath:path.join(root,'system'),iniPath:path.join(root,'fixture.ini')}};
}
test('native join may omit exact empty inherited placeholders from its expanded SCM',async t=>{
 const f=await fixture(t);let bundle;try{bundle=await joinProject(f.working,f.project);assert.ok(fs.existsSync(bundle.batch));}finally{await bundle?.cleanup?.();}
});
test('native join must still retain substantive inherited overrides',async t=>{
 const f=await fixture(t,' attributeDefinitions\n  localOverride: String[50];');await assert.rejects(joinProject(f.working,f.project),/Native join omitted Pets::Application/);
});

for(const present of [true,false])test('native join '+(present?'retains':'must not omit')+' native interface definitions outside the class parser',async t=>{
 const f=await fixture(t),file=path.join(f.root,'Pets/types/ProbeInterface.cls');
 const text='jadeVersionNumber "25.0.02";\nschemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ninterfaceDefs\n ProbeInterface number = 1280\n (\n jadeMethodDefinitions\n  describe(): String number = 1001;\n )\ntypeSources\n';fs.writeFileSync(file,text);f.project=await scanProject(f.root);
 const own=fs.readFileSync(path.join(f.root,'Pets/types/Local.cls'),'utf8');
 gateway.configure({runNative:async(_exe,args)=>{fs.writeFileSync(args.at(-2),own+(present?'\ninterfaceDefs\n ProbeInterface number = 1280\n (\n jadeMethodDefinitions\n describe(): String number = 1001;\n )\n':''));return {success:true,code:0,output:''};}});
 if(!present){await assert.rejects(joinProject(f.working,f.project),/Native join omitted Pets::ProbeInterface/);return;}
 let bundle;try{bundle=await joinProject(f.working,f.project);assert.ok(fs.existsSync(bundle.batch));}finally{await bundle?.cleanup?.();}
});