'use strict';
const path = require('node:path');
const fs = require('node:fs');
function buildMethodEditor() {
  const root=path.resolve(__dirname,'..');
  const result=require('esbuild').buildSync({
    entryPoints: [path.resolve(__dirname, '../extension/media/method-editor-entry.js')],
    outfile: path.resolve(__dirname, '../extension/media/method-editor.js'),
    bundle: true, minify: true, platform: 'browser', target: ['chrome120'],
    legalComments: 'eof', sourcemap: false,metafile:true,absWorkingDir:root,
  });
  const packages=new Set();
  for(const input of Object.keys(result.metafile.inputs)){
    const parts=input.replaceAll('\\','/').split('/'),index=parts.lastIndexOf('node_modules');
    if(index<0)continue;
    packages.add(parts[index+1].startsWith('@')?parts.slice(index+1,index+3).join('/'):parts[index+1]);
  }
  const notices=[...packages].sort().map(name=>{
    const directory=path.join(root,'node_modules',name),metadata=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
    const license=fs.readdirSync(directory).find(file=>/^licen[sc]e(?:\.(?:txt|md))?$/i.test(file));
    if(!license)throw Error('Bundled editor dependency has no license notice: '+name);
    return `${name} ${metadata.version}\n${'='.repeat(name.length+metadata.version.length+1)}\n${fs.readFileSync(path.join(directory,license),'utf8').trim()}\n`;
  });
  fs.writeFileSync(path.join(root,'extension/media/method-editor.LICENSE.txt'),notices.join('\n'));
  return result;
}
if (require.main === module) buildMethodEditor();
module.exports = { buildMethodEditor };
