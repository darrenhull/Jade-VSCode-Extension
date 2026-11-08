'use strict';
/** Transfers an idle inspection connection into an exclusively owned operation. */
class WorkspaceOperationGuard {
  constructor({isBusy,inspectorOwnsLock,releaseInspector,claim,updateContext,releaseNative}) {
    Object.assign(this,{isBusy,inspectorOwnsLock,releaseInspector,claim,updateContext,releaseNative});
  }
  async acquire() {
    const rejectBusy=()=>{throw Error('Wait for the current Jade operation or cancel it first.');};
    if(this.lease||this.isBusy()&&!this.inspectorOwnsLock())rejectBusy();
    await this.releaseInspector();
    // An operation may have claimed the runtime while disconnect was awaiting I/O.
    if(this.lease||this.isBusy())rejectBusy();
    const lease={};this.lease=lease;this.claim(true);
    try {await this.updateContext(true);await this.releaseNative();return lease;}
    catch(error){try{await this.release(lease);}catch{}throw error;}
  }
  async release(lease) {
    if(!lease||this.lease!==lease)return;
    this.claim(false);
    try {await this.updateContext(false);}
    finally {if(this.lease===lease)this.lease=undefined;}
  }
}
module.exports={WorkspaceOperationGuard};
