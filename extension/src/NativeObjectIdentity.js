'use strict';
// Native Jade owns the identity syntax. Clients only bound untrusted scalar input.
function validateObjectIdentity(value){
 if(typeof value!=='string'||!value.length||Buffer.byteLength(value,'utf8')>512||/[\x00-\x1f\x7f]/.test(value)) return 'Enter a Jade object ID (up to 512 UTF-8 bytes, without control characters).';
 return undefined;
}
function requireNativeOidCapability(body){
 if(body?.oidFormat!=='jade-native')throw Error('This inspector does not support native Jade object identities. Update the bundled Jade CLI.');
}
function requireNativeOidDistribution(manifest){
 requireNativeOidCapability(manifest);
 const match=/^(\d+)\.(\d+)\.(\d+)$/.exec(manifest.packageVersion||'');
 if(!match || !(Number(match[1])>0 || Number(match[2])>3 || (Number(match[2])===3 && Number(match[3])>=2))) throw Error('Native Jade object identities require Jade CLI 0.3.2 or newer.');
}
module.exports={validateObjectIdentity,requireNativeOidCapability,requireNativeOidDistribution};
