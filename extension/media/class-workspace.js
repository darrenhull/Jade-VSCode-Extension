(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.jadeClassWorkspace = api; api.mount(root.document, root.acquireVsCodeApi(), root); }
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  const ORDER = ["Properties", "References", "Methods", "Type methods", "Constants", "Collection keys", "Inheritance"];
  function visibleGroups(groups) {
    let remaining = 100;
    return [...groups].sort((a,b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label)).map(group => { const items = (group.items || []).slice(0,remaining); remaining -= items.length; return {...group,items}; }).filter(group => group.items.length);
  }
  function ownsSearchShortcut(target) { return !target?.isContentEditable && !["INPUT","TEXTAREA","SELECT"].includes(target?.tagName) && !target?.closest?.(".cm-editor,[contenteditable='true']"); }
  function displayValue(value) { return value === undefined || value === null || value === "" ? "Not available" : Array.isArray(value) ? value.join(", ") : String(value); }
  function sourcePath(value) { const text=String(value || "");if(!text.startsWith("file:"))return text;try{return decodeURIComponent(new URL(text).pathname).replace(/^\/(?=[A-Za-z]:)/,"");}catch{return text;} }
  function sourceLabel(identity = {}) {if(identity.sourceLabel)return identity.sourceLabel;const file=sourcePath(identity.file).replace(/\\/g,"/"),project=sourcePath(identity.projectRoot || identity.projectId).replace(/\\/g,"/").replace(/\/+$/,"");if(project&&file.toLowerCase().startsWith(project.toLowerCase()+"/"))return file.slice(project.length+1);return file.split(/[\\/]/).at(-1) || "Source unavailable";}
  function nextIndex(index, change, count) { return count ? (index + change + count) % count : -1; }
  function mount(document, vscode, window) {
    const byId=id=>document.getElementById(id), send=value=>{if(value.command==="editorConflict")showUnappliedDraft();return vscode.postMessage(value);};
    let snapshot,revision=0,searchTimer,layoutTimer,editor,selectedId="",pickerOpen=false,focusIndex=0,restoredScroll=false,pendingQuery,unappliedDraft=false;
    const initial=vscode.getState() || {};
    let recoveryDraft;
    const recovery=document.createElement("section");recovery.id="draft-recovery";recovery.className="recovery-card";recovery.hidden=true;recovery.setAttribute("aria-labelledby","recovery-title");
    const recoveryTitle=document.createElement("h3");recoveryTitle.id="recovery-title";recoveryTitle.textContent="A method draft is available to recover";
    const recoveryContext=document.createElement("p");recoveryContext.id="recovery-context";
    const recoveryExplanation=document.createElement("p");recoveryExplanation.textContent="These edits were checkpointed before a source update could finish. Review them against the original source. Saving and undo still belong to the original document.";
    const recoveryPreview=document.createElement("details"),recoverySummary=document.createElement("summary"),recoveryCode=document.createElement("pre");recoverySummary.textContent="Review recovered draft";recoveryPreview.append(recoverySummary,recoveryCode);
    const recoveryActions=document.createElement("div");recoveryActions.className="recovery-actions";
    const copyDraft=document.createElement("button");copyDraft.textContent="Copy draft";copyDraft.addEventListener("click",()=>send({command:"copyDraft"}));
    const restoreDraft=document.createElement("button");restoreDraft.id="restore-draft";restoreDraft.textContent="Restore into source…";restoreDraft.addEventListener("click",()=>send({command:"restoreDraft"}));
    const discardDraft=document.createElement("button");discardDraft.textContent="Discard recovery…";discardDraft.addEventListener("click",()=>send({command:"discardDraft"}));
    recoveryActions.append(copyDraft,restoreDraft,discardDraft);recovery.append(recoveryTitle,recoveryContext,recoveryExplanation,recoveryPreview,recoveryActions);byId("canvas").prepend(recovery);
    function updateRecovery(draft){recoveryDraft=draft;recovery.hidden=!draft;if(!draft)return;const identity=draft.identity || draft;recoveryContext.textContent=[identity.schema,identity.owner,identity.member].filter(Boolean).join("::")+(draft.modifiedAt?" · "+new Date(draft.modifiedAt).toLocaleString():"");recoveryCode.textContent=draft.text || "";const member=(snapshot?.selected?.id===selectedId?snapshot.selected:undefined) || visibleGroups(snapshot?.groups || []).flatMap(group=>group.items).find(item=>item.id===selectedId);restoreDraft.disabled=!member||!["method","typeMethod"].includes(member.kind)||member.name!==identity.member||(member.owner || snapshot?.identity?.name)!==identity.owner||member.system;restoreDraft.title=restoreDraft.disabled?"Select this method in its declaring source document before restoring.":"Review the draft and confirm before replacing the selected method.";}
    const declaringButton=document.createElement("button");declaringButton.id="open-declaring";declaringButton.textContent="Open declaring class ↗";declaringButton.hidden=true;byId("editor-region").append(declaringButton);declaringButton.addEventListener("click",()=>send({command:"openDeclaring"}));
    function text(id,value) { byId(id).textContent=value; }
    function node(tag,value,className) { const item=document.createElement(tag); if(value!==undefined)item.textContent=value; if(className)item.className=className; return item; }
    function remember() { const rail=byId("member-tree"); vscode.setState({ ...snapshot?.state, scrollTop:rail.scrollTop }); }
    function layout() { clearTimeout(layoutTimer); layoutTimer=setTimeout(()=>{ const railWidth=Number(byId("workspace").style.getPropertyValue("--rail-width").replace("px","")) || snapshot?.state?.railWidth || 280;send({command:"layout",railWidth,scrollTop:byId("member-tree").scrollTop});remember();},150); }
    function notice(message) {text("notice",message);byId("notice").hidden=!message;}
    function showUnappliedDraft(){unappliedDraft=true;text("editor-status","Unapplied method draft · This draft has not replaced the backing source document. Review the recovery actions before changing the source.");}
    function showSourceStatus(native){if(unappliedDraft){showUnappliedDraft();return;}if(native?.reason){text("editor-status",native.reason);return;}const file=native?.uri || snapshot?.document?.uri || snapshot?.identity?.file;text("editor-status","Editing the backing source document · "+sourceLabel({...snapshot?.identity,file}));byId("editor-status").title=sourcePath(file);}
    function closePicker() { pickerOpen=false;byId("member-rail").classList.remove("picker-open");byId("member-picker").setAttribute("aria-expanded","false"); }
    async function select(id) {try{await editor?.flush?.();send({command:"select",id});closePicker();}catch(error){notice(error.message || "Finish or resolve the current edit before changing members.");}}
    function renderOverview() {
      const content=byId("overview-content");content.replaceChildren();
      const lead=node("p",snapshot.overview?.description || "Explore this class, inspect its members, or open its original source. Local saving, building and publishing are separate actions.","overview-lead");content.append(lead);
      const tiles=node("div",undefined,"overview-tiles");
      for(const group of snapshot.overview?.counts || visibleGroups(snapshot.groups || [])) { const count=group.count ?? group.total ?? group.items?.length; if(!count)continue;const tile=node("button",undefined,"overview-tile");tile.append(node("strong",String(count)),node("span",group.label));tile.addEventListener("click",()=>{byId("kind").value=({Properties:"property",References:"reference",Methods:"method","Type methods":"typeMethod",Constants:"constant","Collection keys":"key",Inheritance:"base"})[group.label];filters();byId("search").focus();});tiles.append(tile); }
      content.append(tiles);
      if(snapshot.identity?.superclass){const ancestry=node("div",undefined,"superclass-navigation"),open=node("button","Open superclass ↗");open.disabled=!snapshot.overview?.superclassIdentity;open.addEventListener("click",()=>send({command:"superclass"}));ancestry.append(open);if(!snapshot.overview?.superclassIdentity)ancestry.append(node("p",snapshot.overview?.superclassReason || "Superclass source is not available in this workspace.","hint"));content.append(ancestry);}
      const metadata=node("dl",undefined,"metadata-grid");
      const identity=snapshot.identity || {};
      const entries=[["Schema",identity.schema],["Class",identity.name || identity.owner],["Superclass",identity.superclass],["Source",sourceLabel(identity)],["Lifetime",identity.lifetime],["Membership",identity.membership]];
      for(const [label,value] of entries) {metadata.append(node("dt",label),node("dd",displayValue(value)));} content.append(metadata);
    }
    function renderDetail(focus) {
      const member=visibleGroups(snapshot.groups || []).flatMap(group=>group.items).find(item=>item.id===selectedId) || (snapshot.selected?.id===selectedId?snapshot.selected:null);
      const isMethod=member && ["method","typeMethod"].includes(member.kind);
      byId("overview-content").hidden=!!member;byId("member-detail").hidden=!member||isMethod;byId("editor-region").hidden=!isMethod;
      text("detail-kind",member?member.kind.replace(/([a-z])([A-Z])/g,"$1 $2").toUpperCase():"OVERVIEW");
      text("detail-title",member?.name || "Class overview");
      text("detail-origin",member?.inherited?"Inherited from "+displayValue(member.declaringClass || member.owner):member?"Declared in "+displayValue(member.owner || snapshot.identity?.qualifiedName):"");
      if(!member)renderOverview();else if(!isMethod)text("member-detail",member.detail || member.description || "Source details are not available for this member.");
      if(isMethod) {showSourceStatus({uri:member.file || snapshot.identity?.file}); if(!editor) {text("editor-status","The method editor is not available. Open Original Source to edit the backing document.");} }
      if(recoveryDraft)updateRecovery(recoveryDraft);
      if(focus){byId("detail-title").focus({preventScroll:true});text("announcement",member?member.name+", "+member.kind+", selected":"Class overview selected");}
    }
    function renderTree() {
      const tree=byId("member-tree"),oldScroll=tree.scrollTop;tree.replaceChildren();
      for(const group of visibleGroups(snapshot.groups || [])) {
        const section=node("div");section.setAttribute("role","group");const heading=node("h3",group.label+" · "+(group.total ?? group.items.length));heading.id="group-"+group.label.replace(/\W/g,"");section.setAttribute("aria-labelledby",heading.id);section.append(heading);
        for(const member of group.items){const button=node("button",undefined,"member-row");button.type="button";button.dataset.memberId=member.id;button.setAttribute("role","treeitem");button.setAttribute("aria-selected",String(member.id===selectedId));button.tabIndex=-1;const symbol=node("span",({method:"ƒ",typeMethod:"ƒ",property:"◈",reference:"↗",constant:"C",key:"⌘",base:"↑"})[member.kind] || "·","member-symbol");symbol.setAttribute("aria-hidden","true");button.append(symbol,node("span",member.name,"member-name"));if(member.inherited){const origin=node("span",member.declaringClass || member.owner || "Inherited","member-origin");button.append(origin);}button.title=[member.name,member.detail,member.inherited?"Inherited from "+(member.declaringClass || member.owner):""].filter(Boolean).join(" · ");button.addEventListener("click",()=>select(member.id));section.append(button);}tree.append(section);
      }
      const buttons=[...tree.querySelectorAll("[role=treeitem]")];const selectedIndex=buttons.findIndex(button=>button.dataset.memberId===selectedId);focusIndex=selectedIndex>=0?selectedIndex:Math.min(focusIndex,buttons.length-1);if(buttons[focusIndex])buttons[focusIndex].tabIndex=0;
      tree.tabIndex=buttons.length?-1:0;
      tree.scrollTop=!restoredScroll?(snapshot.state?.scrollTop || initial.scrollTop || 0):oldScroll;restoredScroll=true;
      const total=snapshot.total || 0,offset=snapshot.offset ?? snapshot.state?.offset ?? 0,count=buttons.length;
      text("page-status",count?`${offset+1}–${offset+count} of ${total}`:`0 of ${total}`);text("member-count",String(total));
      byId("previous").disabled=offset===0;byId("next").disabled=!(snapshot.hasMore ?? offset+count<total);
      byId("empty-state").hidden=count!==0 || !snapshot.state?.query && snapshot.state?.kind==="all";
    }
    function render(value,focus) {
      snapshot=value;selectedId=value.state?.selectedId || "";
      byId("workspace").dataset.viewId=value.viewId || "";
      const identity=value.identity||{};text("class-name",identity.qualifiedName || [identity.schema,identity.name || identity.owner].filter(Boolean).join("::") || "Class workspace");
      text("class-context",[identity.projectName || identity.project,sourceLabel({...identity,file:value.document?.uri || identity.file})].filter(Boolean).join(" · "));byId("class-context").title=sourcePath(value.document?.uri || identity.file);
      text("source-status",value.document?.dirty?"● Unsaved source":"Workspace source");byId("source-status").classList.toggle("dirty",!!value.document?.dirty);
      if(pendingQuery===value.state?.query)pendingQuery=undefined;
      if(document.activeElement!==byId("search")&&pendingQuery===undefined)byId("search").value=value.state?.query || "";
      byId("kind").value=value.state?.kind || "all";byId("inherited").checked=!!value.state?.includeInherited;byId("inherited").disabled=!value.inheritedAvailable;byId("inherited").title=value.inheritedAvailable?"Include members with a resolved declaring class":"Inherited ownership is not resolved";text("inherited-reason",value.inheritedAvailable?"":value.inheritedReason || "Inherited members unavailable until ownership is resolved.");
      byId("workspace").style.setProperty("--rail-width",(value.state?.railWidth || 280)+"px");byId("rail-resizer").setAttribute("aria-valuenow",String(value.state?.railWidth || 280));
      byId("workspace").setAttribute("aria-busy","false");byId("failure").hidden=true;renderTree();renderDetail(focus);remember();
    }
    function filters(){send({command:"filter",kind:byId("kind").value,includeInherited:byId("inherited").checked});}
    byId("search").maxLength=256;
    byId("search").addEventListener("input",()=>{const query=byId("search").value.slice(0,256);pendingQuery=query;clearTimeout(searchTimer);searchTimer=setTimeout(()=>send({command:"search",query}),120);});
    byId("kind").addEventListener("change",filters);byId("inherited").addEventListener("change",filters);
    byId("overview").addEventListener("click",()=>select(""));byId("back").addEventListener("click",()=>send({command:"backToClasses"}));byId("original").addEventListener("click",()=>send({command:"openOriginal"}));byId("instances").addEventListener("click",()=>send({command:"instances"}));
    byId("previous").addEventListener("click",()=>send({command:"page",offset:Math.max(0,(snapshot?.state?.offset || 0)-100)}));byId("next").addEventListener("click",()=>send({command:"page",offset:(snapshot?.state?.offset || 0)+100}));
    byId("retry").addEventListener("click",()=>send({command:"retry"}));byId("clear-search").addEventListener("click",()=>{byId("search").value="";byId("kind").value="all";send({command:"search",query:""});filters();});
    byId("member-picker").addEventListener("click",()=>{pickerOpen=!pickerOpen;byId("member-rail").classList.toggle("picker-open",pickerOpen);byId("member-picker").setAttribute("aria-expanded",String(pickerOpen));if(pickerOpen)byId("search").focus();});
    byId("more").addEventListener("click",()=>{const open=byId("more").getAttribute("aria-expanded")!=="true";byId("more").setAttribute("aria-expanded",String(open));byId("original").classList.toggle("compact-visible",open);byId("instances").classList.toggle("compact-visible",open);});
    byId("member-tree").addEventListener("scroll",layout);
    byId("member-tree").addEventListener("keydown",event=>{const buttons=[...byId("member-tree").querySelectorAll("[role=treeitem]")];if(!buttons.length)return;if(["ArrowDown","ArrowUp","Home","End"].includes(event.key)){event.preventDefault();focusIndex=event.key==="Home"?0:event.key==="End"?buttons.length-1:nextIndex(buttons.indexOf(document.activeElement),event.key==="ArrowDown"?1:-1,buttons.length);for(const button of buttons)button.tabIndex=-1;buttons[focusIndex].tabIndex=0;buttons[focusIndex].focus();}else if(event.key==="Enter"&&document.activeElement.dataset.memberId){event.preventDefault();select(document.activeElement.dataset.memberId);}});
    document.addEventListener("keydown",event=>{if(event.key==="/"&&ownsSearchShortcut(event.target)){event.preventDefault();if(window.innerWidth<760){pickerOpen=true;byId("member-rail").classList.add("picker-open");byId("member-picker").setAttribute("aria-expanded","true");}byId("search").focus();}if(event.key==="Escape"&&event.target===byId("search")){event.preventDefault();if(byId("search").value){clearTimeout(searchTimer);byId("search").value="";send({command:"search",query:""});}else if(pickerOpen){closePicker();byId("member-picker").focus();}}});
    const resizer=byId("rail-resizer");resizer.addEventListener("keydown",event=>{if(!["ArrowLeft","ArrowRight"].includes(event.key))return;event.preventDefault();const width=Math.max(240,Math.min(320,(snapshot?.state?.railWidth || 280)+(event.key==="ArrowLeft"?-10:10)));if(snapshot)snapshot.state.railWidth=width;byId("workspace").style.setProperty("--rail-width",width+"px");resizer.setAttribute("aria-valuenow",String(width));layout();});
    resizer.addEventListener("pointerdown",event=>{const left=byId("member-rail").getBoundingClientRect().left;resizer.setPointerCapture(event.pointerId);const move=event=>{const width=Math.max(240,Math.min(320,event.clientX-left));byId("workspace").style.setProperty("--rail-width",width+"px");resizer.setAttribute("aria-valuenow",String(width));};const up=()=>{resizer.removeEventListener("pointermove",move);resizer.removeEventListener("pointerup",up);layout();};resizer.addEventListener("pointermove",move);resizer.addEventListener("pointerup",up);});
    if(window.jadeMethodEditor)editor=window.jadeMethodEditor.mount(byId("method-editor"),{postMessage:send});
    window.addEventListener("message",event=>{const value=event.data;if(!value||typeof value.command!=="string")return;if(value.revision!==undefined&&value.revision<revision)return;if(value.revision!==undefined)revision=value.revision;switch(value.command){case"loading":byId("workspace").setAttribute("aria-busy","true");break;case"workspace":render(value.snapshot,value.focusDetail);break;case"editorSnapshot":if(value.reset){unappliedDraft=false;editor?.acceptRecovered?.(value.snapshot);notice("");}else editor?.update(value.snapshot);declaringButton.hidden=!value.snapshot?.canOpenDeclaring;showSourceStatus(value.snapshot);if(snapshot){snapshot.document={...snapshot.document,dirty:!!value.snapshot?.dirty};text("source-status",value.snapshot?.dirty?"● Unsaved source":"Workspace source");}break;case"editorDraftRecovery":updateRecovery(value.draft);break;case"editorRejected":showUnappliedDraft();editor?.fail?.(value.message);notice(value.message);break;case"editorCompletions":editor?.complete?.(value.id,value.result);break;case"editorDiagnostics":editor?.diagnostics?.(value.items);break;case"memberDetail":if(value.id===selectedId)text("member-detail",value.preview?.text || value.preview?.reason || "Source details are not available for this member.");break;case"notice":notice(value.message);break;case"error":byId("workspace").setAttribute("aria-busy","false");text("failure-message",value.message);byId("failure").hidden=false;break;case"flushPendingEdits":Promise.resolve(editor?.flush?.()).then(()=>send({command:"pendingEditsReady",requestId:value.requestId,ok:true}),error=>{notice(error.message);send({command:"pendingEditsReady",requestId:value.requestId,ok:false});});break;case"prepareSelection":select(value.id);break;case"refresh":send({command:"retry"});break;}});
    window.addEventListener("unload",()=>{clearTimeout(searchTimer);clearTimeout(layoutTimer);editor?.dispose();});send({command:"ready"});
    return {render,dispose:()=>editor?.dispose()};
  }
  return {visibleGroups,ownsSearchShortcut,displayValue,sourcePath,sourceLabel,nextIndex,mount};
});
