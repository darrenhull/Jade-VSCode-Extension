"use strict";
// Thin bounded adapter over the native catalogue snapshot. No full class graph is retained.
class NativeClassCatalogue {
  constructor(request, {scope}) { this.request=request;this.scope=scope;this.snapshotId=undefined;this.schemas=new Map();this.revision=0; }
  async read(view, filter={}) {
    const {refresh=false,...criteria}=filter;
    const args={view,offset:0,limit:100,...criteria,...(this.snapshotId&&!refresh?{snapshotId:this.snapshotId}:{}),...(refresh?{refresh:true}:{})};
    if(!Number.isSafeInteger(args.offset)||args.offset<0||!Number.isInteger(args.limit)||args.limit<1||args.limit>100)throw Error("Invalid native catalogue page.");
    if(refresh){++this.revision;this.schemas.clear();this.snapshotId=undefined;}
    const revision=this.revision,expected=args.snapshotId,body=await this.request(args);
    if(revision!==this.revision)throw Error("Native catalogue request was superseded; snapshot changed.");
    if(body?.catalogueVersion!==1||body.view!==view||typeof body.snapshotId!=="string"||!body.snapshotId||body.snapshotId.length>512||/[\x00-\x1f\x7f]/.test(body.snapshotId))
      throw Error("Native catalogue paging capability is unavailable. Update the bundled Jade CLI.");
    if((expected&&body.snapshotId!==expected)||(!expected&&this.snapshotId&&body.snapshotId!==this.snapshotId))throw Error("Native catalogue snapshot changed; refresh required.");
    if(!Array.isArray(body.rows)||body.rows.length>args.limit||!Number.isSafeInteger(body.total)||body.total<0||body.offset!==args.offset||
       !(body.next_offset===null||Number.isSafeInteger(body.next_offset)&&body.rows.length>0&&body.next_offset===args.offset+body.rows.length&&body.next_offset<body.total))
      throw Error("Invalid bounded native catalogue response.");
    for(const row of body.rows) {
      if(typeof row.name!=="string"||!row.name||typeof row.oid!=="string"||!row.oid)throw Error("Native catalogue identity unavailable.");
      if(view==="schemas"&&(!Number.isSafeInteger(row.total)||row.total<0))throw Error("Native schema count unavailable.");
      if(view==="classes"&&(typeof row.schema!=="string"||!row.schema||!Number.isSafeInteger(row.schemaOffset)||row.schemaOffset<0))throw Error("Native class position unavailable.");
    }
    if(!expected)this.snapshotId=body.snapshotId;
    return body;
  }
  async directory(filter={}) {const page=await this.read("schemas",filter);if(page.snapshotId!==this.snapshotId)throw Error("Native catalogue snapshot changed; refresh required.");for(const row of page.rows)this.schemas.set(row.name,row);return page;}
  async page(filter={}) {
    const body=await this.read("classes",filter),limit=filter.limit??100;
    const items=body.rows.map((row,i)=>({...row,catalogueSnapshot:body.snapshotId,browserId:JSON.stringify([this.scope,row.schema,row.name]),position:body.offset+i+1}));
    return {items,total:body.total,offset:body.offset,limit,hasMore:body.next_offset!==null,nextOffset:body.next_offset,
      hasPrevious:body.offset>0,previousOffset:body.offset>0?Math.max(0,body.offset-limit):null,
      label:body.total?String(body.offset+1).replace(/\B(?=(\d{3})+(?!\d))/g,",")+"–"+(body.offset+items.length).toLocaleString("en-US")+" of "+body.total.toLocaleString("en-US")+" classes":"0 classes"};
  }
  search(query,{schema}={}) {return this.page({query,...(schema?{schema}:{}),offset:0,limit:100});}
  async find({schema,name}) {const page=await this.page({schema,name,limit:1});if(page.total>1)throw Error("Ambiguous native class identity.");return page.items[0];}
}
module.exports={NativeClassCatalogue};
