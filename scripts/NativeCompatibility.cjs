'use strict';
const fs=require('node:fs'),path=require('node:path');
function parts(version) {
  if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version||''))throw Error('A stable native CLI version is required.');
  return version.split('.').map(BigInt);
}
function requireNativeVersion(directory,minimum) {
  const version=JSON.parse(fs.readFileSync(path.join(directory,'distribution.json'),'utf8')).packageVersion,actual=parts(version),required=parts(minimum);
  for(let index=0;index<3;index++) {
    if(actual[index]>required[index])return version;
    if(actual[index]<required[index])throw Error('Scratch Pad requires Jade CLI '+minimum+' or newer; bundled '+version+'. Update the verified release pin, or explicitly select a tested candidate with JADE_CLI_DISTRIBUTION.');
  }
  return version;
}
module.exports={requireNativeVersion};
