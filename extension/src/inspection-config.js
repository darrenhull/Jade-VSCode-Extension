'use strict';
const {resolveWorkingDirectory}=require('./working-directory');

// Use the existing native, file-only preparation boundary. The extension does
// not read jade.json/profiles or guess connection and automatic Working paths.
async function inspectionConfiguration(client,cwd,explicit={}) {
  const argv=[],overrides={...explicit};
  for(const [key,option] of [['installPath','install'],['databasePath','database'],['iniPath','ini'],['server','server'],['schema','schema']]) {
    if(typeof overrides[key]==='string'&&overrides[key]!=='') { argv.push('--'+option,overrides[key]);delete overrides[key]; }
    else if(overrides[key]===''&&['installPath','databasePath','iniPath'].includes(key))delete overrides[key];
  }
  const result=await client.request('prepare',{operation:'inspect.target',cwd,argv}).promise;
  if(result?.passed!==true||result.code!==0)throw Error(result?.report?.error||'Native inspection configuration could not be resolved.');
  const prepared=result.prepared;
  if(!prepared?.config||typeof prepared.config!=='object'||Array.isArray(prepared.config))
    throw Error('Native inspection configuration returned an incomplete result.');
  if(Object.hasOwn(overrides,'workingDatabaseDirectory')) {
    if(overrides.workingDatabaseDirectory===undefined||overrides.workingDatabaseDirectory==='')delete overrides.workingDatabaseDirectory;
    else overrides.workingDatabaseDirectory=resolveWorkingDirectory(overrides.workingDatabaseDirectory,cwd);
  }
  const config={...prepared.config,...overrides,cwd};
  if(typeof prepared.configFile==='string'&&prepared.configFile)config.configFile=prepared.configFile;
  else delete config.configFile;
  // Database Objects has an independent, explicit inspection sign-on. Profile
  // credentials must neither be retained in editor state nor selected silently.
  delete config.user;delete config.password;
  if(!config.installPath)throw Object.assign(Error('Set jadeNative.installPath or use Detect Runtime Settings.'),{code:'JADE_RUNTIME_NOT_CONFIGURED'});
  return config;
}
module.exports={inspectionConfiguration};
