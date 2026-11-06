'use strict';
const {excludedAt,parseParameters}=require('./source-lex');
const keywords=['begin','end','vars','return','if','then','else','elseif','endif','while','do','endwhile','foreach','in','endforeach','create','transient','delete','epilog','null','true','false','self','updating','protected'];
const key=(schema,name)=>schema+'::'+name;
const parameterLabel=parameter=>`${parameter.name} : ${parameter.type||'Any'}${parameter.usage&&parameter.usage!=='constant'?' '+parameter.usage:''}`;
function label(member){if(member.kind==='class')return `${member.name}${member.parent?' subclassOf '+member.parent:''}`;
  if(member.kind!=='method')return `${member.name} : ${member.type||'Any'}${member.length?'['+member.length+']':''}${member.access===1?' readOnly':''}`;
  return `${member.name}(${(member.parameters||[]).map(parameterLabel).join('; ')})${member.returnType?' : '+member.returnType:''}${member.updating?' updating':''}${member.typeMethod?' typeMethod':''}`;
}
function expressionBefore(code,end){
  let i=end-1;const parts=[];
  while(i>=0){while(i>=0&&/\s/.test(code[i]))i--;let called=false;
    if(code[i]===')'){called=true;let depth=1;i--;while(i>=0&&depth){if(code[i]===')')depth++;if(code[i]==='(')depth--;i--;}if(depth)return;while(i>=0&&/\s/.test(code[i]))i--;}
    const stop=i+1;while(i>=0&&/[A-Za-z_0-9]/.test(code[i]))i--;const name=code.slice(i+1,stop);if(!/^[A-Za-z_]\w*$/.test(name))return;
    parts.unshift({name,called,start:i+1});while(i>=0&&/\s/.test(code[i]))i--;if(code[i]!=='.')break;i--;
  }return parts;
}
class LanguageModel{
  constructor(){this.models=new Map();this.groups=new Map();this.schemaParents=new Map();this.system=new Map();this.resolved=new Map();this.generation=0;}
  update(model){this.remove(model.uri);this.models.set(model.uri,model);
    if(model.schema){if(!this.schemaParents.has(model.schema))this.schemaParents.set(model.schema,new Map());this.schemaParents.get(model.schema).set(model.uri,model.parentSchema);}
    for(const cls of model.classes){const id=key(model.schema||'',cls.name);if(!this.groups.has(id))this.groups.set(id,[]);this.groups.get(id).push({cls,model});}
    this.resolved.clear();this.generation++;
  }
  remove(uri){const old=this.models.get(uri);if(!old)return;this.models.delete(uri);this.schemaParents.get(old.schema)?.delete(uri);
    for(const cls of old.classes){const id=key(old.schema||'',cls.name),entries=(this.groups.get(id)||[]).filter(value=>value.model.uri!==uri);if(entries.length)this.groups.set(id,entries);else this.groups.delete(id);}
    this.resolved.clear();this.generation++;
  }
  parent(schema){const parents=[...new Set(this.schemaParents.get(schema)?.values()||[])].filter(Boolean);return parents.length===1?parents[0]:parents.length===0&&schema!=='RootSchema'?'RootSchema':undefined;}
  setSystemCache(cache){this.system.clear();const types=cache?.types||[],names=new Map(types.map(type=>[type.oid,type.name]));
    for(const type of types){if(type.schema_name&&type.schema_name!=='RootSchema')continue;
      const value={name:type.name,schema:'RootSchema',parent:names.get(type.superclass_oid),kind:'class',primitive:type.primitive,members:[],system:true};
      for(const property of type.properties||[])value.members.push({...property,kind:'property',type:names.get(property.type_oid),typeMethod:false});
      for(const method of type.methods||[])value.members.push({...method,kind:'method',typeMethod:Boolean(method.type_method),returnType:names.get(method.return_type?.type_oid),parameters:(method.parameters||[]).map(parameter=>({...parameter,type:names.get(parameter.type_oid),usage:['constant','input','io','output'][parameter.usage]||'constant'}))});
      value.members=value.members.map(member=>({...member,owner:type.name,schema:'RootSchema',system:true}));
      const prior=this.system.get(type.name);if(!prior||![7,8].includes(type.category))this.system.set(type.name,value);
    }this.resolved.clear();this.generation++;
  }
  type(name,schema,seen=new Set()){
    if(!name)return;const id=key(schema||'',name);if(this.resolved.has(id))return this.resolved.get(id);if(seen.has(id))return;seen.add(id);
    const entries=this.groups.get(id)||[],complete=entries.filter(value=>!value.cls.partial);let result;
    if(complete.length>1)return;
    if(complete.length===1||entries.length){const base=complete[0];let inherited;if(!base)inherited=this.type(name,this.parent(schema),seen);
      if(!base&&!inherited)return;
      result={...(inherited||base.cls),name,schema:base?.model.schema||inherited.schema,model:base?.model||inherited.model,kind:'class',members:[]};
      const members=new Map((inherited?.members||[]).map(member=>[member.name,member]));
      for(const entry of [...(base?[base]:[]),...entries.filter(value=>value!==base)])for(const member of entry.cls.members)members.set(member.name,{...member,model:entry.model,owner:name,schema:entry.model.schema});
      result.members=[...members.values()];
    }else if(schema==='RootSchema')result=this.system.get(name);
    else{const parent=this.parent(schema);if(parent)result=this.type(name,parent,seen);}
    this.resolved.set(id,result);return result;
  }
  context(model,offset){const raw=model.classes.find(cls=>cls.regions.some(([start,end])=>start<=offset&&offset<=end))||model.classes[0];
    const owner=raw&&this.type(raw.name,model.schema),method=raw?.members.find(member=>member.kind==='method'&&member.bodyStart!==undefined&&member.bodyStart<=offset&&offset<=member.end);
    const variables=new Map();for(const parameter of method?.parameters||[])variables.set(parameter.name,{...parameter,kind:'variable',parameter:true});
    if(method){const body=model.code.slice(method.signatureEnd||method.bodyStart,offset);const vars=/\bvars\b([\s\S]*?)(?=\bbegin\b|$)/.exec(body)?.[1];if(vars)for(const variable of parseParameters(vars))variables.set(variable.name,{...variable,kind:'variable'});}
    return {model,offset,raw,owner,method,variables,schema:model.schema};
  }
  subtype(type,ancestor){const seen=new Set();while(type&&!seen.has(key(type.schema,type.name))){if(type.name===ancestor.name&&type.schema===ancestor.schema)return true;seen.add(key(type.schema,type.name));type=this.type(type.parent,type.schema);}return false;}
  members(type,context,typeReceiver=false){const members=new Map(),seen=new Set();while(type&&!seen.has(key(type.schema,type.name))){seen.add(key(type.schema,type.name));
      for(const member of type.members){if(members.has(member.name))continue;members.set(member.name,member);}
      type=this.type(type.parent,type.schema);
    }
    return [...members.values()].filter(member=>{
      if(Boolean(member.typeMethod)!==Boolean(typeReceiver))return false;
      if(member.subaccess>=3&&member.schema!==context.schema)return false;
      if(member.access===2){const declaring=this.type(member.owner,member.schema);if(!context.owner||!declaring||!this.subtype(context.owner,declaring))return false;}
      return true;
    });
  }
  rootReference(name,context){
    if(name==='self')return context.owner&&{type:context.owner,typeReceiver:false};
    if(name==='selfType')return context.owner&&{type:context.owner,typeReceiver:true};
    if(context.variables.has(name)){const symbol=context.variables.get(name);return {type:this.type(symbol.type,context.schema),symbol,typeReceiver:false};}
    const member=context.owner&&this.members(context.owner,context,Boolean(context.method?.typeMethod)).find(member=>member.name===name);
    if(member)return {type:this.type(member.type||member.returnType,member.schema),symbol:member,typeReceiver:false};
    if(['app','global','currentSession'].includes(name)){
      const base={app:'RootSchemaApp',global:'RootSchemaGlobal',currentSession:'RootSchemaSession'}[name];let schema=context.schema;
      while(schema&&schema!=='RootSchema'){const matches=[];for(const [id,values] of this.groups)if(id.startsWith(schema+'::')){const type=this.type(values[0].cls.name,schema);const ancestor=this.type(base,'RootSchema');if(type&&ancestor&&this.subtype(type,ancestor))matches.push(type);}if(matches.length===1)return {type:matches[0],typeReceiver:false};schema=this.parent(schema);}
    }
    const type=this.type(name,context.schema);return type&&{type,symbol:type,typeReceiver:true};
  }
  expression(parts,context){if(!parts?.length)return;let reference=this.rootReference(parts[0].name,context);if(!reference)return;
    if(parts[0].called&&reference.symbol?.kind!=='method')return;
    for(const part of parts.slice(1)){
      if(!reference.type)return;const member=this.members(reference.type,context,reference.typeReceiver).find(value=>value.name===part.name);
      if(!member||(part.called&&member.kind!=='method'))return;
      reference={type:this.type(member.type||member.returnType,member.schema),symbol:member,typeReceiver:false};
    }return reference;
  }
  complete(model,offset){if(excludedAt(model,offset))return {items:[],isIncomplete:false};const context=this.context(model,offset),prefix=/[A-Za-z_]\w*$/.exec(model.code.slice(0,offset))?.[0]||'';let start=offset-prefix.length;
    while(start>0&&/\s/.test(model.code[start-1]))start--;
    let items=[];
    if(model.code[start-1]==='.'){
      const reference=this.expression(expressionBefore(model.code,start-1),context);if(reference?.type)items=this.members(reference.type,context,reference.typeReceiver);
    }else{
      items=[...context.variables.values(),...(context.owner?this.members(context.owner,context,Boolean(context.method?.typeMethod)):[])];
      const names=new Set([...this.system.keys(),...[...this.groups.values()].map(entries=>entries[0].cls.name)]);
      for(const name of names){if(prefix&&!name.toLowerCase().startsWith(prefix.toLowerCase()))continue;const type=this.type(name,model.schema);if(type)items.push(type);}
      items.push(...keywords.map(name=>({name,kind:'keyword'})));
    }
    const unique=new Map();for(const item of items)if(item.name.toLowerCase().startsWith(prefix.toLowerCase())&&(!item.name.startsWith('_')||prefix.startsWith('_'))&&!unique.has(item.name))unique.set(item.name,item);
    const values=[...unique.values()].sort((a,b)=>a.name.localeCompare(b.name));return {items:values.slice(0,500),isIncomplete:values.length>500,prefix,start:offset-prefix.length};
  }
  referenceAt(model,offset){if(excludedAt(model,offset))return;let start=offset,end=offset;while(start>0&&/[A-Za-z_0-9]/.test(model.code[start-1]))start--;while(end<model.code.length&&/[A-Za-z_0-9]/.test(model.code[end]))end++;
    const name=model.code.slice(start,end);if(!/^[A-Za-z_]\w*$/.test(name))return;const context=this.context(model,offset);let dot=start;while(dot>0&&/\s/.test(model.code[dot-1]))dot--;let symbol;
    if(model.code[dot-1]==='.')symbol=this.expression([...(expressionBefore(model.code,dot-1)||[]),{name,called:false}],context)?.symbol;
    else symbol=this.rootReference(name,context)?.symbol;
    return symbol&&{symbol,start,end,context};
  }
  hover(model,offset){const reference=this.referenceAt(model,offset);return reference&&{...reference.symbol,label:label(reference.symbol),range:{start:reference.start,end:reference.end}};}
  signatureHelp(model,offset){const excluded=excludedAt(model,offset);if(excluded&&excluded.kind!=='string')return;
    const context=this.context(model,offset);if(!context.method||offset<=context.method.signatureEnd)return;const stack=[];let brackets=0;
    for(let i=context.method.signatureEnd;i<offset;i++){const char=model.code[i];if(char==='[')brackets++;else if(char===']')brackets--;else if(char==='(')stack.push({open:i,commas:0,brackets});else if(char===')')stack.pop();else if(char===','&&stack.length&&brackets===stack.at(-1).brackets)stack.at(-1).commas++;}
    for(const frame of stack.reverse()){
      const parts=expressionBefore(model.code,frame.open);let method;
      if(parts?.length===1&&parts[0].name==='inheritMethod'){const parent=context.owner&&this.type(context.owner.parent,context.owner.schema);method=parent&&this.members(parent,context).find(member=>member.name===context.method.name);if(method)method={...method,name:'inheritMethod'};}
      else method=this.expression(parts,context)?.symbol;
      if(method?.kind!=='method')continue;return {...method,label:label(method),parameters:(method.parameters||[]).map(parameter=>({...parameter,label:parameterLabel(parameter)})),activeParameter:Math.min(frame.commas,Math.max(0,(method.parameters||[]).length-1))};
    }
  }
}
module.exports={LanguageModel,label,expressionBefore};
