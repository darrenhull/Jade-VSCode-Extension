"use strict";
const readline=require("node:readline");
const mode=process.argv[2], hold=setInterval(()=>{},1000);
readline.createInterface({input:process.stdin}).on("line",line=>{
  const packet=JSON.parse(line);
  if(packet.command==="doctor") process.stdout.write(JSON.stringify({id:packet.id,event:"result",result:{passed:true,code:0,capabilities:{sourceExtraction:{pid:process.pid}}}})+"\n");
  else if(packet.command==="cancel") process.stdout.write(JSON.stringify({id:packet.id,event:"result",result:{passed:true,code:0,cancelled:true}})+"\n");
}).on("close",()=>{if(mode!=="ignore-eof"){clearInterval(hold);process.stdout.end();}});
