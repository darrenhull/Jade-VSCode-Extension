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
  return [
    {name:'JavaScript contracts',concurrency:2,files:regular},
    {name:'Isolated PowerShell contracts',concurrency:1,files:isolated}
  ].filter(phase=>phase.files.length);
}

module.exports={createTestPlan};
