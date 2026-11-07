'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateObjectIdentity,requireNativeOidCapability}=require('../../extension/src/NativeObjectIdentity');
test('vendor identity strings and legacy inputs pass through without reconstruction',()=>{
 for(const value of ['9002.1','51.1 (t)','51.2 (s)','66.101.305.2.1','66.101.305','00000000000000000000000000000000000000000001',' 51.1 ']) assert.equal(validateObjectIdentity(value),undefined);
});
test('identity bounds use UTF8 bytes and reject control characters only',()=>{
 for(const value of ['',null,7,'a'.repeat(513),'é'.repeat(257),'51.1\n','51.1\0','51.1\x7f']) assert.equal(typeof validateObjectIdentity(value),'string');
 assert.equal(validateObjectIdentity('é'.repeat(256)),undefined);
});
test('native identity capability is required independently of version number',()=>{
 assert.throws(()=>requireNativeOidCapability({}),/native Jade object identities/i);
 assert.throws(()=>requireNativeOidCapability({oidFormat:'hex'}),/native Jade object identities/i);
 assert.doesNotThrow(()=>requireNativeOidCapability({oidFormat:'jade-native'}));
});
test('distribution compatibility accepts newer capability-bearing versions, not missing/older versions',()=>{
 const {requireNativeOidDistribution}=require('../../extension/src/NativeObjectIdentity');
 for(const packageVersion of ['0.3.2','0.4.0','0.4.1','1.0.0']) assert.doesNotThrow(()=>requireNativeOidDistribution({packageVersion,oidFormat:'jade-native'}));
 for(const packageVersion of ['0.3.1','0.2.99','invalid',undefined]) assert.throws(()=>requireNativeOidDistribution({packageVersion,oidFormat:'jade-native'}),/0.3.2/);
 assert.throws(()=>requireNativeOidDistribution({packageVersion:'0.4.1'}),/native Jade object identities/i);
});
