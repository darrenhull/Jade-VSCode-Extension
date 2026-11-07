"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");
const { createClassWorkspaces } = require("../src/class-workspace");
const { ClassWorkspaceEditorProvider } = require("../src/class-workspace-editor-provider");
const { withClassWorkspace } = require("./class-workspace-ui-capture.cjs");

async function run() {
  const workspace = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const report = path.resolve(workspace, "../host-report.json");
  const captures = process.env.JADE_CLASS_WORKSPACE_SCREENSHOTS;
  const owned = [], messages = [], selections = [], memento = new Map();
  let document, saved, binding;
  const source = ["schemaDefinition", "Pets subschemaOf RootSchema partialDefinition;", "typeHeaders", "Fish subclassOf Object transient;", "typeDefinitions", "Fish completeDefinition", "(", "attributeDefinitions", "name: String[50];", "jadeMethodDefinitions", "getName() : String;", ")", "typeSources", "Fish (", "jadeMethodSources", "getName", "{", "getName() : String;", "begin", ' return "Bubbles";', "end;", "}", ")"].join("\r\n");
  const file = path.join(workspace, "ClassWorkspaceFish.cls");
  fs.writeFileSync(file, source);
  const uri = vscode.Uri.file(file), row = { projectId: workspace, schema: "Pets", owner: "Fish", file: uri.toString() };
  const members = [{id:"name",name:"name",kind:"property",detail:"name: String[50];",owner:"Fish",file:uri.toString()}, {id:"getName",name:"getName",kind:"method",owner:"Fish",file:uri.toString()}, ...Array.from({length:9998},(_,index)=>({id:"generated"+index,name:"member"+String(index).padStart(5,"0"),kind:"property",detail:"String[50]",owner:"Fish",file:uri.toString()}))];
  try {
    const context = { extensionUri: vscode.Uri.file(path.resolve(__dirname, "..")), workspaceState: { get: key => memento.get(key), update: async (key,value) => memento.set(key,value) } };
    const shell = createClassWorkspaces(vscode, context, {
      async load(_row,state) {
        const matching=members.filter(member=>(state.kind==="all"||member.kind===state.kind)&&member.name.toLowerCase().includes(state.query.toLowerCase())), page=matching.slice(state.offset,state.offset+100);
        return {identity:{qualifiedName:"Pets::Fish",name:"Fish",schema:"Pets",projectName:"Workspace UI proof",file:uri.toString(),superclass:"Object",lifetime:"Transient"},groups:[{label:"Properties",total:9999,items:page.filter(m=>m.kind==="property")},{label:"Methods",total:1,items:page.filter(m=>m.kind==="method")}],total:matching.length,offset:state.offset,hasMore:state.offset+100<matching.length,inheritedAvailable:false,inheritedReason:"No resolved inherited source is included in this fixture.",selected:members.find(m=>m.id===state.selectedId),overview:{counts:[{label:"Properties",count:9999},{label:"Methods",count:1}]}};
      },
      onOriginal: () => selections.push("original"), onInstances:()=>messages.push("instances"), onBack:()=>messages.push("back"),
      preview:async (_row,id)=>({text:members.find(member=>member.id===id)?.detail || ""}),
    });
    owned.push(shell);
    const provider=new ClassWorkspaceEditorProvider(vscode,session=>{document=session.document;saved=session.services.save;binding=session.binding;return shell.attach({...session,row});});
    owned.push(provider,vscode.window.registerCustomEditorProvider("jade.testClassWorkspace",provider,{supportsMultipleEditorsPerDocument:true,webviewOptions:{retainContextWhenHidden:true}}));
    await vscode.commands.executeCommand("vscode.openWith",uri,"jade.testClassWorkspace",{preview:false,viewColumn:vscode.ViewColumn.One});
    const evidence=await withClassWorkspace(Number(process.env.JADE_CLASS_WORKSPACE_DEBUG_PORT),async browser=>{
      await browser.wait('document.getElementById("workspace").getAttribute("aria-busy")==="false"',"initial class snapshot");
      assert.equal(await browser.evaluate('document.querySelectorAll("[role=treeitem]").length'),100);
      assert.equal(await browser.evaluate('document.getElementById("class-name").textContent'),"Pets::Fish");
      assert.equal(await browser.evaluate('document.getElementById("inherited").disabled'),true);
      const overview=path.join(captures,"class-workspace-overview.png");await browser.screenshot(overview);
      await browser.evaluate('document.getElementById("next").click()');await browser.wait('document.getElementById("page-status").textContent.startsWith("101")',"next bounded page");
      await browser.evaluate('document.getElementById("search").value="member09997";document.getElementById("search").dispatchEvent(new Event("input",{bubbles:true}))');
      await browser.wait('document.querySelectorAll("[role=treeitem]").length===1',"search beyond current page");
      await browser.evaluate('document.querySelector("[role=treeitem]").click()');await browser.wait('document.getElementById("detail-title").textContent==="member09997"',"member detail");
      await browser.evaluate('document.getElementById("search").value="getName";document.getElementById("search").dispatchEvent(new Event("input",{bubbles:true}))');await browser.wait('document.querySelector("[role=treeitem]")?.textContent.includes("getName")',"method search");
      await browser.evaluate('document.querySelector("[role=treeitem]").click()');await browser.wait('document.querySelector(".cm-content")?.textContent.includes("Bubbles")',"real method editor");
      assert.equal(await browser.evaluate('document.getElementById("editor-region").hidden'),false);
      const insertion=binding.snapshot().start;
      await browser.evaluate('document.querySelector(".cm-content").focus()');await browser.key("Home",36,2);
      await Promise.all([..."// edited in class workspace"].map(character=>browser.type(character)));
      await browser.key("Enter",13);
      await browser.evaluate('document.getElementById("overview").click()');
      const expected=source.slice(0,insertion)+"// edited in class workspace\r\n"+source.slice(insertion);
      for(let attempt=0;attempt<100&&document.getText()!==expected;attempt++)await new Promise(resolve=>setTimeout(resolve,50));
      assert.equal(document.getText(),expected,"CodeMirror edits must reach the exact native source range once");
      assert.equal(document.isDirty,true,"CodeMirror edits must dirty the actual source document");
      assert.equal(await browser.evaluate('document.getElementById("notice").hidden'),true,"normal edits must not show conflict notices");
      await browser.wait('document.getElementById("detail-title").textContent==="Class overview"',"navigation drains pending source edits");
      await browser.evaluate('document.querySelector("[role=treeitem]").click()');await browser.wait('document.querySelector(".cm-content")?.textContent.includes("edited in class workspace")',"persisted native method after return");
      const method=path.join(captures,"class-workspace-method.png");await browser.screenshot(method);
      await saved();assert.equal(document.isDirty,false);assert.equal(fs.readFileSync(file,"utf8"),document.getText());
      for(const width of [760,480,360]){
        await browser.viewport(width);assert.equal(await browser.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,"shell fits "+width+"px");
        if(width<760){await browser.evaluate('document.getElementById("member-picker").click()');assert.equal(await browser.evaluate('document.getElementById("member-picker").getAttribute("aria-expanded")'),"true");await browser.key("Escape",27);if(await browser.evaluate('document.getElementById("member-picker").getAttribute("aria-expanded")==="true"'))await browser.key("Escape",27);assert.equal(await browser.evaluate('document.getElementById("member-picker").getAttribute("aria-expanded")'),"false");}
        await browser.screenshot(path.join(captures,"class-workspace-"+width+".png"));
      }
      await vscode.workspace.getConfiguration("window").update("zoomLevel",Math.log(2)/Math.log(1.2),vscode.ConfigurationTarget.Global);
      await new Promise(resolve=>setTimeout(resolve,400));await browser.viewport(360);
      assert.equal(await browser.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,"shell fits 360px at 200% zoom");
      await browser.screenshot(path.join(captures,"class-workspace-360-zoom200.png"));
      await vscode.workspace.getConfiguration("window").update("zoomLevel",0,vscode.ConfigurationTarget.Global);
      await browser.viewport(1000);await browser.evaluate('document.getElementById("overview").click()');await browser.wait('document.getElementById("detail-title").textContent==="Class overview"',"overview recovery");
      await browser.evaluate('document.getElementById("original").click()');assert.equal(selections.length,1);
      return {overview,method,bounded100:true,memberCount:10000,allMemberSearch:true,realDocumentEdit:true,exactSourceRange:true,save:true,responsive:[760,480,360],zoom200:true,noDatabase:true};
    });
    fs.writeFileSync(report,JSON.stringify({passed:true,...evidence},null,2));
  } catch(error) {fs.writeFileSync(report,JSON.stringify({passed:false,error:error.stack},null,2));throw error;}
  finally {if(document?.isDirty)await document.save();for(const item of owned.reverse())item.dispose();}
}
module.exports={run};
