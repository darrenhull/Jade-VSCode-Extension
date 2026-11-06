'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');

// The ZIP hash is an installation receipt. The extracted manifest digest binds
// the checked-in payload to that receipt without pretending to recreate a ZIP.
function verifyNativePin(source,pinFile) {
  const pin=JSON.parse(fs.readFileSync(pinFile,'utf8'));
  const bytes=fs.readFileSync(path.join(source,'distribution.json'));
  const manifest=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
  if(!/^\d+\.\d+\.\d+$/.test(pin.version||'')||pin.version!==manifest.packageVersion||pin.tag!=='v'+pin.version)throw Error('Native CLI pin version/tag does not match its distribution.');
  if(!/^[a-f0-9]{64}$/i.test(pin.sha256||'')||!/^[a-f0-9]{64}$/i.test(pin.distributionSha256||''))throw Error('Native CLI pin has an invalid archive or manifest receipt.');
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==pin.distributionSha256.toLowerCase())throw Error('Native CLI manifest does not match the verified archive receipt.');
  return pin;
}
module.exports={verifyNativePin};
