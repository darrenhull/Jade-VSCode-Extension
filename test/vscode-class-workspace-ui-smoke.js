"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");
const { createClassWorkspaces } = require("../src/class-workspace");
const { registerClassWorkspaces } = require("../src/class-workspace-controller");
const {resolveJadeSource}=require("../src/active-jade-source");
const { withClassWorkspace } = require("./class-workspace-ui-capture.cjs");

async function run() {
  const workspace = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const report = path.resolve(workspace, "../host-report.json");
  const captures = process.env.JADE_CLASS_WORKSPACE_SCREENSHOTS;
  const artifact=process.env.JADE_CLASS_WORKSPACE_VSIX?{name:path.basename(process.env.JADE_CLASS_WORKSPACE_VSIX),sha256:require("node:crypto").createHash("sha256").update(fs.readFileSync(process.env.JADE_CLASS_WORKSPACE_VSIX)).digest("hex")}:undefined;
  const owned = [], messages = [], selections = [], memento = new Map(), warnings=[],keyDispatches=[],historyOperations=[],nativeHistoryEvents=[];
  let document, saved, binding, previousClipboard, viewId, currentView, allowInherited=false, removeMethod=false,rejectSave=false;
  const source = ["schemaDefinition", "Pets subschemaOf RootSchema partialDefinition;", "typeHeaders", "Fish subclassOf Object transient;", "typeDefinitions", "Fish completeDefinition", "(", "attributeDefinitions", "name: String[50];", "referenceDefinitions", "mate: Fish;", "jadeMethodDefinitions", "getName() : String;", ")", "typeSources", "Fish (", "jadeMethodSources", "getName", "{", "getName() : String;", "begin", ' return "Bubbles";', "end;", "}", ")"].join("\r\n");
  const file = path.join(workspace, "ClassWorkspaceFish.cls");
  fs.writeFileSync(file, source);
  const uri = vscode.Uri.file(file), row = { projectId: workspace, schema: "Pets", owner: "Fish", file: uri.toString() };
  const members = [{id:"name",name:"name",kind:"property",detail:"name: String[50];",owner:"Fish",file:uri.toString()}, {id:"getName",name:"getName",kind:"method",owner:"Fish",file:uri.toString()}, {id:"mate",name:"mate",kind:"reference",owner:"Fish",file:uri.toString()}, ...Array.from({length:9998},(_,index)=>({id:"generated"+index,name:"member"+String(index).padStart(5,"0"),kind:"property",detail:"String[50]",owner:"Fish",file:uri.toString()}))];
  const parentFile=path.join(workspace,"Parent.cls"),parentUri=vscode.Uri.file(parentFile).toString(),parentMethod="inheritedMethod() : String;\r\nbegin\r\n return \"Inherited\";\r\nend;";
  fs.writeFileSync(parentFile,"schemaDefinition\r\nPets subschemaOf RootSchema partialDefinition;\r\ntypeHeaders\r\nParent subclassOf Object transient;\r\ntypeDefinitions\r\nParent completeDefinition ( jadeMethodDefinitions inheritedMethod() : String; )\r\ntypeSources\r\nParent ( jadeMethodSources inheritedMethod {\r\n"+parentMethod+"\r\n} )");
  const inherited={id:"parent-method",name:"inheritedMethod",kind:"method",schema:"Pets",owner:"Parent",declaringClass:"Parent",file:parentUri,inherited:true,detail:parentMethod};
  try {
    const productApi=await vscode.extensions.getExtension("jade-local-tools.jade-native-runner-cpp-preview").activate();
    productApi.classView.previewController.dispose();
    // Use VS Code's supported renderer dialogs in this isolated test profile.
    await vscode.workspace.getConfiguration("window").update("dialogStyle","custom",vscode.ConfigurationTarget.Global);
    const context = { subscriptions:[], extensionUri: vscode.Uri.file(path.resolve(__dirname, "..")), workspaceState: { get: key => memento.get(key), update: async (key,value) => memento.set(key,value) } };
    const sourceCommands=new Set(["jadeNative.buildWorkspace","jadeNative.publishClass","jadeNative.runLocalTests"]);
    async function dispatchSourceAction(command,explicitUri,route){const source=await resolveJadeSource(vscode,explicitUri,{prepare:uri=>controller.prepareActiveSource(uri)});if(!source)throw Error("No original source was resolved for the private key dispatch proof.");keyDispatches.push({command,uri:source.uri.toString(),text:source.getText(),route});return{dispatched:true};}
    for(const command of sourceCommands)owned.push(vscode.commands.registerCommand(command.replace("jadeNative.","jade.test."),()=>dispatchSourceAction(command,undefined,"global")));
    const sourceVscode={...vscode,commands:{...vscode.commands,executeCommand(command,...args){return sourceCommands.has(command)?dispatchSourceAction(command,args[0],"canvas"):vscode.commands.executeCommand(command,...args);}}};
    const adapters = {
      async load(_row,state) {
        if(!fs.existsSync(file))throw Error("Workspace source file is not available. Restore the original file, then retry.");
        const available=members.filter(member=>!removeMethod||member.id!=="getName");if(allowInherited&&state.includeInherited)available.push(inherited);
        const matching=available.filter(member=>(state.kind==="all"||member.kind===state.kind)&&member.name.toLowerCase().includes(state.query.toLowerCase())), page=matching.slice(state.offset,state.offset+100);
        return {identity:{qualifiedName:"Pets::Fish",name:"Fish",schema:"Pets",projectName:"Workspace UI proof",file:uri.toString(),superclass:allowInherited?"Parent":"Object",lifetime:"Transient"},groups:[{label:"Properties",total:9999,items:page.filter(m=>m.kind==="property")},{label:"References",total:1,items:page.filter(m=>m.kind==="reference")},{label:"Methods",total:available.filter(m=>m.kind==="method").length,items:page.filter(m=>m.kind==="method")}],total:matching.length,offset:state.offset,hasMore:state.offset+100<matching.length,inheritedAvailable:allowInherited,inheritedReason:"No resolved inherited source is included in this fixture.",selected:available.find(m=>m.id===state.selectedId),overview:{counts:[{label:"Properties",count:9999},{label:"References",count:1},{label:"Methods",count:available.filter(m=>m.kind==="method").length}],...(allowInherited?{superclassIdentity:{name:"Parent",schema:"Pets",file:parentUri,projectId:workspace}}:{})}};
      },
      onOriginal: () => selections.push("original"), onInstances:()=>messages.push("instances"), onBack:()=>messages.push("back"),
      preview:async (_row,id)=>({text:[...members,inherited].find(member=>member.id===id)?.detail || ""}),
      onDeclaringClass:(_row,member)=>messages.push("declaring:"+member.owner),onSuperclass:(_row,base)=>messages.push("superclass:"+base.name),
    };
    function createController(){
      const shell=createClassWorkspaces({Uri:vscode.Uri,window:{showWarningMessage(...args){warnings.push(args[0]);return vscode.window.showWarningMessage(...args);}}},context,adapters),attach=shell.attach;
      shell.attach=session=>{document=session.document;
        for(const command of ["undo","redo"]){const native=session.services[command];session.services[command]=()=>{const operation={command};historyOperations.push(operation);operation.promise=Promise.resolve().then(()=>native());return operation.promise;};}
        const nativeSave=session.services.save;session.services.save=async()=>{if(rejectSave)throw Error("Private save rejection; edits retained.");return nativeSave();};saved=session.services.save;binding=session.binding;const view=attach(session);currentView=view;viewId=view.viewId;return view;};
      const model={resolveClass:async()=>({...row,name:"Fish",qualifiedName:"Pets::Fish"})};
      const controller=registerClassWorkspaces(sourceVscode,context,{model,shell});owned.push(controller);return controller;
    }
    owned.push(vscode.workspace.onDidChangeTextDocument(event=>{if(event.document.uri.toString()===uri.toString())nativeHistoryEvents.push({version:event.document.version,reason:event.reason,value:event.document.getText().match(/name: String\[(\d+)\]/)?.[1]});}));
    let controller=createController();await controller.open(row);
    const evidence=await withClassWorkspace(Number(process.env.JADE_CLASS_WORKSPACE_DEBUG_PORT),async browser=>{
      await browser.wait('document.getElementById("workspace").getAttribute("aria-busy")==="false"',"initial class snapshot");
      assert.equal(await browser.evaluate('document.querySelectorAll("[role=treeitem]").length'),100);
      assert.equal(await browser.evaluate('document.getElementById("class-name").textContent'),"Pets::Fish");
      assert.equal(await browser.evaluate('document.getElementById("inherited").disabled'),true);
      const overview=path.join(captures,"class-workspace-overview.png");await browser.screenshot(overview);
      async function canvasHistory(command){
        await browser.wait('document.querySelector(".cm-content")?.getAttribute("contenteditable")==="true"','editable canvas before native '+command);
        await browser.evaluate('document.querySelector(".cm-content").focus()');
        const count=historyOperations.length;
        await browser.key(command==="redo"?"y":"z",command==="redo"?89:90,2);
        for(let attempt=0;attempt<150&&historyOperations.length===count;attempt++)await new Promise(resolve=>setTimeout(resolve,20));
        assert.equal(historyOperations.length,count+1,"one canvas shortcut dispatches exactly one native history command");
        assert.equal(historyOperations[count].command,command);await historyOperations[count].promise;
      }
      async function verifySingleLineCRLF(id,declaration,multiline){
        await browser.evaluate('document.getElementById("search").value='+JSON.stringify(id)+';document.getElementById("search").dispatchEvent(new Event("input",{bubbles:true}))');
        await browser.wait('document.querySelector("[data-member-id='+id+']")',id+' declaration selected for CRLF proof');
        await browser.evaluate('document.querySelector("[data-member-id='+id+']").click()');
        await browser.wait('document.querySelector(".cm-content")?.getAttribute("contenteditable")==="true" && document.querySelector(".cm-content")?.textContent==='+JSON.stringify(declaration),'one-line '+id+' source canvas');
        assert.equal(binding.snapshot().lineEnding,"\r\n",'one-line fragment retains native CRLF metadata');
        await browser.evaluate('document.querySelector(".cm-content").focus()');
        if(multiline){await browser.key("a",65,2);await browser.type(multiline);}else{await browser.key("End",35,2);await browser.key("Enter",13);}
        await browser.evaluate('document.getElementById("overview").click()');
        const expected=source.replace(declaration,multiline?multiline.replace(/\r?\n/g,"\r\n"):declaration+"\r\n");
        for(let attempt=0;attempt<150&&document.getText()!==expected;attempt++)await new Promise(resolve=>setTimeout(resolve,20));
        assert.equal(document.getText(),expected,id+' multiline edit acknowledges with exact native CRLF bytes');
        try{await browser.wait('document.getElementById("detail-title").textContent==="Class overview"','multiline '+id+' navigation flush');}catch(error){throw Error(error.message+' '+JSON.stringify({binding:binding.snapshot(),state:currentView.state(),dom:await browser.evaluate('JSON.stringify({title:document.getElementById("detail-title").textContent,status:document.getElementById("editor-status").textContent,notice:document.getElementById("notice").textContent,draft:document.querySelector("#draft-recovery pre")?.textContent,content:document.querySelector(".cm-content")?.textContent})')}));}
        assert.equal(await browser.evaluate('document.getElementById("notice").hidden'),true,'multiline '+id+' must not produce conflict notice');
        assert.equal(await browser.evaluate('document.getElementById("draft-recovery").hidden'),true,'multiline '+id+' must be acknowledged without unapplied draft');
        await saved();assert.equal(document.isDirty,false);assert.equal(fs.readFileSync(file,"utf8"),expected);assert.equal(/(?<!\r)\n/.test(fs.readFileSync(file,"utf8")),false,'native source must contain no bare LF');
        // Reset only this disposable fixture after proving exact native saved bytes.
        // Native Undo/Redo is exercised independently below, not used as setup.
        const reset=new vscode.WorkspaceEdit();reset.replace(uri,new vscode.Range(document.positionAt(0),document.positionAt(document.getText().length)),source);
        assert.equal(await vscode.workspace.applyEdit(reset),true);assert.equal(document.getText(),source,'native fixture reset restores '+id+' baseline');await saved();assert.equal(fs.readFileSync(file,"utf8"),source);
      }
      if(process.env.JADE_CLASS_WORKSPACE_CRLF_ONLY==='1'){
        await verifySingleLineCRLF("name","name: String[50];");
        await verifySingleLineCRLF("mate","mate: Fish;","mate:\n    Fish;");
        return {focusedCRLF:true,oneLineCRLFPropertyEnter:true,oneLineCRLFReferenceMultilinePaste:true,multilineDeclarationAcknowledged:true,multilineDeclarationFlushSave:true,nativeCRLFBytes:true,noDatabase:true};
      }
      await browser.evaluate('document.querySelector("[data-member-id=name]").click()');await browser.wait('!document.getElementById("editor-region").hidden && document.querySelector(".cm-content")?.getAttribute("contenteditable")==="true" && document.querySelector(".cm-content")?.textContent==="name: String[50];"',"property native source canvas");
      assert.equal(binding.snapshot().kind,"property");await browser.evaluate('document.querySelector(".cm-content").focus()');await browser.key("a",65,2);await browser.type("name: String[60];");
      rejectSave=true;await browser.wait('!document.getElementById("save-document").disabled',"save after pending property edit");await browser.evaluate('document.getElementById("save-document").click()');await browser.wait('document.getElementById("save-feedback").textContent.includes("Save failed")',"save error feedback retains property edits");assert.equal(document.getText(),source.replace("name: String[50];","name: String[60];"));assert.equal(document.isDirty,true);assert.equal(fs.readFileSync(file,"utf8"),source);
      rejectSave=false;await browser.evaluate('document.getElementById("save-document").click()');await browser.wait('document.getElementById("save-feedback").textContent.includes("Saved") && document.getElementById("save-document").disabled',"whole-file property save");assert.equal(document.isDirty,false);assert.equal(fs.readFileSync(file,"utf8"),document.getText());
      await browser.screenshot(path.join(captures,"class-workspace-editable-property.png"));
      const originalPropertyEdit=binding.edit.bind(binding);binding.edit=async value=>{binding.edit=originalPropertyEdit;await new Promise(resolve=>setTimeout(resolve,150));return originalPropertyEdit(value);};
      await browser.evaluate('document.querySelector(".cm-content").focus()');await browser.key("a",65,2);await browser.type("name: String[70];");await browser.key("s",83,2);
      for(let attempt=0;attempt<200&&(!document.getText().includes("String[70]")||document.isDirty||!fs.readFileSync(file,"utf8").includes("String[70]"));attempt++)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(document.getText().includes("String[70]"));assert.equal(document.isDirty,false,"Ctrl+S waits for pending property edits");assert.equal(fs.readFileSync(file,"utf8"),document.getText());
      await browser.evaluate('document.querySelector(".cm-content").focus()');await browser.key("a",65,2);await browser.type("name: String[60];");await browser.wait('!document.getElementById("save-document").disabled',"resetting property save checkpoint");await browser.evaluate('document.getElementById("save-document").click()');await browser.wait('document.getElementById("save-feedback").textContent.includes("Saved")',"property saved after Ctrl+S proof");
      const beforeNativeUndo=document.getText(),allowedHistory=new Set([source,source.replace("String[50]","String[60]"),source.replace("String[50]","String[70]")]),nativeUndoStates=[];
      const undoStart=historyOperations.length;
      for(let step=0;step<8&&document.getText()===beforeNativeUndo;step++){await canvasHistory("undo");await new Promise(resolve=>setImmediate(resolve));assert.ok(allowedHistory.has(document.getText()),"native history preserves exact prior source bytes");nativeUndoStates.push(document.getText());}
      const afterNativeUndo=document.getText();assert.notEqual(afterNativeUndo,beforeNativeUndo,"native Undo must change the actual source document "+JSON.stringify({history:nativeHistoryEvents,operations:historyOperations.map(value=>value.command),activeTab:vscode.window.tabGroups.activeTabGroup.activeTab?.label,inputType:vscode.window.tabGroups.activeTabGroup.activeTab?.input?.constructor?.name}));assert.ok(allowedHistory.has(afterNativeUndo),"Undo must restore an actual prior source state without adjacent edits");nativeUndoStates.push(afterNativeUndo);
      try{await browser.wait('document.querySelector(".cm-content")?.textContent==='+JSON.stringify(binding.snapshot().text),'native Undo reflected in source canvas');}catch(error){throw Error(error.message+' '+JSON.stringify({binding:binding.snapshot(),native:document.getText(),viewState:currentView.state(),dom:await browser.evaluate('JSON.stringify({content:document.querySelector(".cm-content")?.textContent,editable:document.querySelector(".cm-content")?.getAttribute("contenteditable"),status:document.getElementById("editor-status").textContent,notice:document.getElementById("notice").textContent,draft:document.querySelector("#draft-recovery pre")?.textContent})')}));}
      const undoCount=historyOperations.length-undoStart;for(let step=0;step<undoCount;step++){await canvasHistory("redo");await new Promise(resolve=>setImmediate(resolve));assert.ok(allowedHistory.has(document.getText()),"native Redo preserves actual prior source states");}for(let attempt=0;attempt<150&&document.getText()!==beforeNativeUndo;attempt++)await new Promise(resolve=>setTimeout(resolve,20));assert.equal(document.getText(),beforeNativeUndo,"native Redo must reproduce exact pre-Undo source bytes");
      for(let step=0;step<8&&document.getText()!==source;step++){
        await canvasHistory("undo");await new Promise(resolve=>setImmediate(resolve));
        assert.ok(allowedHistory.has(document.getText()),"native Undo must preserve all adjacent source bytes");nativeUndoStates.push(document.getText());
      }
      assert.equal(document.getText(),source,"bounded native Undo reaches the original source baseline");
      await browser.wait('!document.getElementById("save-document").disabled',"saving undone property source");await browser.evaluate('document.getElementById("save-document").click()');await browser.wait('document.getElementById("save-feedback").textContent.includes("Saved")',"property baseline saved");assert.equal(fs.readFileSync(file,"utf8"),source);
      await browser.evaluate('document.getElementById("search").value="mate";document.getElementById("search").dispatchEvent(new Event("input",{bubbles:true}))');await browser.wait('document.querySelector("[data-member-id=mate]")',"reference declaration");await browser.evaluate('document.querySelector("[data-member-id=mate]").click()');await browser.wait('document.querySelector(".cm-content")?.getAttribute("contenteditable")==="true" && document.querySelector(".cm-content")?.textContent==="mate: Fish;"',"reference native source canvas");assert.equal(binding.snapshot().kind,"reference");await browser.evaluate('document.querySelector(".cm-content").focus()');await browser.key("a",65,2);await browser.type("mate: Fish readonly;");await browser.wait('!document.getElementById("save-document").disabled',"reference save action");await browser.evaluate('document.getElementById("save-document").click()');await browser.wait('document.getElementById("save-feedback").textContent.includes("Saved")',"reference saved");assert.equal(fs.readFileSync(file,"utf8"),source.replace("mate: Fish;","mate: Fish readonly;"));await browser.screenshot(path.join(captures,"class-workspace-editable-reference.png"));
      await canvasHistory("undo");for(let attempt=0;attempt<100&&document.getText()!==source;attempt++)await new Promise(resolve=>setTimeout(resolve,20));await browser.wait('!document.getElementById("save-document").disabled',"reference undo save");await browser.evaluate('document.getElementById("save-document").click()');await browser.wait('document.getElementById("save-feedback").textContent.includes("Saved")',"reference baseline saved");assert.equal(document.getText(),source);
      await browser.evaluate('document.getElementById("search").value="";document.getElementById("search").dispatchEvent(new Event("input",{bubbles:true}))');await browser.wait('document.querySelectorAll("[role=treeitem]").length===100',"member catalogue restored");
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
      const beforeGap=document.getText();
      await vscode.workspace.getConfiguration("files").update("autoSaveDelay",100,vscode.ConfigurationTarget.Global);
      await vscode.workspace.getConfiguration("files").update("autoSave","afterDelay",vscode.ConfigurationTarget.Global);
      await browser.evaluate('document.querySelector(".cm-content").focus()');await browser.key("End",35,2);await browser.type('"');
      for(let attempt=0;attempt<200&&(document.getText()===beforeGap||document.isDirty);attempt++)await new Promise(resolve=>setTimeout(resolve,20));
      assert.notEqual(document.getText(),beforeGap);assert.equal(document.isDirty,false,"native Auto Save writes the temporarily incomplete source");assert.equal(binding.snapshot().available,true);
      removeMethod=true;await controller.refresh();
      await browser.wait('document.getElementById("workspace").getAttribute("aria-busy")==="false"',"auto-saved incomplete parse refresh");assert.equal(currentView.state().selectedId,"getName");assert.equal(await browser.evaluate('document.getElementById("detail-title").textContent'),"getName");assert.equal(await browser.evaluate('document.getElementById("editor-region").hidden'),false);
      await browser.evaluate('document.querySelector(".cm-content").focus()');await browser.key("End",35,2);await browser.key("Backspace",8);
      for(let attempt=0;attempt<200&&(document.getText()!==beforeGap||document.isDirty);attempt++)await new Promise(resolve=>setTimeout(resolve,20));assert.equal(document.getText(),beforeGap);assert.equal(document.isDirty,false);
      removeMethod=false;await controller.refresh();assert.equal(currentView.state().selectedId,"getName");
      await vscode.workspace.getConfiguration("files").update("autoSave","off",vscode.ConfigurationTarget.Global);
      for(const [theme,kind,filename] of [["Default Light Modern","vscode-light","class-workspace-light.png"],["Default High Contrast","vscode-high-contrast","class-workspace-high-contrast.png"]]){
        await vscode.workspace.getConfiguration("workbench").update("colorTheme",theme,vscode.ConfigurationTarget.Global);await browser.wait('document.body.dataset.vscodeThemeKind==='+JSON.stringify(kind),"theme "+kind);assert.equal(await browser.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true);await browser.screenshot(path.join(captures,filename));
      }
      await vscode.workspace.getConfiguration("workbench").update("colorTheme","Default Dark Modern",vscode.ConfigurationTarget.Global);await browser.wait('document.body.dataset.vscodeThemeKind==="vscode-dark"',"dark theme recovery");
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
      await browser.evaluate('document.getElementById("original").click()');for(let attempt=0;attempt<100&&!selections.length;attempt++)await new Promise(resolve=>setTimeout(resolve,20));assert.equal(selections.length,1);
      return {overview,method,bounded100:true,memberCount:10001,allMemberSearch:true,realDocumentEdit:true,exactSourceRange:true,editableProperty:true,editableReference:true,propertyNativeUndoRedo:true,nativeUndoStates:nativeUndoStates.map(value=>value.match(/String\[(\d+)\]/)?.[1]),nativeUndoRedoExactBytes:true,saveButton:true,saveFailureRetainsEdits:true,wholeFileNativeSave:true,save:true,themes:["light","dark","high-contrast"],responsive:[760,480,360],zoom200:true,noDatabase:true};
    });
    if(process.env.JADE_CLASS_WORKSPACE_CRLF_ONLY==='1'){fs.writeFileSync(report,JSON.stringify({passed:true,artifact,...evidence},null,2));return;}
    const port=Number(process.env.JADE_CLASS_WORKSPACE_DEBUG_PORT),beforeRecovery=document.getText();
    async function selectEditable(browser){
      await browser.evaluate('document.querySelector("[data-member-id=getName]").click()');
      await browser.wait('!document.getElementById("editor-region").hidden && document.querySelector(".cm-content")?.getAttribute("contenteditable")==="true"',"selected native editable method");
    }
    async function rejectDraft(browser,marker){
      await selectEditable(browser);
      // Deliberate private-fixture fault AFTER the durable capacity reservation.
      // This exercises the real controller's checkpoint-before-native-edit path.
      const nativeEdit=binding.edit.bind(binding);
      binding.edit=async()=>{binding.edit=nativeEdit;throw Error("Injected native edit rejection for recovery verification.");};
      await browser.evaluate('document.querySelector(".cm-content").focus()');await browser.key("Home",36,2);await browser.type(marker);
      await browser.wait('!document.getElementById("draft-recovery").hidden',"durable rejected draft card");
      assert.match(await browser.evaluate('document.getElementById("editor-status").textContent'),/^Unapplied method draft/);
      assert.equal(document.getText(),beforeRecovery,"rejected edits must leave the clean native document intact");
      assert.equal(document.isDirty,false);
      return browser.evaluate('document.querySelector("#draft-recovery pre").textContent');
    }
    async function confirm(browser,label){
      const expression='[...document.querySelectorAll(".monaco-dialog-box .monaco-button")].find(button=>button.textContent.trim()==='+JSON.stringify(label)+')';
      for(let attempt=0;attempt<100;attempt++){
        if(await browser.windowEvaluate('Boolean('+expression+')')){await browser.windowEvaluate('('+expression+').click()');return;}
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      const diagnostic=await browser.windowEvaluate('JSON.stringify({dialogs:[...document.querySelectorAll("[role=dialog],[role=alertdialog],.monaco-dialog-box")].map(item=>item.textContent),buttons:[...document.querySelectorAll(".monaco-button,[role=button]")].filter(item=>/draft|restore|cancel/i.test(item.textContent)).map(item=>({text:item.textContent,html:item.outerHTML.slice(0,400)}))})');
      await browser.screenshot(path.join(captures,"class-workspace-confirmation-debug.png"));
      throw Error("The native confirmation was not shown: "+label+". "+diagnostic+". Server "+JSON.stringify({warnings,state:currentView.state(),document:document.uri.toString(),file:uri.toString(),binding:binding.snapshot()?.member}));
    }
    const recoveredText=await withClassWorkspace(port,async browser=>{
      const draft=await rejectDraft(browser,"// recovered checkpoint ");
      assert.ok(draft.includes("recovered checkpoint"));await browser.screenshot(path.join(captures,"class-workspace-recovery.png"));return draft;
    });
    const classTabs=vscode.window.tabGroups.all.flatMap(group=>group.tabs).filter(tab=>tab.input instanceof vscode.TabInputCustom&&tab.input.viewType==="jade.classWorkspace");
    assert.equal(await vscode.window.tabGroups.close(classTabs),true,"clean source custom editor closes without unsaved prompt");
    controller.dispose();controller=createController();await controller.open(row);
    await withClassWorkspace(port,async browser=>{
      await browser.wait('!document.getElementById("draft-recovery").hidden',"recovery survives controller and webview recreation while original source was clean");
      assert.equal(await browser.evaluate('document.querySelector("#draft-recovery pre").textContent'),recoveredText);
      previousClipboard=await vscode.env.clipboard.readText();
      await browser.evaluate('document.querySelectorAll(".recovery-actions button")[0].click()');
      for(let attempt=0;attempt<100&&(await vscode.env.clipboard.readText())!==recoveredText;attempt++)await new Promise(resolve=>setTimeout(resolve,50));
      assert.equal(await vscode.env.clipboard.readText(),recoveredText,"Copy must copy the durable source draft");
      await browser.wait('!document.getElementById("editor-region").hidden',"reopened recovery method canvas");
      assert.equal(await browser.evaluate('document.querySelector(".cm-content").getAttribute("contenteditable")'),"false","reopened unapplied recovery must protect the native baseline");
      const originalRecovery=await browser.evaluate('document.querySelector("#draft-recovery pre").textContent'),originalNative=document.getText();
      await browser.evaluate('document.querySelector(".cm-content").focus()');await browser.key("Home",36,2);await browser.type("SHOULD_NOT_REPLACE_RECOVERY");
      assert.equal(document.getText(),originalNative);assert.equal(await browser.evaluate('document.querySelector("#draft-recovery pre").textContent'),originalRecovery);
      assert.equal(await browser.evaluate('document.getElementById("restore-draft").disabled'),false);
      await browser.evaluate('document.getElementById("restore-draft").click()');await confirm(browser,"Restore draft");
      await browser.wait('document.getElementById("draft-recovery").hidden',"explicit restore acknowledges the durable draft");
      assert.match(await browser.evaluate('document.getElementById("editor-status").textContent'),/^Editing the backing source document/);
      assert.ok(document.getText().includes("recovered checkpoint"));assert.equal(document.isDirty,true);assert.equal(await browser.evaluate('document.querySelector(".cm-content").getAttribute("contenteditable")'),"true");
      await vscode.commands.executeCommand("undo");
      for(let attempt=0;attempt<100&&document.getText()!==beforeRecovery;attempt++)await new Promise(resolve=>setTimeout(resolve,50));
      assert.equal(document.getText(),beforeRecovery,"Restore uses native source undo history");await saved();
      await rejectDraft(browser,"// discard checkpoint ");
      await browser.evaluate('document.querySelectorAll(".recovery-actions button")[2].click()');await confirm(browser,"Discard draft");
      await browser.wait('document.getElementById("draft-recovery").hidden',"explicit discard removes the durable checkpoint");
      assert.match(await browser.evaluate('document.getElementById("editor-status").textContent'),/^Editing the backing source document/);
      assert.equal(document.getText(),beforeRecovery);assert.equal(document.isDirty,false);
      assert.equal(await browser.evaluate('document.querySelector(".cm-content").textContent.includes("discard checkpoint")'),false,"discard clears the rejected browser projection");
      await browser.evaluate('document.getElementById("overview").click()');await browser.wait('document.getElementById("detail-title").textContent==="Class overview"',"navigation works after explicit recovery resolution");
    },{predicate:'Boolean(document.getElementById("workspace")?.dataset.viewId==='+JSON.stringify(viewId)+')'});
    allowInherited=true;await controller.refresh();
    await withClassWorkspace(port,async browser=>{
      await browser.wait('!document.getElementById("inherited").disabled',"resolved inherited ownership");
      await browser.evaluate('document.getElementById("inherited").checked=true;document.getElementById("inherited").dispatchEvent(new Event("change",{bubbles:true}));document.getElementById("search").value="inheritedMethod";document.getElementById("search").dispatchEvent(new Event("input",{bubbles:true}))');
      await browser.wait('document.querySelector("[data-member-id=parent-method]")',"resolved inherited method");await browser.evaluate('document.querySelector("[data-member-id=parent-method]").click()');
      await browser.wait('!document.getElementById("open-declaring").hidden && document.querySelector(".cm-content").textContent.includes("Inherited")',"read-only inherited body");
      assert.equal(await browser.evaluate('document.querySelector(".cm-content").getAttribute("contenteditable")'),"false");assert.match(await browser.evaluate('document.getElementById("detail-origin").textContent'),/Parent/);
      await browser.screenshot(path.join(captures,"class-workspace-inherited.png"));
      await browser.evaluate('document.getElementById("open-declaring").click()');for(let attempt=0;attempt<100&&!messages.includes("declaring:Parent");attempt++)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(messages.includes("declaring:Parent"));
      await browser.evaluate('document.getElementById("search").value="getName";document.getElementById("search").dispatchEvent(new Event("input",{bubbles:true}))');await browser.wait('document.querySelector("[data-member-id=getName]")',"return to declared method");await selectEditable(browser);
      const cleanSource=document.getText(),removedSource=source.slice(0,source.indexOf("jadeMethodDefinitions"))+")\r\ntypeSources\r\n";
      const replace=async value=>{const edit=new vscode.WorkspaceEdit();edit.replace(document.uri,new vscode.Range(document.positionAt(0),document.positionAt(document.getText().length)),value);await vscode.workspace.applyEdit(edit);await document.save();};
      await replace(removedSource);removeMethod=true;await controller.refresh();await browser.wait('document.getElementById("detail-title").textContent==="Class overview"',"confirmed clean member removal");
      assert.match(await browser.evaluate('document.getElementById("notice").textContent'),/no longer available/);await browser.screenshot(path.join(captures,"class-workspace-removed-member.png"));
      await replace(cleanSource);removeMethod=false;allowInherited=false;await controller.refresh();
      const missing=file+".missing";fs.renameSync(file,missing);
      try{await controller.refresh();await browser.wait('!document.getElementById("failure").hidden',"missing source failure");assert.match(await browser.evaluate('document.getElementById("failure-message").textContent'),/source file is not available/);await browser.screenshot(path.join(captures,"class-workspace-missing-source.png"));}
      finally{fs.renameSync(missing,file);await controller.refresh();}
    },{predicate:'Boolean(document.getElementById("workspace")?.dataset.viewId==='+JSON.stringify(viewId)+')'});
    await withClassWorkspace(port,async browser=>{
      await selectEditable(browser);
      assert.equal(document.uri.toString(),uri.toString());
      assert.deepEqual(keyDispatches,[],"viewing, editing and navigation must not automatically build, publish or run tests");
      async function assertKey(command,modifiers,route){const before=keyDispatches.length;await browser.key("F5",116,modifiers);for(let attempt=0;attempt<200&&keyDispatches.length===before;attempt++)await new Promise(resolve=>setTimeout(resolve,20));await new Promise(resolve=>setTimeout(resolve,150));assert.equal(keyDispatches.length,before+1,"one dispatch per actual F5 combination");const result=keyDispatches.at(-1);assert.equal(result.command,command);assert.equal(result.uri,uri.toString(),"key actions must use the current backing document");if(route)assert.equal(result.route,route);return result;}
      await browser.evaluate('document.querySelector(".cm-content").focus()');await browser.key("Home",36,2);await browser.type("// queued before F5 ");
      assert.ok((await assertKey("jadeNative.buildWorkspace",0)).text.includes("queued before F5"),"F5 must await pending source edits");
      await assertKey("jadeNative.publishClass",8);await assertKey("jadeNative.runLocalTests",2);
      await browser.evaluate('document.getElementById("overview").click()');await browser.wait('document.getElementById("detail-title").textContent==="Class overview"',"overview key dispatch context");
      await assertKey("jadeNative.buildWorkspace",0,"global");await assertKey("jadeNative.publishClass",8,"global");await assertKey("jadeNative.runLocalTests",2,"global");
      await saved();
      // Real Notebook rendering, controlled preparation failure: no native DB execution.
      const originalRequest=productApi.nativeTests.request;let notebook;
      try{
        await vscode.workspace.getConfiguration("jadeNative").update("installPath","C:/Jade2025",vscode.ConfigurationTarget.Workspace);
        productApi.nativeTests.request=function(command,body,output){
          if(command!=="workspace.run")return originalRequest.call(this,command,body,output);
          return {id:6023,promise:Promise.resolve({code:6023,passed:false,report:{native_project:true,compiled:false,executed:false,error:"Native schema load failed (exit 6023): Unknown type in saved workspace source.",output:"Compile Error 6023 - Unknown type",diagnostics:[{source:path.join(workspace,"ExplorerDemoPet.cls"),line:13,column:12,length:5,compiler_error:6023,message:"Unknown type",schema:"Pets"}]}})};
        };
        notebook=await vscode.commands.executeCommand("jadeNative.newWorkspace");
        const metadata=new vscode.WorkspaceEdit();metadata.set(notebook.uri,[vscode.NotebookEdit.updateNotebookMetadata({schema:"Pets"})]);assert.equal(await vscode.workspace.applyEdit(metadata),true);
        const cell=notebook.cellAt(1);await productApi.workspaces.controller.executeHandler([cell],notebook,productApi.workspaces.controller);
        const output=cell.outputs.flatMap(item=>item.items.map(value=>{const text=Buffer.from(value.data).toString("utf8");return value.mime==="application/vnd.code.notebook.error"?JSON.parse(text).message:text;})).join("\n");
        assert.match(output,/Workspace preparation failed/);assert.match(output,/Scratch code was not executed/);assert.match(output,/6023/);
        assert.ok(output.includes(path.join(workspace,"ExplorerDemoPet.cls")+":13:12"),"preparation diagnostics must display the native source path, line and column");
        await new Promise(resolve=>setTimeout(resolve,700));await browser.screenshot(path.join(captures,"scratch-pad-preparation-error.png"));
        evidence.scratchPadPreparationErrorUi={realNotebook:true,controlled6023Response:true,nativeDatabaseExecuted:false,screenshot:path.join(captures,"scratch-pad-preparation-error.png")};
      }finally{
        productApi.nativeTests.request=originalRequest;
        if(notebook&&!notebook.isClosed){await vscode.window.showNotebookDocument(notebook);await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");}
      }
    },{predicate:'Boolean(document.getElementById("workspace")?.dataset.viewId==='+JSON.stringify(viewId)+')'});
    fs.writeFileSync(report,JSON.stringify({passed:true,artifact,...evidence,autoSavedIncompleteMethod:true,repairedSelectionRetained:true,durableRecovery:true,cleanSourceRecoveryReload:true,recoveryCopy:true,confirmedRestore:true,restoreNativeUndo:true,confirmedDiscard:true,reopenedDraftProtected:true,unappliedDraftCaption:true,recoveryCaptionReset:true,inheritedReadOnly:true,declaringClassAction:true,cleanRemovedMember:true,missingSourceRecovery:true,currentFileOnly:true,sourceKeyDispatch:{count:keyDispatches.length,exactlyOnce:true,actualBackingUri:true,pendingEditsFlushed:true,overviewGlobalBindings:true,nativeCompilationExecuted:false}},null,2));
  } catch(error) {fs.writeFileSync(report,JSON.stringify({passed:false,error:error.stack},null,2));throw error;}
  finally {if(previousClipboard!==undefined)await vscode.env.clipboard.writeText(previousClipboard);if(document?.isDirty)await document.save();for(const item of owned.reverse())item.dispose();}
}
module.exports={run};
