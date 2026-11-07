'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function bundleCli(options={}){
 const root=path.resolve(__dirname,'..'),source=path.resolve(options.source||process.env.JADE_CLI_DISTRIBUTION||path.join(root,'packages/jade-cli-win-x64')),destination=path.resolve(options.destination||path.join(root,'extension/vendor/jade-tools-cli'));
 const manifestBytes=fs.readFileSync(path.join(source,'distribution.json'));
 const manifest=JSON.parse(manifestBytes.toString('utf8'));
 if(manifest.formatVersion!==2||manifest.runtime!=='native-cpp'||manifest.platform!=='win32'||manifest.arch!=='x64'||manifest.executable!=='jade-cli.exe')throw Error('A native C++ Windows x64 CLI distribution is required.');
 for(const name of ['jade-test-helper.exe','jade-debug-helper.exe','jade-inspect-helper.exe','jade-native-helper.exe','debugger-abi.json'])if(!Object.hasOwn(manifest.runtimeFiles||{},'native/'+name))throw Error('Required native runtime asset is missing from the manifest: '+name);
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
 if(options.verifyOnly)return source;
 if(source===destination||source.startsWith(destination+path.sep)||destination.startsWith(source+path.sep))throw Error('Native bundle source and destination must be separate.');
 fs.rmSync(destination,{recursive:true,force:true});fs.mkdirSync(destination,{recursive:true});
 for(const [relative,bytes]of files){const file=path.join(destination,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
 fs.writeFileSync(path.join(destination,'distribution.json'),manifestBytes);
 return destination;
}
if(require.main===module)console.log(bundleCli());
module.exports={bundleCli};
