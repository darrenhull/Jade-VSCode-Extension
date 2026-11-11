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
const {resolveJadeSource,jadeSourceUri}=require('./active-jade-source');

let activeNativeService;

const keys = ['installPath', 'databasePath', 'iniPath', 'characterSet', 'schema', 'server', 'application', 'cacheDirectory', 'testTimeoutSeconds', 'extractionDirectory', 'extractionTimeoutSeconds', 'cppHelperPath', 'systemSnapshotPath', 'workingDatabaseDirectory', 'testDependencyScope'];
function defaults(resource) {
  const settings = vscode.workspace.getConfiguration('jadeNative', resource);
  const values = Object.fromEntries(keys.map(key => [key, settings.get(key)]));
  const characterSet = settings.inspect?.('characterSet');
  if (!['globalValue', 'workspaceValue', 'workspaceFolderValue', 'globalLanguageValue', 'workspaceLanguageValue', 'workspaceFolderLanguageValue'].some(scope => characterSet?.[scope] !== undefined))
    delete values.characterSet;
  return values;
}

function expand(value, folder, resource=jadeSourceUri(vscode)) {
  if (typeof value !== 'string') return value;
  return value.replace(/\$\{env:([^}]+)\}/g, (_, name) => process.env[name] || '')
    .replaceAll('${workspaceFolder}', folder?.uri.fsPath || '')
    .replaceAll('${userHome}', os.homedir())
    .replaceAll('${file}', resource?.fsPath || '');
}

async function detectSettings(selectedResource, cancellationToken) {
  const cancelled = () => cancellationToken?.isCancellationRequested;
  if (cancelled()) return;
  const prompt = async show => {
    if (cancelled()) return;
    if (!cancellationToken) return show();
    let subscription;
    try {
      const cancellation = new Promise(resolve => {
        subscription = cancellationToken.onCancellationRequested(() => resolve(undefined));
      });
      if (cancelled()) return;
      const value = await Promise.race([show(), cancellation]);
      return cancelled() ? undefined : value;
    } finally { subscription?.dispose(); }
  };
  const chooseFolder = title => prompt(() => vscode.window.showOpenDialog({ title, canSelectFolders: true, canSelectFiles: false, canSelectMany: false }));
  if (process.platform !== 'win32') throw new Error('This native proof currently supports Windows x64.');
  const resource = selectedResource || jadeSourceUri(vscode) || vscode.workspace.workspaceFolders?.[0]?.uri;
  const folder = resource ? vscode.workspace.getWorkspaceFolder(resource) : undefined;
  if (!folder) throw new Error('Open a workspace folder before detecting Jade settings.');
  const sameFolder = () => {
    const current = vscode.workspace.getWorkspaceFolder(folder.uri);
    return current && path.resolve(current.uri.fsPath).toLowerCase() === path.resolve(folder.uri.fsPath).toLowerCase();
  };
  const settings = vscode.workspace.getConfiguration('jadeNative', folder.uri);
  const candidates = new Set([settings.get('installPath'), process.env.JADE_INSTALL].filter(Boolean));
  const drive = process.env.SystemDrive || 'C:';
  for (const entry of fs.readdirSync(drive + path.sep, { withFileTypes: true })) {
    if (entry.isDirectory() && /^jade\d{4}$/i.test(entry.name)) candidates.add(path.join(drive + path.sep, entry.name));
  }
  const valid = [...candidates].filter(candidate => fs.existsSync(path.join(candidate, 'bin', 'jom.dll')));
  let installPath;
  if (valid.length) {
    const selected = await prompt(() => vscode.window.showQuickPick([
      ...valid.map(directory => ({ label: directory, description: 'Detected Jade installation', directory })),
      { label: 'Browse to another installation folder…', browse: true },
    ], { title: 'Choose Jade installation folder', placeHolder: 'Select or browse to the installation folder containing bin/jom.dll, separate from your source folder.' }, cancellationToken));
    if (!selected) return;
    if (!selected.browse) installPath = selected.directory;
    else installPath = (await chooseFolder('Select Jade installation folder (contains bin/jom.dll)'))?.[0]?.fsPath;
  } else installPath = (await chooseFolder('Select Jade installation folder (contains bin/jom.dll)'))?.[0]?.fsPath;
  if (!installPath || cancelled()) return;
  const detected = inspectInstall(installPath);
  if (!detected.databasePath) {
    detected.databasePath = (await chooseFolder('Select Jade database directory'))?.[0]?.fsPath;
    if (!detected.databasePath || cancelled()) return;
    if (!fs.existsSync(path.join(detected.databasePath, '_control.dat'))) throw new Error('Selected database has no _control.dat.');
    detected.iniPath = path.join(detected.databasePath, 'jade.ini');
  }
  if (!fs.existsSync(detected.iniPath)) {
    detected.iniPath = (await prompt(() => vscode.window.showOpenDialog({ title: 'Select Jade INI file', canSelectFiles: true, canSelectMany: false, filters: { 'Jade INI': ['ini'] } })))?.[0]?.fsPath;
    if (!detected.iniPath || cancelled()) return;
  }
  const selection = await prompt(() => vscode.window.showQuickPick([
    { label: 'Single user', description: 'Open the local database directly', value: 'singleUser' },
    { label: 'Multi user', description: detected.serverConnection || 'Connect using the selected INI', value: 'multiUser' }
  ], { title: `Jade server mode (INI: ${detected.serverFromIni || 'unspecified'})` }, cancellationToken));
  if (!selection || cancelled() || !sameFolder()) return;
  const values = { installPath: detected.installPath, databasePath: detected.databasePath, iniPath: detected.iniPath, server: selection.value };
  // Settings updates are uncancellable: finish the started save before Connect settles.
  let saved = 0;
  try {
    for (const [key, value] of Object.entries(values)) {
      if (!sameFolder()) throw new Error('Selected workspace folder changed; restart runtime setup.');
      await settings.update(key, value, vscode.ConfigurationTarget.WorkspaceFolder);
      saved++;
    }
  } catch (error) {
    throw new Error(`Jade runtime settings save failed after ${saved} of 4 fields; earlier saves remain. ${error.message}`, { cause: error });
  }
  if (cancelled()) return;
  void vscode.window.showInformationMessage('Jade runtime settings saved. You can now connect to Database Objects.');
  return values;
}

