'use strict';
const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { resolveConfig, inspectInstall, schemaFromSource } = require('./config');
const { startCpp } = require('./cpp-runner');
const { CliWorkingSession } = require('./cli-client');
const { resolvePublishConfig, startPublish } = require('./publish');
const { testLenses } = require('./local-tests');

const keys = ['installPath', 'databasePath', 'iniPath', 'schema', 'server', 'application', 'cacheDirectory', 'testTimeoutSeconds', 'extractionDirectory', 'cppHelperPath', 'systemSnapshotPath', 'workingDatabaseDirectory', 'testDependencyScope'];
function defaults(resource) {
  const settings = vscode.workspace.getConfiguration('jadeNative', resource);
  return Object.fromEntries(keys.map(key => [key, settings.get(key)]));
}

function expand(value, folder) {
  if (typeof value !== 'string') return value;
  return value.replace(/\$\{env:([^}]+)\}/g, (_, name) => process.env[name] || '')
    .replaceAll('${workspaceFolder}', folder?.uri.fsPath || '')
    .replaceAll('${userHome}', os.homedir())
    .replaceAll('${file}', vscode.window.activeTextEditor?.document.uri.fsPath || '');
}

async function detectSettings() {
  if (process.platform !== 'win32') throw new Error('This native proof currently supports Windows x64.');
  const editor = vscode.window.activeTextEditor;
  const resource = editor?.document.uri || vscode.workspace.workspaceFolders?.[0]?.uri;
  const folder = resource ? vscode.workspace.getWorkspaceFolder(resource) : undefined;
  if (!folder) throw new Error('Open a workspace folder before detecting Jade settings.');
  const settings = vscode.workspace.getConfiguration('jadeNative', folder.uri);
  const candidates = new Set([settings.get('installPath'), process.env.JADE_INSTALL].filter(Boolean));
  const drive = process.env.SystemDrive || 'C:';
  for (const entry of fs.readdirSync(drive + path.sep, { withFileTypes: true })) {
    if (entry.isDirectory() && /^jade\d{4}$/i.test(entry.name)) candidates.add(path.join(drive + path.sep, entry.name));
  }
  const valid = [...candidates].filter(candidate => fs.existsSync(path.join(candidate, 'bin', 'jom.dll')));
  let installPath;
  if (valid.length === 1) installPath = valid[0];
  else if (valid.length > 1) installPath = await vscode.window.showQuickPick(valid, { title: 'Select Jade installation' });
  else installPath = (await vscode.window.showOpenDialog({ title: 'Select Jade installation directory', canSelectFolders: true, canSelectFiles: false, canSelectMany: false }))?.[0]?.fsPath;
  if (!installPath) return;
  const detected = inspectInstall(installPath);
  if (!detected.databasePath) {
    detected.databasePath = (await vscode.window.showOpenDialog({ title: 'Select Jade database directory', canSelectFolders: true, canSelectFiles: false, canSelectMany: false }))?.[0]?.fsPath;
    if (!detected.databasePath) return;
    if (!fs.existsSync(path.join(detected.databasePath, '_control.dat'))) throw new Error('Selected database has no _control.dat.');
    detected.iniPath = path.join(detected.databasePath, 'jade.ini');
  }
  if (!fs.existsSync(detected.iniPath)) {
    detected.iniPath = (await vscode.window.showOpenDialog({ title: 'Select Jade INI file', canSelectFiles: true, canSelectMany: false, filters: { 'Jade INI': ['ini'] } }))?.[0]?.fsPath;
    if (!detected.iniPath) return;
  }
  const selection = await vscode.window.showQuickPick([
    { label: 'Single user', description: 'Open the local database directly', value: 'singleUser' },
    { label: 'Multi user', description: detected.serverConnection || 'Connect using the selected INI', value: 'multiUser' }
  ], { title: `Jade server mode (INI: ${detected.serverFromIni || 'unspecified'})` });
  if (!selection) return;
  const values = { installPath: detected.installPath, databasePath: detected.databasePath, iniPath: detected.iniPath, server: selection.value };
  for (const [key, value] of Object.entries(values)) await settings.update(key, value, vscode.ConfigurationTarget.WorkspaceFolder);
  await vscode.window.showInformationMessage('Jade runtime settings saved. Open a CLS file and press Shift+F5 to publish; its schema is read from the file.');
  return values;
}

