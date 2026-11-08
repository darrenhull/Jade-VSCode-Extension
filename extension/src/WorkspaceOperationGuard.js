'use strict';
/** Claims an IDE operation; the native CLI owns connection reuse and handoff. */
class WorkspaceOperationGuard {
  constructor({isBusy,claim,updateContext}) {
    Object.assign(this,{isBusy,claim,updateContext});
  }
  async acquire() {
    if(this.lease||this.isBusy())throw Error('Wait for the current Jade operation or cancel it first.');
    const lease={};this.lease=lease;this.claim(true);
    try {await this.updateContext(true);return lease;}
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