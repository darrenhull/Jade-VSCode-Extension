'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {CliWorkingSession}=require('../extension/src/cli-client');
const {HostTestArtifacts}=require('../scripts/HostTestArtifacts.cjs');

/** One private CLI fixture; its service and broker never share the user's state. */
class OwnedCliFixture {
  constructor({entry,spawn:spawnProcess=spawn,createSession=options=>new CliWorkingSession(options),artifacts=new HostTestArtifacts({minimumFreeBytes:0,waitMilliseconds:5000,pollMilliseconds:25})}){
    this.entry=entry;this.spawn=spawnProcess;this.createSession=createSession;this.artifacts=artifacts;
  }
  async run(action){return this.artifacts.run(async root=>{
    const stateDirectory=path.join(root,'broker'),connections=path.join(root,'connections.json');
    const session=this.createSession({entry:this.entry,spawn:(executable,args,options)=>{
      const child=this.spawn(executable,args,{...options,env:{...options.env,JADE_TOOLS_STATE_DIRECTORY:stateDirectory,JADE_TOOLS_CONNECTIONS_FILE:connections}});
      this.child=this.artifacts.track(child);return child;
    }});
    try{return await action({root,stateDirectory,session});}
    finally{
      try{
        // Capture identities before the acknowledgement resets owner.json to
        // brokerPID=0. A closed stdio proxy does not mean the broker has exited.
        const owner=this.artifacts.contained(path.join(stateDirectory,'owner.json'));
        let pids=[],brokerPID=0;
        if(fs.existsSync(owner)){
          if(fs.statSync(owner).size>65536)throw Error('Invalid owned broker metadata.');
          const record=JSON.parse(fs.readFileSync(owner,'utf8')),nativePids=record.nativePIDs===undefined?[]:record.nativePIDs;
          if(!Number.isSafeInteger(record.brokerPID)||record.brokerPID<0||!Array.isArray(nativePids)||!nativePids.every(pid=>Number.isSafeInteger(pid)&&pid>0))throw Error('Invalid owned broker process identity.');
          brokerPID=record.brokerPID;pids=[...(brokerPID?[brokerPID]:[]),...nativePids];
        }
        if(brokerPID&&session.client?.child===this.child)await session.request('shutdown').promise;
        else if(!brokerPID)session.dispose();
        await this.artifacts.waitClosed(pids);
      }
      finally{session.dispose();}
    }
  });}
}
module.exports={OwnedCliFixture};
