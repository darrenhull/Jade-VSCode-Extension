'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');

class ReleasePlan {
  static create(root,tag='') {
    const workspace=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
    const extension=JSON.parse(fs.readFileSync(path.join(root,'extension/package.json'),'utf8'));
    if(!/^\d+\.\d+\.\d+$/.test(extension.version)||workspace.version!==extension.version||tag&&tag!=='v'+extension.version)throw Error('Release tag, workspace version and extension version must match.');
    const filename=extension.name+'-'+extension.version+'.vsix',asset=path.join(root,'dist',filename);
    if(!fs.existsSync(asset)||!fs.statSync(asset).isFile())throw Error('Build the VSIX before preparing the release.');
    const checksum=crypto.createHash('sha256').update(fs.readFileSync(asset)).digest('hex');
    const checksums=path.join(root,'dist','SHA256SUMS');
    fs.writeFileSync(checksums,checksum+'  '+filename+'\n');
    return {version:extension.version,asset,checksums};
  }
}
module.exports=ReleasePlan;
