'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const has=(value,key)=>Object.hasOwn(value||{},key);
const sha256=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function readProducer(bytes){
 if(!bytes)return undefined;
 if(bytes.length>1024*1024)throw Error('Git-first producer qualification is oversized.');
 try{return JSON.parse(bytes.toString('utf8'));}catch{throw Error('Git-first producer qualification is invalid JSON.');}
}
function assertCheckoutProof(runtime,producer,manifest){
 const enabled=runtime.checkoutInitialization===true,seed=runtime.checkoutSeed,hashKeys=['jomSha256','controlSha256','monitorSha256'];
 const validSeed=value=>record(value)&&Object.keys(value).length===4&&typeof value.platform==='string'&&/^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$/.test(value.platform)&&hashKeys.every(key=>sha256(value[key]));
 if((has(runtime,'checkoutInitialization')&&typeof runtime.checkoutInitialization!=='boolean')||(!enabled&&has(runtime,'checkoutSeed'))||
    (enabled&&(!['managedUpload','nativeTests','sync'].every(key=>runtime[key]===true)||!validSeed(seed))))throw Error('Invalid Git-first checkout declaration or vendor seed.');
 const qualification=producer?.qualification,proof=producer?.checkoutProof;
 if((has(qualification,'checkoutInitialization')&&typeof qualification.checkoutInitialization!=='boolean')||
    enabled!==(qualification?.checkoutInitialization===true)||(!enabled&&has(producer,'checkoutProof')))throw Error('Git-first producer qualification differs from its declaration.');
 if(!enabled)return;
 const checks=['sourceFreeSetup','restart','branchRoundTrip','savedEditRoundTrip','noOp','isolation','unsupportedChangeRefused'];
 if(!record(producer)||!record(qualification)||!record(proof)||Object.keys(proof).length!==6||proof.format!==1||!sha256(proof.cliSha256)||proof.cliSha256!==manifest.executableSha256||!sha256(proof.receiptSha256)||
    qualification.sync!==true||!validSeed(proof.seed)||!['platform',...hashKeys].every(key=>seed[key]===proof.seed[key])||
    !record(proof.checks)||Object.keys(proof.checks).length!==checks.length||!checks.every(key=>proof.checks[key]===true))throw Error('Git-first connected proof does not match the CLI, seed or required checks.');
 const prefix=runtime.characterSet==='ansi'?'native/jox/ansi/':'native/jox/';
 const names=[`jade-jox-test-helper-${runtime.characterSet}.exe`,'jadegitscm.dll','jadegitdev.dll'];
 if(!record(proof.files)||Object.keys(proof.files).length!==3||!record(producer.files)||Object.keys(producer.files).length!==3||!names.every(name=>sha256(proof.files[name])&&proof.files[name]===producer.files[name]&&proof.files[name]===manifest.runtimeFiles[prefix+name]))throw Error('Git-first proof does not match the exact managed runtime.');
}
function assertAnsiVariant(manifest,files){
 const jox=manifest.joxRuntime,variants=jox?.variants,prefix='native/jox/ansi/';
 const payload=Object.keys(manifest.runtimeFiles||{}).filter(name=>name.startsWith(prefix));
 if(variants===undefined){if(payload.length)throw Error('ANSI payload lacks its runtime variant declaration.');return;}
 const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
 const names=['jade-jox-test-helper-ansi.exe','jadegitscm.dll','jadegitdev.dll'],proofName=prefix+'runtime-provenance.json';
 const ansi=variants?.ansi;
 const flags=['managedUpload','nativeTests','initialization','nativeScratch'],keys=['format','characterSet','engineCommit',...flags,...['sync','checkoutInitialization','checkoutSeed'].filter(key=>has(ansi,key))];
 if(!object(variants)||Object.keys(variants).join(',')!=='ansi'||!object(ansi)||Object.keys(ansi).length!==keys.length||Object.keys(ansi).some(key=>!keys.includes(key))||ansi.format!==1||ansi.characterSet!=='ansi'||ansi.engineCommit!==jox.engineCommit||!flags.every(key=>typeof ansi[key]==='boolean')||!flags.slice(0,3).every(key=>ansi[key])||ansi.nativeScratch!==false)throw Error('ANSI runtime needs an exact qualified per-mode declaration.');
 if(payload.length!==4||![...names.map(name=>prefix+name),proofName].every(name=>Object.hasOwn(manifest.runtimeFiles,name)))throw Error('ANSI fixed helper, components and provenance are required.');
 const bytes=files.get(proofName);if(!bytes||bytes.length>1024*1024)throw Error('ANSI producer proof is missing or oversized.');
 let proof;try{proof=JSON.parse(bytes.toString('utf8'));}catch{throw Error('ANSI producer proof is invalid JSON.');}
 if(!object(proof)||proof.format!==1||proof.characterSet!=='ansi'||proof.engineCommit!==ansi.engineCommit||proof.characterBytes!==1||!object(proof.componentCharacterBytes)||Object.keys(proof.componentCharacterBytes).length!==2||!['jadegitscm.dll','jadegitdev.dll'].every(name=>proof.componentCharacterBytes[name]===1)||proof.build?.crt!=='MT'||proof.loaderDiagnostics!==false||proof.observedProvider!==false||!object(proof.files)||Object.keys(proof.files).length!==3||!object(proof.qualification)||!flags.every(key=>proof.qualification[key]===ansi[key]))throw Error('ANSI producer ABI, build or qualification differs from its declaration.');
 assertCheckoutProof(ansi,proof,manifest);
 if([ansi,proof.qualification].some(mode=>has(mode,'sync')&&typeof mode.sync!=='boolean')||(ansi.sync===true)!==(proof.qualification.sync===true))throw Error('ANSI sync qualification differs from its declaration.');
 for(const name of names){
  const expected=manifest.runtimeFiles[prefix+name],unicode='native/jox/'+(name==='jade-jox-test-helper-ansi.exe'?'jade-jox-test-helper-unicode.exe':name);
  if(!/^[a-f0-9]{64}$/.test(proof.files[name]||'')||proof.files[name]!==expected||expected===manifest.runtimeFiles[unicode])throw Error('ANSI producer fingerprints differ or reuse Unicode payloads.');
 }
}
function bundleCli(options={}){
 const root=path.resolve(__dirname,'..'),source=path.resolve(options.source||process.env.JADE_CLI_DISTRIBUTION||path.join(root,'packages/jade-cli-win-x64')),destination=path.resolve(options.destination||path.join(root,'extension/vendor/jade-tools-cli'));
 const manifestBytes=fs.readFileSync(path.join(source,'distribution.json'));
 const manifest=JSON.parse(manifestBytes.toString('utf8'));
 const requireJox=options.requireJox===true||Object.hasOwn(manifest,'joxRuntime');
 if(manifest.formatVersion!==2||manifest.runtime!=='native-cpp'||manifest.platform!=='win32'||manifest.arch!=='x64'||manifest.executable!=='jade-cli.exe')throw Error('A native C++ Windows x64 CLI distribution is required.');
 require('../extension/src/NativeObjectIdentity').requireNativeOidDistribution(manifest);
 const requiredRuntime=requireJox?['jade-inspect-helper.exe','jade-inspect-helper-ansi.exe','jade-inspect-helper-unicode.exe']:['jade-test-helper.exe','jade-debug-helper.exe','jade-inspect-helper.exe','jade-native-helper.exe','debugger-abi.json'];
 for(const name of requiredRuntime)if(!Object.hasOwn(manifest.runtimeFiles||{},'native/'+name))throw Error('Required native runtime asset is missing from the manifest: '+name);
 if(requireJox){
  require('./NativeCompatibility.cjs').requireNativeVersion(source,'0.11.0');
  const jox=manifest.joxRuntime;
  if(jox?.format!==1||jox.characterSet!=='unicode'||!/^[a-f0-9]{40}$/.test(jox.engineCommit||'')||
     !['managedUpload','nativeTests','initialization'].every(name=>jox[name]===true))
   throw Error('A qualified JOX setup, upload and native-test distribution is required.');
  for(const name of ['jade-jox-test-helper-unicode.exe','jadegitscm.dll','jadegitdev.dll'])
   if(!Object.hasOwn(manifest.runtimeFiles||{},'native/jox/'+name))throw Error('Required JOX runtime asset is missing: '+name);
 }
 const pinFile=options.pinFile||(!(options.source||process.env.JADE_CLI_DISTRIBUTION)?path.join(root,'packages/jade-cli-pin.json'):undefined);
 if(pinFile)require('./NativePin.cjs').verifyNativePin(source,pinFile,manifestBytes);
 if(options.minimumVersion)require('./NativeCompatibility.cjs').requireNativeVersion(source,options.minimumVersion);
 const sourceRoot=fs.realpathSync(source),files=new Map();let total=0;
 for(const [relative,hash]of Object.entries({...manifest.runtimeFiles,'jade-cli.exe':manifest.executableSha256})){
  if(path.isAbsolute(relative)||relative.includes('\\')||relative.split('/').some(part=>!part||part==='.'||part==='..')||!/^([a-f0-9]{64})$/i.test(hash))throw Error('Invalid native runtime path or checksum: '+relative);
  const file=path.join(source,relative),resolved=path.relative(sourceRoot,fs.realpathSync(file));
  if(resolved==='..'||resolved.startsWith('..'+path.sep)||path.isAbsolute(resolved)||!fs.statSync(file).isFile())throw Error('Invalid native runtime path: '+relative);
  total+=fs.statSync(file).size;if(total>256*1024*1024)throw Error('Native CLI runtime exceeds the 256 MiB size limit.');
  const bytes=fs.readFileSync(file);if(crypto.createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('Native CLI checksum mismatch: '+relative);
  files.set(relative,bytes);
 }
 if(requireJox){assertCheckoutProof(manifest.joxRuntime,readProducer(files.get('native/jox/runtime-provenance.json')),manifest);assertAnsiVariant(manifest,files);}
 if(options.verifyOnly)return source;
 if(source===destination||source.startsWith(destination+path.sep)||destination.startsWith(source+path.sep))throw Error('Native bundle source and destination must be separate.');
 fs.rmSync(destination,{recursive:true,force:true});fs.mkdirSync(destination,{recursive:true});
 for(const [relative,bytes]of files){const file=path.join(destination,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
 fs.writeFileSync(path.join(destination,'distribution.json'),manifestBytes);
 return destination;
}
if(require.main===module)console.log(bundleCli());
module.exports={bundleCli};
