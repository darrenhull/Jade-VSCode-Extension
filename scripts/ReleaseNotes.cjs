'use strict';

function releaseNotesForVersion(changelog,version) {
  if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('A stable release version is required.');
  const lines=changelog.replace(/\r\n/g,'\n').split('\n'),notes=[];let selected=false;
  for(const line of lines) {
    const heading=/^# (?:v)?(\d+\.\d+\.\d+)(?:\s|$)/.exec(line);
    if(heading){if(selected)break;selected=heading[1]===version;continue;}
    if(selected)notes.push(line);
  }
  return notes.join('\n').trim();
}
module.exports={releaseNotesForVersion};
