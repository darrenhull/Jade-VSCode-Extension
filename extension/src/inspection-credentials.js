'use strict';
// Thin adapter over VS Code SecretStorage. VS Code owns encryption and persistence.
function secretStorage(secrets){
 if(!secrets||!['get','store','delete'].every(name=>typeof secrets[name]==='function'))
  throw Object.assign(Error('VS Code secure credential storage is unavailable. Inspection credentials were not saved.'),{code:'JADE_SECURE_STORAGE_UNAVAILABLE'});
 return secrets;
}
function invalid(){return Object.assign(Error('The stored inspection credentials are invalid. Use Sign In to replace them.'),{code:'JADE_INSPECTION_CREDENTIALS_INVALID'});}
async function invoke(secrets,operation,...args){
 const storage=secretStorage(secrets);
 try{return await storage[operation](...args);}
 catch{throw Object.assign(Error('VS Code secure credential storage could not '+(operation==='get'?'read':operation==='store'?'save':'delete')+' the inspection sign-on. No insecure storage was used.'),{code:'JADE_SECURE_STORAGE_UNAVAILABLE'});}
}
async function readInspectionCredentials(secrets,key){
 const raw=await invoke(secrets,'get',key);if(raw===undefined)return undefined;
 let value;try{value=JSON.parse(raw);}catch{throw invalid();}
 if(value&&typeof value==='object'&&!Array.isArray(value)){
  const keys=Object.keys(value);
  if(value.anonymous===true&&keys.length===1)return{};
  if(keys.length===2&&typeof value.user==='string'&&value.user!==''&&typeof value.password==='string')return{user:value.user,password:value.password};
 }
 throw invalid();
}
async function storeInspectionCredentials(secrets,key,credentials){
 const keys=Object.keys(credentials),record=keys.length===0?{anonymous:true}:credentials;
 if(keys.length!==0&&(keys.length!==2||typeof credentials.user!=='string'||credentials.user===''||typeof credentials.password!=='string'))throw invalid();
 await invoke(secrets,'store',key,JSON.stringify(record));
}
async function deleteInspectionCredentials(secrets,key){await invoke(secrets,'delete',key);}
module.exports={readInspectionCredentials,storeInspectionCredentials,deleteInspectionCredentials};
