'use strict';
const {EventEmitter}=require('node:events');
const {randomUUID}=require('node:crypto');
const {configDto}=require('./cli-client');
const {requireNativeOidCapability}=require('./NativeObjectIdentity');
const inspectionCommands=new Set(['catalog','instances','object','collection','release']);

/** Read-only inspection adapter over the extension's existing native CLI service. */
class CliInspectionTransport extends EventEmitter {
  constructor(service,{config,target,catalogArgs={includeSystem:false}}={}) {
    super();
    if(!service||typeof service.request!=='function'||typeof service.connect!=='function')throw Error('A shared native CLI service is required.');
    if(!['source','working'].includes(target))throw Error('Invalid database selection.');
    this.service=service;
    this.config=JSON.parse(JSON.stringify(configDto(config)));
    this.target=target;
    this.sessionId='vscode-inspect-'+randomUUID();
    this.catalogArgs=JSON.parse(JSON.stringify(catalogArgs));
    this.state='starting';
    this.pending=new Set();
    this.child=service.connect().child;
    this.onServiceClose=code=>this.close(code);
    this.onServiceError=()=>this.close(2);
    this.child.once('close',this.onServiceClose);
    this.child.once('error',this.onServiceError);
    this.ready=Promise.resolve().then(()=>this.send('catalog',this.catalogArgs)).then(body=>{
      if(this.state!=='starting')throw Error('Inspection connection was cancelled.');
      this.initialCatalog=body;
      this.state='ready';
      return body;
    });
    // Consumers still receive the original rejected readiness promise.
    void this.ready.catch(error=>{
      if(this.state==='starting'){
        this.emit('failure',error);
        void this.stop().catch(()=>{});
      }
    });
  }

  async send(command,args) {
    if(this.state==='closed'||this.state==='stopping')throw Error('Inspection connection is closed.');
    const guardedArgs={...args,...(this.connectionEpoch?{connectionEpoch:this.connectionEpoch}:{})};
    const request=this.service.request('inspect.'+command,{config:this.config,target:this.target,sessionId:this.sessionId,args:guardedArgs},text=>this.emit('output',text));
    this.pending.add(request.id);
    try {
      const result=await request.promise;
      if(this.state==='closed'||this.state==='stopping')throw Error('Inspection connection was cancelled.');
      if(result?.passed!==true||result.code!==0){
        const error=Error(result?.report?.error||result?.error||'Native inspection failed.');
        error.code=result?.code;
        throw error;
      }
      if(result.sessionId!==this.sessionId)throw Error('Native inspection returned a different session identity.');
      const body=result.body;
      if(body?.readOnly!==true)throw Error('Native inspection did not confirm a read-only connection.');
      requireNativeOidCapability(body);
      if(typeof body.connectionEpoch!=='string'||!body.connectionEpoch.length||body.connectionEpoch.length>512||/[\x00-\x1f\x7f]/.test(body.connectionEpoch))
        throw Error('Native inspection connection identity is unavailable. Update the bundled Jade CLI.');
      const previous=this.connectionEpoch;
      this.connectionEpoch=body.connectionEpoch;
      if(previous&&previous!==body.connectionEpoch){
        this.initialCatalog=undefined;
        this.emit('epoch',{previous,current:body.connectionEpoch});
      }
      if(body.staleConnection===true)throw Object.assign(Error('The native connection changed. Refresh the database view before inspecting this object again.'),{code:'JADE_INSPECTION_EPOCH_CHANGED'});
      return body;
    } finally {this.pending.delete(request.id);}
  }

  async request(command,args={}) {
    if(!inspectionCommands.has(command))throw Error('Object Explorer supports read-only inspection operations only.');
    if(this.state==='closed'||this.state==='stopping')throw Error('Inspection connection is closed.');
    await this.ready;
    if(this.state!=='ready')throw Error('Inspection connection is closed.');
    if(command==='catalog'&&this.initialCatalog&&JSON.stringify(args)===JSON.stringify(this.catalogArgs)){
      const body=this.initialCatalog;this.initialCatalog=undefined;return body;
    }
    this.initialCatalog=undefined;
    return this.send(command,args);
  }

  static async disconnectTarget(service,{config,target}) {
    if(!['source','working'].includes(target))throw Error('Invalid database selection.');
    const result=await service.request('inspect.close',{config:configDto(config),target,sessionId:'vscode-disconnect-'+randomUUID(),args:{disconnect:true}}).promise;
    if(result?.passed!==true||result.code!==0){const error=Error(result?.report?.error||'Native inspection could not disconnect its target.');error.code=result?.code;throw error;}
  }

  stop({disconnect=false}={}) {
    if(this.closing)return this.closing;
    if(this.state==='closed')return Promise.resolve();
    this.state='stopping';
    this.initialCatalog=undefined;
    for(const operationId of this.pending)
      void this.service.request('cancel',{operationId}).promise.catch(()=>{});
    this.closing=(async()=>{
      try {
        const result=await this.service.request('inspect.close',{config:this.config,target:this.target,sessionId:this.sessionId,...(disconnect?{args:{disconnect:true}}:{})}).promise;
        if(result?.passed!==true||result.code!==0)throw Error(result?.report?.error||'Native inspection could not close its session.');
      } finally {this.close(0);}
    })();
    return this.closing;
  }

  close(code) {
    if(this.state==='closed')return;
    this.state='closed';
    delete this.config.user;
    delete this.config.password;
    this.initialCatalog=undefined;
    this.child.removeListener('close',this.onServiceClose);
    this.child.removeListener('error',this.onServiceError);
    this.emit('close',code);
  }
}
module.exports={CliInspectionTransport};
