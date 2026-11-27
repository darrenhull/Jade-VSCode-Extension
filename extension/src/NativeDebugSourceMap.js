 'use strict';
const compare=(a,b)=>a.line-b.line||a.character-b.character;
const point=value=>value&&Number.isSafeInteger(value.line)&&value.line>=0&&Number.isSafeInteger(value.character)&&value.character>=0;
class NativeDebugSourceMap {
 constructor(runs){
  if(!Array.isArray(runs)||!runs.length)throw Error('Native debugger mapping is unavailable.');
  this.runs=structuredClone(runs);
  for(let index=0;index<this.runs.length;index++){
   const run=this.runs[index];
   for(const key of ['rawRange','projectionRange']){
    const range=run[key];if(!point(range?.start)||!point(range?.end)||compare(range.start,range.end)>=0)throw Error('Invalid native debugger mapping range.');
    if(index&&compare(this.runs[index-1][key].end,range.start)>0)throw Error('Native debugger mapping ranges overlap or are unordered.');
   }
  }
 }
 translate(position,from,to){
  if(!point(position))return;
  const run=this.runs.find(value=>compare(value[from].start,position)<=0&&compare(position,value[from].end)<0);
  if(!run)return;
  const input=run[from],output=run[to];
  const linear=input.end.line-input.start.line===output.end.line-output.start.line&&input.end.character-input.start.character===output.end.character-output.start.character;
  if(!linear)return {...output.start};
  const line=position.line-input.start.line;
  return {line:output.start.line+line,character:position.character+(line===0?output.start.character-input.start.character:0)};
 }
 toProjection(position){return this.translate(position,'rawRange','projectionRange');}
 toEditor(position){return this.translate(position,'projectionRange','rawRange');}
 breakpointLine(line,column){
  const rawLine=line-1;
  const run=this.runs.find(value=>value.rawRange.start.line<=rawLine&&value.rawRange.end.line>=rawLine);
  if(!run)return;
  const position=this.toProjection({line:rawLine,character:column===undefined?(run.rawRange.start.line===rawLine?run.rawRange.start.character:0):column-1});
  return position&&{line:position.line+1,column:position.character+1};
 }
}
module.exports={NativeDebugSourceMap};
