'use strict';
const assert=require('node:assert/strict');
/** Content-retention checks, not a replacement for the native Mermaid renderer. */
class MarkdownCopilotWorkflow {
  assertAccepted(text,{initialCellCount,currentCellCount,requiredDiagramLabels=['Source','Tests','Working']}={}){
    assert.equal(currentCellCount,initialCellCount,'Markdown editing must retain the existing cell count.');
    assert.match(text,/^#{1,6}\s+\S/m,'Retain a Markdown heading.');
    const fences=[...text.matchAll(/^\s*(`{3,}|~{3,})\s*mermaid\s*\r?\n([\s\S]*?)^\s*\1\s*$/gm)];
    assert.ok(fences.length,'Retain a complete fenced Mermaid diagram; prose about a diagram is not a diagram.');
    assert.ok(fences.some(match=>/^\s*(?:flowchart|graph)\s+\w+/m.test(match[2])&&requiredDiagramLabels.every(label=>match[2].includes(label))),'Keep Source, Tests and Working in the same requested flowchart.');
    return {mermaidFences:fences.length,nativeRenderingStillRequired:true};
  }
}
module.exports={MarkdownCopilotWorkflow};