function activate(context) {
  void require('./legacy-member-tabs').retireLegacyMemberTabs(vscode,context);
  const language=require('./language-tools').registerLanguageTools(vscode,context);
  require('./navigation').registerNavigation(context,language);
  require('./impact-navigation').registerImpactNavigation(vscode,context,language);
  const classView=require('./class-view').registerClassView(vscode,context,language);
  const diagnostics = vscode.languages.createDiagnosticCollection('jade-native');
  const publishOutput = vscode.window.createOutputChannel('Jade Publish');
  const compileOutput = vscode.window.createOutputChannel('Jade Compile');
  const testOutput = vscode.window.createOutputChannel('Jade Tests');
  const nativeTests = new CliWorkingSession({entry:path.join(context.extensionPath,'vendor','jade-tools-cli','jade-cli.exe')});
  const startWorking=(...args)=>nativeTests.startWorking(...args);
  require('./cli-gateway').configure(nativeTests);
  context.subscriptions.push(nativeTests,{dispose:()=>require('./cli-gateway').configure(undefined)});
  let publishing = false,objectExplorer;
  const beforeOperation=async()=>{await objectExplorer?.releaseForOperation();if(!publishing)await nativeTests.release();};
  require('./sidebar').registerSidebar(vscode, context, {
    beforeOperation,
    isBusy: () => publishing,
    setBusy: async value => { publishing = value; await vscode.commands.executeCommand('setContext', 'jadeNative.publishing', value); },
    settings: folder => Object.fromEntries(Object.entries(defaults(folder.uri)).map(([key, value]) => [key, expand(value, folder)]))
  });
  const publishChanges = require('./publish-changes').registerPublishChanges(vscode, context, {
    beforeOperation,
    output: publishOutput, isBusy: () => publishing,
    setBusy: async value => { publishing = value; await vscode.commands.executeCommand('setContext', 'jadeNative.publishing', value); },
    settings: folder => Object.fromEntries(Object.entries(defaults(folder.uri)).map(([key, value]) => [key, expand(value, folder)])),
    publishNativeProject: () => projectTools.publish()
  });
  function classConfig(document) {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    const settings = Object.fromEntries(Object.entries(defaults(document.uri)).map(([key, value]) => [key, expand(value, folder)]));
    let schema = schemaFromSource(document.getText()) || /\bRename\s+Class\s+(\w+)::/i.exec(document.getText())?.[1] || (document.uri.fsPath.toLowerCase().endsWith('.ddx') ? /<schema\b[^>]*\bname="([^"]+)"/.exec(document.getText())?.[1] : undefined);
    if(!schema){let directory=path.dirname(document.uri.fsPath);const root=folder?.uri.fsPath||directory;
      while(directory.length>=root.length){const header=[path.join(directory,'schemaDefinitions.sec'),path.join(path.dirname(directory),path.basename(directory)+'.scm')].find(file=>fs.existsSync(file));if(header){schema=schemaFromSource(fs.readFileSync(header,'utf8'));if(schema)break;}const parent=path.dirname(directory);if(parent===directory)break;directory=parent;}
    }
    const workspaceRoots = [folder?.uri.fsPath || path.dirname(document.uri.fsPath)];
    const config = resolveConfig({ ...settings, schema, program: document.uri.fsPath, workspaceRoots, classFile: true, sourceProperties: true,
      offline: false, run: false });
    const directory = settings.cacheDirectory ? path.resolve(folder?.uri.fsPath || path.dirname(document.uri.fsPath), settings.cacheDirectory)
      : path.join(context.globalStorageUri.fsPath, 'native');
    config.storagePath = directory;
    config.helperPath = settings.cppHelperPath || path.join(context.extensionPath, 'vendor', 'jade-tools-cli', 'native', 'jade-native-helper.exe');
    config.systemSnapshotPath = settings.systemSnapshotPath;
    config.testDependencyScope = settings.testDependencyScope || 'auto';
    config.workingDatabaseDirectory = settings.workingDatabaseDirectory || undefined;
    config.workingDatabaseGeneration = context.workspaceState.get('jadeNative.workingDatabaseGeneration', 'initial');
    return config;
  }
  function inspectionConfig(document,selectedFolder){
    const folder=selectedFolder||(document?.uri&&vscode.workspace.getWorkspaceFolder(document.uri))||vscode.workspace.workspaceFolders?.[0];
    if(!folder)throw Error('Open a workspace folder and configure its Jade connection.');
    const settings=Object.fromEntries(Object.entries(defaults(document?.uri||folder.uri)).map(([key,value])=>[key,expand(value,folder)]));
    const installPath=settings.installPath||process.env.JADE_INSTALL;if(!installPath)throw Error('Set jadeNative.installPath or use Detect Runtime Settings.');
    return {...settings,installPath,databasePath:settings.databasePath||path.join(installPath,'system'),iniPath:settings.iniPath||path.join(settings.databasePath||path.join(installPath,'system'),'jade.ini'),server:settings.server||'singleUser',schema:'RootSchema',
      workspaceRoots:[folder.uri.fsPath],storagePath:settings.cacheDirectory?path.resolve(folder.uri.fsPath,settings.cacheDirectory):path.join(context.globalStorageUri.fsPath,'native'),
      workingDatabaseGeneration:context.workspaceState.get('jadeNative.workingDatabaseGeneration','initial')};
  }
  async function refreshCache(config, output = compileOutput, fromDatabase = true) {
    if (!fromDatabase && !config.systemSnapshotPath) throw new Error('Run Jade: Refresh Type Cache to read system metadata from the configured database.');
    output.appendLine(fromDatabase ? 'Refreshing RootSchema system definitions in a read-only database session ...' : 'Importing RootSchema system definitions into external C++ cache ...');
    const result = await startCpp(config, fromDatabase ? 'cache.refresh' : 'cache.import', text => output.append(text)).completion;
    if (!result.passed) throw new Error(result.report?.error || `System cache refresh failed (exit ${result.code}).`);
    output.appendLine(fromDatabase ? 'Database disconnected. System cache refreshed for IntelliSense; compile and test use the native working database.' : 'System cache imported. Workspace source supplies application definitions.');
    return result;
  }
  async function workingFiles(config) {
    const {isNestedSnapshot}=require('./source-snapshots');
    const root=path.resolve(config.workspaceRoots[0]);
    config.files=(await vscode.workspace.findFiles('**/*.cls','**/{node_modules,.git}/**')).filter(uri=>{
      const relative=path.relative(root,uri.fsPath);
      return relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)&&!isNestedSnapshot(uri,vscode.workspace);
    }).map(uri=>uri.fsPath);
    if(!config.files.includes(config.program))config.files.push(config.program);
    for(const document of vscode.workspace.textDocuments){const relative=path.relative(root,document.uri.fsPath||'');if(document.isDirty&&document.uri.scheme==='file'&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)&&/\.(cls|scm|sec|ddx|jcf)$/i.test(document.uri.fsPath)&&!isNestedSnapshot(document.uri,vscode.workspace)&&!await document.save())throw new Error('Could not save '+document.uri.fsPath);}
  }
  function reportDiagnostic(report) {
    if (report.diagnostics?.some(entry => entry.source && entry.source !== report.source)) {
      const grouped = new Map();
      for (const entry of report.diagnostics) {
        const source = entry.source || report.source;
        if (!grouped.has(source)) grouped.set(source, []);
        grouped.get(source).push(entry);
      }
      for (const [source, entries] of grouped) reportDiagnostic({ ...report, source, diagnostics: entries });
      return;
    }
    const uri = vscode.Uri.file(report.source);
    diagnostics.delete(uri);
    if (report.compiled !== false) return;
    const entries = report.diagnostics || [report];
    diagnostics.set(uri, entries.map(entry => {
      const line = Math.max(0, (entry.line || 1) - 1);
      const column = Math.max(0, (entry.column || 1) - 1);
      const document = vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString());
      const end = document && line < document.lineCount ? Math.min(document.lineAt(line).text.length, column + Math.max(1, entry.error_length || 1)) : column + 1;
      const diagnostic = new vscode.Diagnostic(new vscode.Range(line, column, line, Math.max(column, end)), entry.message || 'Jade compilation failed.', vscode.DiagnosticSeverity.Error);
      diagnostic.code = entry.compiler_error;
      diagnostic.source = 'Jade';
      return diagnostic;
    }));
  }
  const debugTests=require('./test-debug').registerTestDebugging(vscode,context);
  const testing = require('./testing').registerTesting(vscode, context, (...args) =>
    vscode.commands.executeCommand('jadeNative.executeLocalTests', ...args), language.index,debugTests);
  require('./verify-tests').registerVerifyTests(vscode,context,{
    beforeOperation,
    testing,output:testOutput,isBusy:()=>publishing,
    setBusy:async value=>{publishing=value;await vscode.commands.executeCommand('setContext','jadeNative.publishing',value);},
    settings:folder=>Object.fromEntries(Object.entries(defaults(folder.uri)).map(([key,value])=>[key,expand(value,folder)]))
  });
  const projectTools=require('./project-tools').registerProjectTools(vscode,context,{
    beforeOperation,
    prepareWorking:(config,output)=>nativeTests.prepareWorking(config,output),
    config:classConfig,output:publishOutput,isBusy:()=>publishing,
    setBusy:async value=>{publishing=value;await vscode.commands.executeCommand('setContext','jadeNative.publishing',value);},
    settings:folder=>Object.fromEntries(Object.entries(defaults(folder.uri)).map(([key,value])=>[key,expand(value,folder)]))
  });
  require('./collection-designer').registerCollections(vscode,context);
  require('./application-debug-ui').registerApplicationDebug(vscode,context);
  require('./debugger').registerDebugger(vscode,context,{
    beforeOperation,config:classConfig,workingFiles,startWorking,prepareWorking:(config,output)=>nativeTests.prepareWorking(config,output),isBusy:()=>publishing,
    setBusy:async value=>{publishing=value;await vscode.commands.executeCommand('setContext','jadeNative.publishing',value);}
  });
  objectExplorer=require('./object-explorer').registerObjectExplorer(vscode,context,{
    config:inspectionConfig,beforeConnect:()=>nativeTests.release(),isBusy:()=>publishing,
    inspectionTarget:(config,selection)=>nativeTests.inspectionTarget(config,selection),workingLocation:config=>nativeTests.workingLocation(config),
    setBusy:async value=>{publishing=value;}
  });
  context.subscriptions.push(diagnostics, publishOutput, compileOutput, testOutput,
    vscode.commands.registerCommand('jadeNative.disconnectTestRunner',async()=>{if(publishing)throw Error('Wait for the current Jade operation or cancel it first.');await nativeTests.release();testOutput.appendLine('Native test connection closed.');}),
    vscode.commands.registerCommand('jadeNative.refreshTests', async () => {
      await testing.discover(true);
      const summary=testing.summary?.();
      if(summary)testOutput.appendLine(`Discovered ${summary.tests} test(s) in ${summary.files.length} CLS file(s).`);
      return summary;
    }),
    vscode.commands.registerCommand('jadeNative.runLocalTests', async (uri, method) => {
      try { return await testing.runFile(uri || vscode.window.activeTextEditor?.document.uri, method); }
      catch (error) {
        testOutput.appendLine(error.message); testOutput.show(true);
        void vscode.window.showErrorMessage(error.message);
        return { passed: false, error: error.message };
      }
    }),
    vscode.languages.registerCodeLensProvider({ language: 'jade-nz', scheme: 'file', pattern: '**/*.cls' }, {
      provideCodeLenses(document) {
        return testLenses(document.getText()).map(entry => new vscode.CodeLens(
          new vscode.Range(document.positionAt(entry.offset), document.positionAt(entry.offset)),
          { title: entry.method ? 'Run Local Test' : 'Run Local Tests', command: 'jadeNative.runLocalTests', arguments: [document.uri, entry.method] }));
      }
    }),
    vscode.commands.registerCommand('jadeNative.executeLocalTests', async (uri, method, testCancellation, outputObserver) => {
      await objectExplorer?.releaseForOperation();
      if (publishing) { void vscode.window.showErrorMessage('A Jade operation is already running.'); return; }
      publishing = true;
      try {
        await vscode.commands.executeCommand('setContext', 'jadeNative.publishing', true);
        const document = uri ? await vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document;
        if (!document || document.uri.scheme !== 'file' || !/\.cls$/i.test(document.uri.fsPath)) throw new Error('Open a saved CLS test class.');
        if (document.isDirty && !await document.save()) throw new Error('Save the test file before running.');
        const config = classConfig(document);
        testOutput.clear(); testOutput.show(true);
        diagnostics.delete(document.uri);
        testOutput.appendLine(`Running local tests from ${path.basename(config.program)} (no publish).`);
        testOutput.appendLine('Native Jade compiles and runs workspace source in an isolated working database. The configured publish target is not updated.');
        await workingFiles(config);
        const operation = startWorking({...config, methods: method,testSession:nativeTests,beforeNativeProcess:()=>nativeTests.release()}, 'test.run', text => {
          testOutput.append(text); outputObserver?.(text);
        });
        const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Running local Jade tests', cancellable: true }, async (_, cancellation) => {
          const subscription = cancellation.onCancellationRequested(() => operation.stop());
          const testingSubscription = testCancellation?.onCancellationRequested(() => operation.stop());
          if (testCancellation?.isCancellationRequested) operation.stop();
          try { return await operation.completion; } finally { subscription.dispose(); testingSubscription?.dispose(); }
        });
        if (result.report?.diagnostics) {
          const grouped = new Map();
          for (const entry of result.report.diagnostics) {
            const source = entry.source || config.program;
            if (!grouped.has(source)) grouped.set(source, []);
            grouped.get(source).push(entry);
          }
          for (const [source, entries] of grouped) reportDiagnostic({ source, compiled: false, diagnostics: entries });
          for (const diagnostic of result.report.diagnostics) {
            testOutput.appendLine(`Jade ${diagnostic.compiler_error} (${diagnostic.owner}::${diagnostic.method}): ${diagnostic.message}`);
            testOutput.appendLine(`${diagnostic.source}:${diagnostic.line}:${diagnostic.column}`);
          }
        }
        if (result.cancelled) testOutput.appendLine('Test run cancelled; results are incomplete.');
        else if (result.timedOut) testOutput.appendLine('Test run timed out; results are incomplete. Adjust jadeNative.testTimeoutSeconds if needed.');
        else if (result.report?.tests_completed) {
          testOutput.appendLine(`Selected ${result.report.tests_selected} test method(s); native runner reported ${result.report.failures} failure(s).`);
          testOutput.appendLine(result.passed ? 'Local test run passed.' : 'Local test run failed.');
          if (result.report.cleanup_errors?.length) testOutput.appendLine(result.report.cleanup_errors.join('\n'));
        } else testOutput.appendLine(`Tests did not complete: ${result.report?.error || 'No valid result received from the native worker.'}`);
        testOutput.appendLine(`TestExitCode=${result.code}`);
        if (result.passed) void vscode.window.showInformationMessage('Local Jade test run passed.');
        else if (!result.cancelled) void vscode.window.showErrorMessage('Local Jade test run failed. See Jade Tests output.');
        return result;
      } catch (error) {
        testOutput.appendLine(error.message); testOutput.show(true);
        void vscode.window.showErrorMessage(error.message);
        return { passed: false, error: error.message };
      } finally {
        publishing = false;
        await vscode.commands.executeCommand('setContext', 'jadeNative.publishing', false);
      }
    }),
    vscode.commands.registerCommand('jadeNative.refreshTypeCache', async () => {
      await beforeOperation();
      if (publishing) { void vscode.window.showErrorMessage('A Jade compile, publish or refresh is already running.'); return; }
      publishing = true;
      try {
        await vscode.commands.executeCommand('setContext', 'jadeNative.publishing', true);
        const document = vscode.window.activeTextEditor?.document;
        if (!document || document.uri.scheme !== 'file' || !/\.cls$/i.test(document.uri.fsPath)) throw new Error('Open a CLS file to select the schema to cache.');
        const config = classConfig(document);
        compileOutput.clear(); compileOutput.show(true);
        return await refreshCache(config);
      } catch (error) {
        compileOutput.appendLine(error.message); compileOutput.show(true);
        void vscode.window.showErrorMessage(error.message);
        return { passed: false, error: error.message };
      } finally {
        publishing = false;
        await vscode.commands.executeCommand('setContext', 'jadeNative.publishing', false);
      }
    }),
    vscode.commands.registerCommand('jadeNative.compileClass', async () => {
      await objectExplorer?.releaseForOperation();
      if (publishing) { void vscode.window.showErrorMessage('A Jade compile or publish is already running.'); return; }
      publishing = true;
      try {
        const document = vscode.window.activeTextEditor?.document;
        if (!document || document.uri.scheme !== 'file' || !/\.(cls|scm|sec|ddx|jcf)$/i.test(document.uri.fsPath)) throw new Error('Open a native Jade source file to compile.');
        await vscode.commands.executeCommand('setContext', 'jadeNative.publishing', true);
        if (document.isDirty && !await document.save()) throw new Error('The class file could not be saved.');
        const config = classConfig(document);
        compileOutput.clear();
        compileOutput.show(true);
        compileOutput.appendLine(`Checking class methods in ${path.basename(config.program)} (no publish) ...`);
        await workingFiles(config);
        for(const file of config.files)diagnostics.delete(vscode.Uri.file(file));
        const operation=startWorking({...config,testSession:nativeTests,beforeNativeProcess:()=>nativeTests.release()},'compile',text=>compileOutput.append(text),reportDiagnostic);
        const result=await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Compiling in native Jade working database',cancellable:true},async(_,token)=>{
          const subscription=token.onCancellationRequested(()=>operation.stop());
          if(token.isCancellationRequested)operation.stop();
          try{return await operation.completion;}finally{subscription.dispose();}
        });
        if (result.report?.error) compileOutput.appendLine(result.report.error);
        for (const error of result.report?.diagnostics || []) {
          compileOutput.appendLine(`Jade ${error.compiler_error} (${error.owner}::${error.method}): ${error.message}`);
          compileOutput.appendLine(`${error.source}:${error.line}:${error.column}`);
        }
        if (result.passed) compileOutput.appendLine(result.report.native_project ? `Native project compile complete; synchronised ${result.report.loaded_files} source/resource file(s).` : `Native compile complete; synchronised ${result.report.loaded_files} changed CLS file(s).`);
        compileOutput.appendLine(`CompilerExitCode=${result.code}`);
        return result;
      } catch (error) {
        compileOutput.appendLine(`Compile check failed: ${error.message}`);
        compileOutput.show(true);
        void vscode.window.showErrorMessage(error.message);
        return { passed: false, error: error.message };
      } finally {
        publishing = false;
        await vscode.commands.executeCommand('setContext', 'jadeNative.publishing', false);
      }
    }),
    vscode.commands.registerCommand('jadeNative.publishClass', async () => {
      await beforeOperation();
      if(/\.(scm|sec|ddx|jcf)$/i.test(vscode.window.activeTextEditor?.document.uri.fsPath||''))return vscode.commands.executeCommand('jadeNative.publishWorkspace');
      const activeFolder=vscode.window.activeTextEditor&&vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri);
      if(activeFolder&&(await require('./native-project').scanProject(activeFolder.uri.fsPath)).migrations.length)return vscode.commands.executeCommand('jadeNative.publishWorkspace');
      if (publishing) { await vscode.window.showErrorMessage('A Jade class publish is already running.'); return; }
      publishing = true;
      const document = vscode.window.activeTextEditor?.document;
      try {
        if (process.platform !== 'win32') throw new Error('Jade class publishing requires Windows.');
        if (!document || document.uri.scheme !== 'file' || !/\.cls$/i.test(document.uri.fsPath)) throw new Error('Open a saved .cls class file to publish.');
        if (document.isDirty && !await document.save()) throw new Error('The class file could not be saved; nothing was published.');
        const folder = vscode.workspace.getWorkspaceFolder(document.uri);
        const settings = Object.fromEntries(Object.entries(defaults(document.uri)).map(([key, value]) => [key, expand(value, folder)]));
        const config = resolvePublishConfig({ ...settings, program: document.uri.fsPath });
        await vscode.commands.executeCommand('setContext', 'jadeNative.publishing', true);
        const confirmation = await vscode.window.showWarningMessage(
          `Update the Jade base with ${path.basename(config.source)}?`,
          { modal: true, detail: `Schema: ${config.schema}\nDatabase: ${config.databasePath}\nClass file: ${config.source}\n\nPublishing loads and saves this class and its source in the selected database.` },
          'Update Jade Base'
        );
        if (confirmation !== 'Update Jade Base') {
          publishOutput.appendLine('Publish cancelled. The Jade database was not updated.');
          return { success: false, cancelled: true };
        }
        publishOutput.clear();
        publishOutput.show(true);
        publishOutput.appendLine(`Publishing ${path.basename(config.source)} to ${config.schema} (${config.databasePath}) ...`);
        const publishedHash = require('./publish-changes').digest(fs.readFileSync(config.source));
        const result = await startPublish(config, text => publishOutput.append(text)).completion;
        publishOutput.appendLine(`LoaderExitCode=${result.code}`);
        if (result.success) {
          await publishChanges.recordPublished(config, publishedHash);
          diagnostics.delete(document.uri);
          void vscode.window.showInformationMessage(`Published ${path.basename(config.source)} to ${config.schema}.`);
        } else if (result.publishedWithErrors) {
          void vscode.window.showErrorMessage(`Loaded ${path.basename(config.source)} into ${config.schema} with compilation errors. See Jade Publish output.`);
        } else {
          void vscode.window.showErrorMessage(`Jade class publish failed (exit ${result.code}). See Jade Publish output.`);
        }
        return { ...result, source: config.source, schema: config.schema, databasePath: config.databasePath };
      } catch (error) {
        publishOutput.appendLine(`Publish failed: ${error.message}`);
        publishOutput.show(true);
        void vscode.window.showErrorMessage(error.message);
        return { success: false, error: error.message };
      } finally {
        publishing = false;
        await vscode.commands.executeCommand('setContext', 'jadeNative.publishing', false);
      }
    }),
    vscode.commands.registerCommand('jadeNative.recreateWorkingDatabase', async () => {
      if(!publishing)await nativeTests.release();
      await beforeOperation();
      if(publishing)throw new Error('A Jade operation is already running.');
      const document=vscode.window.activeTextEditor?.document;
      if(!document)throw new Error('Open a CLS file first.');
      const config=classConfig(document);
      if(config.workingDatabaseDirectory)throw new Error('Choose a new empty jadeNative.workingDatabaseDirectory to recreate a custom working base. The previous base is retained.');
      await context.workspaceState.update('jadeNative.workingDatabaseGeneration',require('node:crypto').randomUUID());
      compileOutput.appendLine('A fresh native working database will be created on the next compile or test. The previous working base is retained.');compileOutput.show(true);
    }),
    vscode.commands.registerCommand('jadeNative.showWorkingDatabase', async () => {
      const document=vscode.window.activeTextEditor?.document;
      if(!document)throw new Error('Open a CLS file first.');
      const config=classConfig(document),location=await nativeTests.workingLocation(config);
      if(!fs.existsSync(location.root))throw new Error('Compile or run tests first to create the working database.');
      await vscode.commands.executeCommand('revealFileInOS',vscode.Uri.file(location.databasePath));
    }),
    vscode.commands.registerCommand('jadeNative.discover', () => detectSettings().catch(error => vscode.window.showErrorMessage(error.message))),
    vscode.commands.registerCommand('jadeNative.checkFile', () => vscode.commands.executeCommand('jadeNative.compileClass'))
  );
  return {classView,objectExplorer,testing,nativeTests};
}

module.exports = { activate };
