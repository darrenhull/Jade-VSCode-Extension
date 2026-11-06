'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const executable=path.resolve(__dirname,'../extension/native/jade-inspect-helper.exe');
function rejected(config){const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-inspect-policy-')),file=path.join(root,'session.json');fs.writeFileSync(file,JSON.stringify(config));
 return new Promise((resolve,reject)=>{const child=spawn(executable,[file],{windowsHide:true});let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(Error('Policy rejection timed out.'));},5000);child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.once('error',reject);child.once('close',code=>{clearTimeout(timer);try{resolve({code,message:JSON.parse(stdout.trim()).message,stderr});}catch(error){reject(error);}});});
}
test('native inspector never reports ready when the configured native runtime is missing',{skip:!fs.existsSync(executable)},async()=>{
 const result=await rejected({server:'multiUser',databasePath:'does-not-exist',installPath:'does-not-exist',iniPath:'does-not-exist'});assert.equal(result.code,2);assert.match(result.message,/Cannot load native Jade runtime/i);
});
test('native inspector fails closed before inspecting if the secured runtime cannot be loaded',{skip:!fs.existsSync(executable)},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-custom-policy-')),ini=path.join(root,'jade.ini');fs.writeFileSync(ini,'[JadeSecurity]\nDevelopmentSecurityLibrary=company-security.dll\n');
 const result=await rejected({server:'singleUser',databasePath:'does-not-exist',installPath:'does-not-exist',iniPath:ini});assert.equal(result.code,2);assert.match(result.message,/Cannot load native Jade runtime/i);
});
