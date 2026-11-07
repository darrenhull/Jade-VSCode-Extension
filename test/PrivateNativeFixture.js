'use strict';
const path=require('node:path');
// Copying a database does not relocate absolute Jade INI state paths.
function assertPrivateIniPaths(seed,ini){
 const root=path.dirname(path.resolve(seed)),explicit=new Set();
 for(const line of ini.split(/\r?\n/)){
  const match=/^\s*(JournalRootDirectory|ActivityLogDirectory|FileDirectory|ProgramDataDirectory|JadeWorkDirectory|LogDirectory|DefaultLogDirectory|CrashLogDirectory|ProcessDumpDirectory)\s*=\s*(.*?)\s*$/i.exec(line);
  if(!match||!match[2]||match[2]==='<default>')continue;
  const relative=path.relative(root,path.resolve(match[2]));
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Native test INI '+match[1]+' points outside its owned fixture. Relocate every state directory before opening the database.');
  explicit.add(match[1].toLowerCase());
 }
 for(const key of ['journalrootdirectory','filedirectory'])if(!explicit.has(key))throw Error('Native test INI must explicitly isolate fixture journals and transient files.');
}
module.exports={assertPrivateIniPaths};
