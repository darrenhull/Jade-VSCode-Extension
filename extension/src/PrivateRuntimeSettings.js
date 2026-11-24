'use strict';
const {isDeepStrictEqual}=require('node:util');
const KEY='jadeNative.detectedCheckoutRuntimes';
class PrivateRuntimeSettings{
 constructor(state,folder){this.state=state;this.folder=folder;}
 records(){const saved=this.state?.get(KEY,{});return saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};}
 values(){const saved=this.records()[this.folder];return Object.fromEntries(['installPath','workingSeedDirectory'].filter(key=>typeof saved?.[key]==='string'&&saved[key]).map(key=>[key,saved[key]]));}
 stage(values,{validate=()=>{},previous=this.values()}={}){
  const next={...previous,...Object.fromEntries(Object.entries(values).filter(([key,value])=>['installPath','workingSeedDirectory'].includes(key)&&typeof value==='string'))};let attempted=false;
  const write=async value=>{const records={...this.records()};if(Object.keys(value).length)records[this.folder]=value;else delete records[this.folder];await this.state.update(KEY,records);};
  const rollback=async()=>{if(!attempted)return;if(isDeepStrictEqual(this.values(),previous)){attempted=false;return;}if(!isDeepStrictEqual(this.values(),next))throw Error('Private runtime settings changed; user values preserved.');await write(previous);attempted=false;};
  return{commit:async()=>{await validate();if(!isDeepStrictEqual(this.values(),previous))throw Error('Private runtime settings changed after review.');attempted=true;try{await write(next);}catch(error){try{if(isDeepStrictEqual(this.values(),next))await rollback();}catch(cleanup){error.message+=' Private runtime rollback failed: '+cleanup.message;}throw error;}},rollback};
 }
}
module.exports={PrivateRuntimeSettings};
