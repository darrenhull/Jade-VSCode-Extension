'use strict';
const path = require('node:path');
const { testLenses } = require('./local-tests');
const { isNestedSnapshot } = require('./source-snapshots');
const { sourcePosition } = require('./source_symbols');

function registerTesting(vscode, context, execute, sourceIndex, debugExecute) {
  // Allows the command transport to be exercised outside the extension host.
  if (!vscode.tests) return { runFile: execute };
  const controller = vscode.tests.createTestController('jadeNative.tests', 'Jade Local Tests');
  context.subscriptions.push(controller);
  const details = new WeakMap();
  const classes = new Map();
  let discovering;
  function update(document) {
    if (document.uri.scheme !== 'file' || !/\.cls$/i.test(document.uri.fsPath)) return;
    if (sourceIndex?.bulkUpdating && !document.isDirty) return;
    if (isNestedSnapshot(document.uri, vscode.workspace)) return;
    const entries = testLenses(document.getText());
    const text = document.getText();
    const schema = /^\s*(\w+)\s+subschemaOf\b/m.exec(text)?.[1] || '';
    const owner = /^\s*(\w+)\s+(?:subclassOf|completeDefinition|partialDefinition)\b/m.exec(text)?.[1];
    return updateFile(document.uri, schema, owner, entries, offset => document.positionAt(offset));
  }
  function updateModel(model) {
    const uri = vscode.Uri.parse(model.uri);
    if (uri.scheme !== 'file' || !/\.cls$/i.test(uri.fsPath) || isNestedSnapshot(uri, vscode.workspace)) return;
    const cls = model.classes[0];
    const entries = (cls?.members || []).filter(member => member.bodyStart !== undefined && /\bunitTest\b/i.test(member.flags || '') && !/\bunitTestIgnore\b/i.test(member.flags || '')).map(member => ({method:member.name,offset:member.selection}));
    return updateFile(uri, model.schema || '', cls?.name, entries, offset => sourcePosition(model, offset));
  }
  function updateFile(uri, schema, owner, entries, positionAt) {
    const id = uri.toString();
    classes.set(id, schema + '::' + owner);
    if (!entries.length) { controller.items.delete(id); return; }
    let file = controller.items.get(id);
    if (!file) file = controller.createTestItem(id, path.basename(uri.fsPath), uri);
    const children = [];
    for (const entry of entries.filter(entry => entry.method)) {
      const testId = id + '#' + entry.method;
      const item = file.children.get(testId) || controller.createTestItem(testId, entry.method, uri);
      const position = positionAt(entry.offset);
      item.range = new vscode.Range(position, position);
      details.set(item, { uri, method: entry.method, classKey: classes.get(id) });
      children.push(item);
    }
    file.children.replace(children);
    file.error = undefined;
    controller.items.add(file);
    return file;
  }
  async function discover(rescan = false) {
    if (discovering) { await discovering; return rescan ? discover(true) : undefined; }
    discovering = (async () => {
      if (sourceIndex) {
        if (rescan && sourceIndex.rescan) await sourceIndex.rescan();
        else await sourceIndex.ready();
        await sourceIndex.flush?.();
        const present = new Set(sourceIndex.project.models.keys());
        controller.items.forEach(item => { if (!present.has(item.id)) { controller.items.delete(item.id); classes.delete(item.id); } });
        for (const model of sourceIndex.project.models.values()) updateModel(model);
        return;
      }
      const uris = await vscode.workspace.findFiles('**/*.cls', '**/{node_modules,.git}/**');
      for (const uri of uris) {
        try { update(await vscode.workspace.openTextDocument(uri)); }
        catch (error) { const item = controller.items.get(uri.toString()); if (item) item.error = error.message; }
      }
    })();
    try { await discovering; } finally { discovering = undefined; }
  }
  controller.resolveHandler = async () => discover();
  controller.refreshHandler = async () => discover(true);
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.cls');
  async function changed(uri) {
    try {
      if (!sourceIndex) return update(await vscode.workspace.openTextDocument(uri));
      sourceIndex.schedule(uri.toString());
      if (sourceIndex.bulkUpdating) return;
      await sourceIndex.flush();
      const model = sourceIndex.project.models.get(uri.toString());
      if (model) updateModel(model);
    } catch {}
  }
  context.subscriptions.push(watcher,
    watcher.onDidCreate(changed),
    watcher.onDidChange(changed),
    watcher.onDidDelete(uri => { if(sourceIndex?.bulkUpdating){sourceIndex.schedule(uri.toString());return;} controller.items.delete(uri.toString()); classes.delete(uri.toString()); }),
    vscode.workspace.onDidOpenTextDocument(update),
    vscode.workspace.onDidChangeTextDocument(event => update(event.document)));
  for (const document of vscode.workspace.textDocuments) update(document);
  void discover().catch(error => { void vscode.window.showErrorMessage('Jade test discovery failed: ' + error.message); });

  function leaves(request) {
    const selected = new Map();
    const excluded = new Set((request.exclude || []).map(item => item.id));
    function collect(item) {
      if (excluded.has(item.id)) return;
      if (details.has(item)) selected.set(item.id, item);
      else item.children.forEach(collect);
    }
    if (request.include) request.include.forEach(collect);
    else controller.items.forEach(collect);
    return [...selected.values()];
  }
  async function runRequest(request, token, debugging = false) {
    await discover();
    const run = controller.createTestRun(request);
    token ||= run.token;
    const queue = leaves(request);
    const groups = new Map();
    for (const item of queue) {
      run.enqueued(item);
      const data = details.get(item), key = debugging ? item.id : data.classKey;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    let lastResult;
    try {
      for (const items of groups.values()) {
        if (token?.isCancellationRequested) { items.forEach(item => run.skipped(item)); continue; }
        items.forEach(item => run.started(item));
        const data = details.get(items[0]);
        const names = items.map(item => details.get(item).method);
        let result;
        try {
          const runner=debugging?debugExecute:execute;
          result = await runner(data.uri, debugging?names[0]:names, token || run.token, text => run.appendOutput(text.replace(/\r?\n/g, '\r\n')));
        } catch (error) { result = { passed: false, error: error.message }; }
        lastResult = result;
        const results = new Map((result?.report?.results || []).map(entry => [entry.method, entry]));
        for (const item of items) {
          if (result?.cancelled || token?.isCancellationRequested) { run.skipped(item); continue; }
          const outcome = results.get(details.get(item).method);
          if (!result?.report?.tests_completed || !result?.report?.cleanup_complete || !outcome) {
            const message = result?.report?.error || result?.error || (result?.timedOut ? 'Native test run timed out.' : 'Native test run did not produce a complete method result.');
            run.errored(item, new vscode.TestMessage(message));
          } else if (outcome.status === 'passed') run.passed(item);
          else if (outcome.status === 'skipped') run.skipped(item);
          else {
            const message = new vscode.TestMessage(outcome.message || 'Native Jade test failed.');
            message.location = outcome.source ? new vscode.Location(vscode.Uri.file(outcome.source),
              new vscode.Range(Math.max(0, outcome.line - 1), Math.max(0, (outcome.column || 1) - 1), Math.max(0, outcome.line - 1), Math.max(0, (outcome.column || 1) - 1))) : new vscode.Location(item.uri, item.range);
            run.failed(item, message);
          }
        }
      }
    } finally { run.end(); }
    return lastResult;
  }
  controller.createRunProfile('Run Jade tests locally', vscode.TestRunProfileKind.Run, runRequest, true);
  if(debugExecute)controller.createRunProfile('Debug Jade tests locally',vscode.TestRunProfileKind.Debug,(request,token)=>runRequest(request,token,true),true);
  async function runFile(uri, methods, debugging = false) {
    if (!uri) throw new Error('Open a CLS test class first.');
    await discover();
    let file = update(await vscode.workspace.openTextDocument(uri));
    if (!file && !methods) controller.items.forEach(item => { if (classes.get(item.id) === classes.get(uri.toString())) file ||= item; });
    if (!file) throw new Error('No runnable Jade tests were found in this file.');
    let include = [];
    controller.items.forEach(item => { if (classes.get(item.id) === classes.get(file.id)) include.push(item); });
    if (methods) {
      const names = Array.isArray(methods) ? methods : [methods];
      include = names.map(name => file.children.get(file.id + '#' + name));
      if (include.some(item => !item)) throw new Error('The selected Jade test was not found.');
    }
    return runRequest(new vscode.TestRunRequest(include),undefined,debugging);
  }
  function summary() {
    let tests = 0; const files = [],entries=[];
    controller.items.forEach(item => { files.push(item.uri.fsPath); item.children.forEach(child => {tests++;const data=details.get(child);entries.push({key:data.classKey+'::'+data.method,source:data.uri.fsPath,method:data.method});}); });
    return { tests, files, entries };
  }
  return { controller, runFile, debugFile:(uri,methods)=>runFile(uri,methods,true), discover, summary };
}

module.exports = { registerTesting };
