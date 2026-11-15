'use strict';
/** Coalesces transient progress; never queues one notebook edit per native output chunk. */
class ScratchPadProgress {
 constructor(render,{delay=250,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  Object.assign(this,{render,delay,setTimer,clearTimer});this.closed=false;this.dirty=false;this.tail='';
 }
 update(message){if(this.closed||this.error)return;this.message=String(message||'Waiting for JADE').slice(-768);this.dirty=true;if(!this.running&&!this.timer)this.flush();}
 native(text){this.tail=(this.tail+String(text)).slice(-2048);const lines=this.tail.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);if(lines.length)this.update('Native progress: '+lines.at(-1).slice(-512));}
 flush(){
  this.timer=undefined;if(this.closed||this.error||!this.dirty)return;
  const message=this.message;this.dirty=false;
  this.running=Promise.resolve().then(()=>this.render(message+'\nWaiting for the native result; elapsed time does not confirm scratch code execution.')).catch(error=>{this.error=error;}).finally(()=>{
   this.running=undefined;if(!this.closed&&!this.error)this.timer=this.setTimer(()=>this.flush(),this.delay);
  });
 }
 async stop(){this.closed=true;if(this.timer)this.clearTimer(this.timer);await this.running;return this.error;}
}
module.exports={ScratchPadProgress};