async function detectSettingsCommand(resource, cancellationToken) {
  try { return await detectSettings(resource, cancellationToken); }
  catch (error) { void vscode.window.showErrorMessage(error.message); }
}
function activate(context) {
  void require('./legacy-member-tabs').retireLegacyMemberTabs(vscode,context);
  const language=require('./language-tools').registerLanguageTools(vscode,context);
  for(const name of ['jade-language','mermaid','drawio'])new (require('./ProjectSkillInstaller').ProjectSkillInstaller)({name,bundle:path.join(context.extensionPath,'skills',name),state:context.workspaceState,isTrusted:()=>vscode.workspace.isTrusted===true}).start(vscode,context,language.index);
  require('./navigation').registerNavigation(context,language);
  require('./impact-navigation').registerImpactNavigation(vscode,context,language);
  const classView=require('./class-view').registerClassView(vscode,context,language,{onInstances:row=>objectExplorer?.browseInstances(row)});
  const resolveSource=uri=>resolveJadeSource(vscode,uri,{prepare:resource=>classView.previewController.prepareActiveSource(resource)});
  const diagnostics = vscode.languages.createDiagnosticCollection('jade-native');
  const publishOutput = vscode.window.createOutputChannel('Jade Publish');
  const compileOutput = vscode.window.createOutputChannel('Jade Compile');
  const testOutput = vscode.window.createOutputChannel('Jade Tests');
  const nativeTests = new CliWorkingSession({entry:path.join(context.extensionPath,'vendor','jade-tools-cli','jade-cli.exe')});
  activeNativeService = nativeTests;
  const startWorking=(...args)=>nativeTests.startWorking(...args);
  require('./cli-gateway').configure(nativeTests);
  context.subscriptions.push(nativeTests,{dispose:()=>require('./cli-gateway').configure(undefined)});
  let publishing = false,objectExplorer;
  const beforeOperation=async()=>{await objectExplorer?.releaseForOperation();if(!publishing)await nativeTests.release();};
  require('./sidebar').registerSidebar(vscode, context, {
    streamAllSources:folder=>sourcePull.runAll(folder),
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
    resolveSource,publishNativeProject: uri => projectTools.publish(false,uri)
  });
  function classConfig(document) {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    const settings = Object.fromEntries(Object.entries(defaults(document.uri)).map(([key, value]) => [key, expand(value, folder, document.uri)]));
    let schema = schemaFromSource(document.getText()) || /\bRename\s+Class\s+(\w+)::/i.exec(document.getText())?.[1] || (document.uri.fsPath.toLowerCase().endsWith('.ddx') ? /<schema\b[^>]*\bname="([^"]+)"/.exec(document.getText())?.[1] : undefined);
    if(!schema){let directory=path.dirname(document.uri.fsPath);const root=folder?.uri.fsPath||directory;
      while(directory.length>=root.length){const header=[path.join(directory,'schemaDefinitions.sec'),path.join(path.dirname(directory),path.basename(directory)+'.scm')].find(file=>fs.existsSync(file));if(header){schema=schemaFromSource(fs.readFileSync(header,'utf8'));if(schema)break;}const parent=path.dirname(directory);if(parent===directory)break;directory=parent;}
    }
    const workspaceRoots = [folder?.uri.fsPath || path.dirname(document.uri.fsPath)];
    const config = resolveConfig({ ...settings, schema, program: document.uri.fsPath, workspaceRoots, classFile: true, sourceProperties: true,
      offline: false, run: false });
    // Preserve explicit choices for CLI validation, including invalid empty values.
    if (Object.hasOwn(settings, 'characterSet')) config.characterSet = settings.characterSet;
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
    const settings=Object.fromEntries(Object.entries(defaults(document?.uri||folder.uri)).map(([key,value])=>[key,expand(value,folder,document?.uri||folder.uri)]));
    const installPath=settings.installPath||process.env.JADE_INSTALL;if(!installPath)throw Object.assign(Error('Set jadeNative.installPath or use Detect Runtime Settings.'),{code:'JADE_RUNTIME_NOT_CONFIGURED'});
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
  const workingFiles = config => require('./compile-inputs').prepareCompileInputs(vscode, config);
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
  const sourcePull=require('./SourcePullController').registerSourcePull(vscode,context,{
    service:nativeTests,index:language.index,testing,classView,beforeOperation,
    refreshUnknownScope:destination=>require('./source-index-scope').queueSourceIndexScope(vscode,language.index,destination),
    prepareSource:uri=>classView.previewController.prepareSourcePull(uri),
    pendingSources:{hasPending:file=>classView.previewController.hasPendingSource(vscode.Uri.file(file)),
      hasPendingArtifact:(artifact,projectId)=>classView.previewController.hasPendingArtifact(artifact,projectId),
      onDidChange:listener=>classView.previewController.onDidChangePendingSource(event=>listener({path:vscode.Uri.parse(event.uri).fsPath,pending:event.pending,artifact:event.artifact,projectId:event.projectId}))},
    isBusy:()=>publishing,
    setBusy:async value=>{publishing=value;await vscode.commands.executeCommand('setContext','jadeNative.publishing',value);},
    settings:folder=>Object.fromEntries(Object.entries(defaults(folder.uri)).map(([key,value])=>[key,expand(value,folder)]))
  });
  require('./verify-tests').registerVerifyTests(vscode,context,{
    beforeOperation,
    testing,output:testOutput,isBusy:()=>publishing,
    setBusy:async value=>{publishing=value;await vscode.commands.executeCommand('setContext','jadeNative.publishing',value);},
    settings:folder=>Object.fromEntries(Object.entries(defaults(folder.uri)).map(([key,value])=>[key,expand(value,folder)]))
  });
  const projectTools=require('./project-tools').registerProjectTools(vscode,context,{
    beforeOperation,resolveSource,
    prepareWorking:(config,output)=>nativeTests.prepareWorking(config,output),
    config:classConfig,output:publishOutput,isBusy:()=>publishing,
    setBusy:async value=>{publishing=value;await vscode.commands.executeCommand('setContext','jadeNative.publishing',value);},
    settings:folder=>Object.fromEntries(Object.entries(defaults(folder.uri)).map(([key,value])=>[key,expand(value,folder)]))
  });
  require('./collection-designer').registerCollections(vscode,context);
  require('./creation-designer').registerCreationDesigner(vscode,context,{
    settings:folder=>Object.fromEntries(Object.entries(defaults(folder.uri)).map(([key,value])=>[key,expand(value,folder)]))
  });
  require('./application-debug-ui').registerApplicationDebug(vscode,context);
  require('./debugger').registerDebugger(vscode,context,{
    beforeOperation,config:classConfig,workingFiles,startWorking,prepareWorking:(config,output)=>nativeTests.prepareWorking(config,output),isBusy:()=>publishing,
    setBusy:async value=>{publishing=value;await vscode.commands.executeCommand('setContext','jadeNative.publishing',value);}
  });
  objectExplorer=require('./object-explorer').registerObjectExplorer(vscode,context,{
    config:inspectionConfig,client:nativeTests,isBusy:()=>publishing,
    pullSource:({projectRoot}={})=>{
      if(!projectRoot)throw Error('Choose the originating project before pulling source.');
      return vscode.commands.executeCommand('jadeNative.extractAllSources',vscode.Uri.file(projectRoot));
    },
    sourceContext:async({projectRoot,schema,className})=>{
      await language.index.ready();await language.index.flush();
      const entries=(language.index.project.groups.get(schema+'::'+className)||[]).filter(entry=>!projectRoot||vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(entry.model.uri))?.uri.fsPath===projectRoot);
      const complete=entries.filter(entry=>!entry.cls.partial),files=[...new Set(entries.map(entry=>entry.model.uri))];
      if(!entries.length)return {available:false,reason:'No matching workspace source is indexed. Runtime values remain available.'};
      if(complete.length>1||!complete.length&&files.length!==1)return {available:false,reason:'Workspace source ownership is ambiguous. Runtime values remain available.'};
      const file=(complete[0]||entries[0]).model.uri,contributing=new Set(files);
      return {available:true,file,dirty:vscode.workspace.textDocuments.some(document=>contributing.has(document.uri.toString())&&document.isDirty)};
    },
    inspectionTarget:(config,selection,output)=>nativeTests.inspectionTarget(config,selection,output),workingLocation:config=>nativeTests.workingLocation(config)
  });
  const workspaceOperationGuard=new (require('./WorkspaceOperationGuard').WorkspaceOperationGuard)({
    isBusy:()=>publishing,
    claim:value=>{publishing=value;},
    updateContext:value=>vscode.commands.executeCommand('setContext','jadeNative.publishing',value)
  });
  const workspaces=require('./jade-workspaces').registerWorkspaces(vscode,context,{
    client:nativeTests,
    configFor:(_document,scope)=>inspectionConfig({uri:scope.configurationResource},scope.folder),
    schemaChoices:async scope=>{
      await language.index.ready();await language.index.flush();const schemas=new Map();
      for(const model of language.index.project.models.values())if(model.schema&&vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(model.uri))?.uri.toString()===scope.folder.uri.toString())schemas.set(model.schema,{name:model.schema,parent:model.parentSchema});
      return [...schemas.values()].sort((a,b)=>a.name.localeCompare(b.name));
    },
    beforeOperation:()=>workspaceOperationGuard.acquire(),
    afterOperation:lease=>workspaceOperationGuard.release(lease)
  });
  language.setWorkspaceSchemaResolver(workspaces.schemaFor);
  language.setWorkspaceResourceResolver(workspaces.resourceFor);
  require('./compile-commands').registerCompileCommands(vscode, context, {
    beforeOperation: async () => {},
    isBusy: () => publishing,
    setBusy: async value => { publishing = value; await vscode.commands.executeCommand('setContext', 'jadeNative.publishing', value); },
    resolveSource,classConfig, workingFiles, startWorking, nativeTests, output: compileOutput, diagnostics, reportDiagnostic
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
      try { const document=await resolveSource(uri);if(!document)throw Error('Open a saved CLS test class.');return await testing.runFile(document.uri, method); }
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
      const document = await resolveSource(uri);
      if (publishing) { void vscode.window.showErrorMessage('A Jade operation is already running.'); return; }
      publishing = true;
      try {
        await vscode.commands.executeCommand('setContext', 'jadeNative.publishing', true);
        if (!document || document.uri.scheme !== 'file' || !/\.cls$/i.test(document.uri.fsPath)) throw new Error('Open a saved CLS test class.');
        if (document.isDirty && !await document.save()) throw new Error('Save the test file before running.');
        const config = classConfig(document);
        testOutput.clear(); testOutput.show(true);
        diagnostics.delete(document.uri);
        testOutput.appendLine(`Running local tests from ${path.basename(config.program)} (no publish).`);
        testOutput.appendLine('Native Jade compiles and runs workspace source in an isolated working database. The configured publish target is not updated.');
        await workingFiles(config);
        const operation = startWorking({...config, methods: method,testSession:nativeTests}, 'test.run', text => {
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
    vscode.commands.registerCommand('jadeNative.refreshTypeCache', async uri => {
      const document = await resolveSource(uri);
      await beforeOperation();
      if (publishing) { void vscode.window.showErrorMessage('A Jade compile, publish or refresh is already running.'); return; }
      publishing = true;
      try {
        await vscode.commands.executeCommand('setContext', 'jadeNative.publishing', true);
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
    vscode.commands.registerCommand('jadeNative.publishClass', async uri => {
      let document;
      try{document=await resolveSource(uri);}catch(error){publishOutput.appendLine(error.message);publishOutput.show(true);void vscode.window.showErrorMessage(error.message);return {success:false,error:error.message};}
      await beforeOperation();
      if(/\.(scm|sec|ddx|jcf)$/i.test(document?.uri.fsPath||''))return vscode.commands.executeCommand('jadeNative.publishWorkspace',document.uri);
      const activeFolder=document&&vscode.workspace.getWorkspaceFolder(document.uri);
      if(activeFolder&&(await require('./native-project').scanProject(activeFolder.uri.fsPath)).migrations.length)return vscode.commands.executeCommand('jadeNative.publishWorkspace',document.uri);
      if (publishing) { await vscode.window.showErrorMessage('A Jade class publish is already running.'); return; }
      publishing = true;
      try {
        if (process.platform !== 'win32') throw new Error('Jade class publishing requires Windows.');
        if (!document || document.uri.scheme !== 'file' || !/\.cls$/i.test(document.uri.fsPath)) throw new Error('Open a saved .cls class file to publish.');
        if (document.isDirty && !await document.save()) throw new Error('The class file could not be saved; nothing was published.');
        const folder = vscode.workspace.getWorkspaceFolder(document.uri);
        const settings = Object.fromEntries(Object.entries(defaults(document.uri)).map(([key, value]) => [key, expand(value, folder, document.uri)]));
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
    vscode.commands.registerCommand('jadeNative.recreateWorkingDatabase', async uri => {
      const document=await resolveSource(uri);
      if(!publishing)await nativeTests.release();
      await beforeOperation();
      if(publishing)throw new Error('A Jade operation is already running.');
      if(!document)throw new Error('Open a CLS file first.');
      const config=classConfig(document);
      if(config.workingDatabaseDirectory)throw new Error('Choose a new empty jadeNative.workingDatabaseDirectory to recreate a custom working base. The previous base is retained.');
      await context.workspaceState.update('jadeNative.workingDatabaseGeneration',require('node:crypto').randomUUID());
      compileOutput.appendLine('A fresh native working database will be created on the next compile or test. The previous working base is retained.');compileOutput.show(true);
    }),
    vscode.commands.registerCommand('jadeNative.showWorkingDatabase', async uri => {
      const document=await resolveSource(uri);
      if(!document)throw new Error('Open a CLS file first.');
      const config=classConfig(document),location=await nativeTests.workingLocation(config);
      if(!fs.existsSync(location.root))throw new Error('Compile or run tests first to create the working database.');
      await vscode.commands.executeCommand('revealFileInOS',vscode.Uri.file(location.databasePath));
    }),
    vscode.commands.registerCommand('jadeNative.discover', detectSettingsCommand),
    vscode.commands.registerCommand('jadeNative.checkFile', () => vscode.commands.executeCommand('jadeNative.compileClass'))
  );
  return {classView,objectExplorer,testing,nativeTests,workspaces,sourcePull};
}

function deactivate(){return activeNativeService?.dispose();}
module.exports = { activate, deactivate };
