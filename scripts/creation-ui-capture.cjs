'use strict';
// Automation targets only the private host started by host-test.cjs, never the
// user's normal Code window. The debugger port is loopback and owned per run.
const fs=require('node:fs'),path=require('node:path');
function createCdpConnection(socket,{timeoutMilliseconds=10000}={}){
 const pending=new Map(),listeners=new Set();let sequence=0,closed=false;
 const fail=error=>{closed=true;for(const value of pending.values()){clearTimeout(value.timer);value.reject(error);}pending.clear();};
 socket.addEventListener('close',()=>fail(Error('Private Code debugger closed.')));
 socket.addEventListener('error',()=>fail(Error('Private Code debugger connection failed.')));
 socket.addEventListener('message',event=>{let value;try{value=JSON.parse(event.data);}catch{return;}if(value.id){const item=pending.get(value.id);if(!item)return;pending.delete(value.id);clearTimeout(item.timer);value.error?item.reject(Error(value.error.message)):item.resolve(value.result);}else for(const listener of listeners)listener(value);});
 return {request(method,params={},sessionId){if(closed)return Promise.reject(Error('Private Code debugger closed.'));return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Private Code debugger timed out: '+method));},timeoutMilliseconds);pending.set(id,{resolve,reject,timer});try{socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}});},onEvent(listener){listeners.add(listener);return()=>listeners.delete(listener);},close(){fail(Error('Private Code debugger closed.'));socket.close();}};
}
async function connectPrivateDebugger(port){
 if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('Invalid private debugger port.');
 const response=await fetch('http://127.0.0.1:'+port+'/json/version',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Private Code debugger unavailable.');const info=await response.json();
 const url=new URL(info.webSocketDebuggerUrl);if(!['127.0.0.1','localhost'].includes(url.hostname)||Number(url.port)!==port)throw Error('Unexpected private debugger endpoint.');
 const socket=new WebSocket(url);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.close();reject(Error('Private Code debugger connection timed out.'));},10000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Private Code debugger connection failed.'));},{once:true});});return createCdpConnection(socket);
}
async function capturePrivateDesigner(port,destination,{expression}={}){
 return withPrivateDesigner(port,async designer=>{if(expression&&!await designer.evaluate(expression))throw Error('Private creation designer expression did not complete.');return designer.screenshot(destination);});
}
async function withPrivateDesigner(port,action){
 const client=await connectPrivateDebugger(port);let pageSession,designerSession,designerContext,lastTargets=[];
 try{
  for(let attempt=0;attempt<100&&!designerSession;attempt++){
   const {targetInfos}=await client.request('Target.getTargets');lastTargets=targetInfos.map(t=>({type:t.type,url:t.url}));
   const page=targetInfos.find(t=>t.type==='page'&&t.url.startsWith('vscode-file://'));
   if(page&&!pageSession)pageSession=(await client.request('Target.attachToTarget',{targetId:page.targetId,flatten:true})).sessionId;
   for(const frame of targetInfos.filter(t=>t.type==='iframe'&&/webview/i.test(t.url))){
    const attached=await client.request('Target.attachToTarget',{targetId:frame.targetId,flatten:true});
    const contexts=[];const unsubscribe=client.onEvent(event=>{if(event.sessionId===attached.sessionId&&event.method==='Runtime.executionContextCreated')contexts.push(event.params.context.id);});
    await client.request('Runtime.enable',{},attached.sessionId);unsubscribe();
    for(const contextId of contexts){const found=await client.request('Runtime.evaluate',{expression:'Boolean(document.getElementById("designer") && document.getElementById("project"))',contextId,returnByValue:true},attached.sessionId);if(found.result?.value){designerSession=attached.sessionId;designerContext=contextId;break;}}
    if(designerSession)break;
    await client.request('Target.detachFromTarget',{sessionId:attached.sessionId});
   }
   if(!designerSession)await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!pageSession||!designerSession)throw Error('Running private creation designer was not found. Targets: '+JSON.stringify(lastTargets));
  return await action({async evaluate(expression){const result=await client.request('Runtime.evaluate',{expression,contextId:designerContext,awaitPromise:true,returnByValue:true},designerSession);if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value;},async key(key,code){for(const type of ['keyDown','keyUp'])await client.request('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code},designerSession);},async type(text){await client.request('Input.insertText',{text},designerSession);},async screenshot(destination){const result=await client.request('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},pageSession);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,Buffer.from(result.data,'base64'));return destination;}});
 }finally{client.close();}
}
module.exports={createCdpConnection,connectPrivateDebugger,capturePrivateDesigner,withPrivateDesigner};
