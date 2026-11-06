'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {isEmptyInheritedType,typeDeclaration,verifyDdxCoverage}=require('./native-source-filter');

const groups = ['types', 'packages', 'locales', 'external-components', 'applications'];

function organizeSources(raw, destination) {
  const original = JSON.parse(fs.readFileSync(path.join(raw, 'extract-manifest.json'), 'utf8'));
  const allSchemas=original.files.filter(file => /^[^/]+\.scm$/i.test(file.path)).map(file => file.path.slice(0, -4));
  const schemas=allSchemas.filter(schema=>!['RootSchema','JadeSchema'].includes(schema));
  const omitted=new Map();
  for(const schema of allSchemas.filter(schema=>!schemas.includes(schema)))for(const file of original.files.filter(file=>file.path.startsWith(schema+'/')||file.path===schema+'.scm'||file.path===schema+'.ddx'||file.path===schema+'.ddb'))omitted.set(file.path,'system schema');
  omitted.set('schemas.mul','index of temporary aggregate exports');
  const parents = new Map(), classes = new Map();
  const text = file => fs.readFileSync(path.join(raw, file), 'utf8').replace(/^\uFEFF/, '');
  for (const schema of schemas) {
    const definition=schema+'/schemaDefinitions.sec';
    if(!original.files.some(file=>file.path===definition)||!fs.existsSync(path.join(raw,definition)))throw new Error('Native schemaDefinitions.sec is missing for '+schema+'. Full SCM cannot be omitted safely.');
    const identity=/\b(\w+)\s+subschemaOf\s+(\w+)/.exec(text(definition));
    if(!identity||identity[1]!==schema)throw new Error('Invalid native schemaDefinitions.sec for '+schema);
    parents.set(schema,identity[2]);
  }
  const declarations=new Map();
  for (const file of original.files.filter(file => /\/Types\/[^/]+\.cls$/i.test(file.path))) {
    const schema = file.path.split('/')[0], name = path.basename(file.path, '.cls');
    if(isEmptyInheritedType(text(file.path))){omitted.set(file.path,'empty inherited type shell');continue;}
    classes.set(schema + '::' + name, /^\s*\w+\s+subclassOf\s+(\w+)/m.exec(text(file.path).split('typeDefinitions')[0])?.[1]);
    const declaration=typeDeclaration(text(file.path));if(declaration)declarations.set(schema+'::'+name,{...declaration,file:file.path,schema});
  }
  for(const value of declarations.values()){
    let ancestor=parents.get(value.schema);const seen=new Set();
    while(ancestor&&!seen.has(ancestor)){seen.add(ancestor);const original=declarations.get(ancestor+'::'+value.name);
      if(original&&original.number===value.number&&original.normalized===value.normalized){omitted.set(value.file,'unchanged inherited copy of ancestor class');classes.delete(value.schema+'::'+value.name);break;}ancestor=parents.get(ancestor);
    }
  }
  for(const schema of schemas){verifyDdxCoverage(raw,schema,original.files,new Set(omitted.keys()));omitted.set(schema+'.scm','full schema covered by native sections and classes');if(original.files.some(file=>file.path===schema+'.ddx'))omitted.set(schema+'.ddx','aggregate XML covered by individual application/form files');}
  function category(schema, name) {
    const seen = new Set();
    while (name) {
      if (['Application', 'RootSchemaApp'].includes(name)) return 'applications';
      if (['ExternalObject', 'ActiveXControl', 'ActiveXAutomation', 'JadeDotNetType', 'JadeDotNetVisualComponent'].includes(name)) return 'external-components';
      const key = schema + '::' + name;
      if (seen.has(key)) break;
      seen.add(key);
      if (classes.has(key) && classes.get(key)) name = classes.get(key);
      else if (parents.has(schema)) schema = parents.get(schema);
      else break;
    }
    return 'types';
  }
  fs.mkdirSync(destination);
  const files = [];
  function write(relative, bytes, nativePath, generated = false) {
    const file = path.join(destination, relative);
    if (fs.existsSync(file)) throw new Error('Duplicate source-layout output: ' + relative);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
    files.push({ path: relative, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), nativePath, generated });
  }
  for (const schema of schemas) {
    const prefix = 'schemas/' + schema + '/';
    for (const group of groups) fs.mkdirSync(path.join(destination, prefix, group), { recursive: true });
    for (const file of original.files.filter(file => file.path === schema + '.scm' || file.path === schema + '.ddx' || file.path === schema + '.ddb' || file.path.startsWith(schema + '/'))) {
      if(omitted.has(file.path))continue;
      const name = path.basename(file.path), extension = path.extname(name).toLowerCase();
      if (file.path === schema + '.scm') continue; // Full export is temporary; native sections and CLS are authoritative.
      else if (file.path === schema + '.ddx' || file.path === schema + '.ddb') write('schemas/' + name, fs.readFileSync(path.join(raw, file.path)), file.path);
      else if (/\/Types\//i.test(file.path)) {
        const group = category(schema, name.replace(/\.(cls|ddx|ddb)$/i, ''));
        write(prefix + group + '/' + name, fs.readFileSync(path.join(raw, file.path)), file.path);
      } else if (extension === '.sec') {
        if(name==='schemaDefinitions.sec'){
          write('schemas/'+schema+'.scm',fs.readFileSync(path.join(raw,file.path)),file.path);
          continue;
        }
        let group;
        if (/PackageDefinitions\.sec$/i.test(name)) group = 'packages';
        else if (/^localeDefinitions\.sec$/i.test(name)) group = 'locales';
        else if (/^(libraryDefinitions|externalFunctions|externalFunctionSources|externalComponentDefinitions|externalClassDefinitions)\.sec$/i.test(name)) group = 'external-components';
        // Keep every native section intact, including empty section markers.
        // Schema-level sections remain at the root of the schema directory.
        const originalBytes=fs.readFileSync(path.join(raw,file.path));let bytes=originalBytes;
        if(/^(typeHeaders|interfaceDefs|membershipDefinitions|typeDefinitions|externalKeyDefinitions|memberKeyDefinitions|typeSources)\.sec$/i.test(name)){
          const skipped=new Set([...omitted.keys()].filter(file=>file.startsWith(schema+'/Types/')&&file.endsWith('.cls')).map(file=>path.basename(file,'.cls')));
          const originalText=originalBytes.toString('utf8');const filtered=(originalText.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)||[]).filter(line=>!skipped.has(line.trim())).join('');bytes=Buffer.from(filtered,'utf8');
        }
        write(prefix + (group ? group + '/' : '') + name, bytes, file.path);
      }
    }
    for (const group of groups) {
      if (!fs.readdirSync(path.join(destination, prefix, group)).length) write(prefix + group + '/.gitkeep', Buffer.alloc(0), undefined, true);
    }
  }
  // The native MUL references full SCM exports, so it belongs with temporary
  // extraction/reassembly output rather than this section-only source tree.
  const manifest = { ...original, layout: 'schema-sections-v3', files,omittedNativeFiles:[...omitted].map(([nativePath,reason])=>({nativePath,reason})) };
  fs.writeFileSync(path.join(destination, 'extract-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { directory: destination, manifest, schemas };
}

module.exports = { organizeSources, groups };
