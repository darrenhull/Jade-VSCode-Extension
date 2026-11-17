'use strict';

// PowerShell startup, Git fixtures and ZIP tests compete heavily for hosted
// Windows runner resources. Run those suites in a separate, serial phase.
function createTestPlan(files) {
  const isolated=[];
  const regular=[];
  for(const file of files) {
    const normalized=file.replaceAll('\\','/').toLowerCase();
    const heavy=/\/tests\/(?:nativereleaseupdater|agentpullrequest|release-ancestry|update-cli)\//.test(normalized);
    (heavy?isolated:regular).push(file);
  }
  const phases = [
    {name:'JavaScript contracts',concurrency:2,files:regular},
    {name:'Isolated PowerShell contracts',concurrency:1,files:isolated}
  ].filter(phase=>phase.files.length);
  const batches=[];
  // CreateProcessW has a 32,767 UTF-16-unit limit including the executable,
  // quoting and terminator. Count every character twice for conservative argv
  // escaping and reserve space for the fixed Node flags; never invoke a shell.
  const overhead=1024+2*process.execPath.length+3,limit=24000;
  for(const phase of phases) {
    let batch=[],length=overhead;
    for(const file of phase.files) {
      const cost=2*file.length+3;
      if(overhead+cost>limit)throw Error('Test file path exceeds the Windows command-line budget: '+file);
      if(length+cost>limit){batches.push({...phase,files:batch});batch=[];length=overhead;}
      batch.push(file);length+=cost;
    }
    if(batch.length)batches.push({...phase,files:batch});
  }
  return batches;
}

module.exports={createTestPlan};
