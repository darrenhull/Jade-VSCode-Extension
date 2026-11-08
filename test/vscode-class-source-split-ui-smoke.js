'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vscode=require('vscode');
const {ClassSourceSplitOffer}=require('../src/class-source-split-offer');
const {parseSource}=require('../src/source_symbols');
const {connectPrivateDebugger}=require('./creation-ui-capture.cjs');

async function run(){
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath,report=process.env.JADE_HEADLESS_HOST_REPORT;
 const file=path.join(root,'CombinedPets.cls'),uri=vscode.Uri.file(file),bird=path.join(root,'Bird.cls');
 const source=['jadeVersionNumber "25.0.02";','schemaDefinition','Pets subschemaOf RootSchema partialDefinition;','typeHeaders',' Fish subclassOf Object transient;',' Bird subclassOf Object transient;','typeDefinitions',' Fish completeDefinition',' (',' attributeDefinitions',' name: String[50];',' )',' Bird completeDefinition',' (',' attributeDefinitions',' name: String[50];',' )','databaseDefinitions',' PetsDb',' (',' classMapDefinitions',' Fish in "pets";',' Bird in "pets";',' )','typeSources',''].join('\r\n');
 let client;
 try{
  await vscode.workspace.getConfiguration('window').update('dialogStyle','custom',vscode.ConfigurationTarget.Global);
  fs.writeFileSync(file,source);const document=await vscode.workspace.openTextDocument(uri);await vscode.window.showTextDocument(document,{preview:false});
  client=await connectPrivateDebugger(Number(process.env.JADE_CLASS_WORKSPACE_DEBUG_PORT));
  const {targetInfos}=await client.request('Target.getTargets'),page=targetInfos.find(target=>target.type==='page'&&target.url.startsWith('vscode-file://'));assert.ok(page);
  const session=(await client.request('Target.attachToTarget',{targetId:page.targetId,flatten:true})).sessionId;
  const evaluate=async expression=>{const result=await client.request('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},session);if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result?.value;};
  const wait=async(expression,label)=>{for(let n=0;n<150;n++){const result=await evaluate(expression);if(result)return result;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Timed out: '+label);};
  const dialog='document.querySelector(".monaco-dialog-box")';
  const click=async text=>{await wait(`Array.from(${dialog}?.querySelectorAll('button,[role="button"]')||[]).some(button=>button.textContent.includes(${JSON.stringify(text)}))`,'dialog '+text);await evaluate(`Array.from(${dialog}.querySelectorAll('button,[role="button"]')).find(button=>button.textContent.includes(${JSON.stringify(text)})).click()`);};
  const screenshot=async name=>{const destination=path.join(process.env.JADE_CLASS_WORKSPACE_SCREENSHOTS,name),result=await client.request('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},session);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,Buffer.from(result.data,'base64'));return name;};
  let operation=new ClassSourceSplitOffer(vscode).consider(uri,'Fish');
  await wait(`${dialog}?.textContent.includes('multiple classes')`,'actual split offer');
  const offerScreenshot=await screenshot('class-source-split-offer.png');await click('Keep combined');assert.equal(await operation,false);assert.equal(document.getText(),source);assert.equal(document.isDirty,false);assert.equal(fs.existsSync(bird),false);
  operation=new ClassSourceSplitOffer(vscode).consider(uri,'Fish');await click('Review split');
  await wait(`${dialog}?.textContent.includes('Save All')`,'reviewed destination plan');
  const reviewText=await evaluate(`${dialog}.textContent`);assert.ok(reviewText.includes('CombinedPets.cls'));assert.ok(reviewText.includes('Bird.cls'));assert.ok(reviewText.includes('Undo'));
  const planScreenshot=await screenshot('class-source-split-review.png');await click('Split files');assert.equal(await operation,true);
  const birdDocument=await vscode.workspace.openTextDocument(vscode.Uri.file(bird));
  assert.deepEqual(parseSource(document.getText()).classes.map(cls=>cls.name),['Fish']);assert.deepEqual(parseSource(birdDocument.getText()).classes.map(cls=>cls.name),['Bird']);
  assert.ok(document.isDirty);assert.equal(birdDocument.isDirty,false);assert.equal(fs.readFileSync(bird,'utf8'),birdDocument.getText(),'Reviewed resource creation writes complete sibling bytes immediately');assert.equal(fs.readFileSync(file,'utf8'),source,'No automatic source save');
  await vscode.window.showTextDocument(document,{preview:false});await vscode.commands.executeCommand('undo');
  assert.equal(document.getText(),source,'Native Undo restores the complete combined source');assert.equal(fs.existsSync(bird),false,'Native Undo retires only the newly created sibling');
  await vscode.commands.executeCommand('redo');
  const redoneBird=await vscode.workspace.openTextDocument(vscode.Uri.file(bird));assert.deepEqual(parseSource(document.getText()).classes.map(cls=>cls.name),['Fish']);assert.deepEqual(parseSource(redoneBird.getText()).classes.map(cls=>cls.name),['Bird']);
  assert.equal(await vscode.workspace.saveAll(false),true,'The native workspace Save All operation completes successfully');
  assert.deepEqual(parseSource(fs.readFileSync(file,'utf8')).classes.map(cls=>cls.name),['Fish']);assert.deepEqual(parseSource(fs.readFileSync(bird,'utf8')).classes.map(cls=>cls.name),['Bird'],JSON.stringify({sourceDirty:document.isDirty,birdDirty:redoneBird.isDirty,birdClosed:redoneBird.isClosed,birdText:redoneBird.getText(),disk:fs.readFileSync(bird,'utf8')}));assert.match(fs.readFileSync(file,'utf8'),/Fish in "pets";/);assert.match(fs.readFileSync(bird,'utf8'),/Bird in "pets";/);
  // A source file's LF must survive a conflicting new-file CRLF preference.
  await vscode.workspace.getConfiguration('files').update('eol','\r\n',vscode.ConfigurationTarget.Workspace);
  const lfFile=path.join(root,'LfCombined.cls'),lfUri=vscode.Uri.file(lfFile),lfSource=source.replaceAll('Fish','LfFish').replaceAll('Bird','LfBird').replaceAll('\r\n','\n');
  fs.writeFileSync(lfFile,lfSource);const lfDocument=await vscode.workspace.openTextDocument(lfUri);assert.equal(lfDocument.eol,vscode.EndOfLine.LF);
  operation=new ClassSourceSplitOffer(vscode).consider(lfUri,'LfFish');await click('Review split');await click('Split files');assert.equal(await operation,true);
  assert.equal(await vscode.workspace.saveAll(false),true,'The native workspace Save All operation completes successfully');const savedLfBird=fs.readFileSync(path.join(root,'LfBird.cls'),'utf8');assert.equal(savedLfBird.includes('\r'),false,'Native resource contents preserve LF despite the new-file CRLF preference');
  fs.writeFileSync(report,JSON.stringify({passed:true,nativeDatabaseOpened:false,actualNativeOffer:true,keepCombinedUnchanged:true,reviewedDestinations:true,nativeWorkspaceEdit:true,nativeUndoRestoresAll:true,nativeRedo:true,lfPreservedAgainstCrlfPreference:true,createFileContents:true,completeSiblingBytesCreated:true,originalNotAutoSaved:true,saveAllProducesOneClassPerFile:true,screenshots:[offerScreenshot,planScreenshot]},null,2));
 }catch(error){fs.writeFileSync(report,JSON.stringify({passed:false,error:error.stack},null,2));throw error;}
 finally{client?.close();}
}
module.exports={run};
