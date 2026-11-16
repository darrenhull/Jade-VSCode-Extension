'use strict';
function sourceConfiguration(config) {
  const source={...config};
  delete source.workingJadeGitPolicy;
  return source;
}
async function requireWorkingJadeGitPolicy(client,config) {
  const policy=config?.workingJadeGitPolicy??'inherit';
  if(policy==='inherit')return;
  if(policy!=='disabled')throw Error('Choose inherit or disabled for the Working JadeGit policy.');
  const descriptor=(await client.sourceCapabilities(sourceConfiguration(config)))?.workingJadeGitPolicy;
  if(descriptor?.format!==1||descriptor.configuration!=='workingJadeGitPolicy'||
     descriptor.default!=='inherit'||descriptor.scope!=='owned-working-only'||descriptor.reversible!==true||
     !Array.isArray(descriptor.values)||descriptor.values.length!==2||
     !descriptor.values.includes('inherit')||!descriptor.values.includes('disabled'))
    throw Error('Update the bundled Jade CLI to disable JadeGit for the Working database, or turn off Disable JadeGit for Working. This CLI does not advertise the required Working-only capability.');
}
module.exports={sourceConfiguration,requireWorkingJadeGitPolicy};
