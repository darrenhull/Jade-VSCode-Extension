'use strict';
const {diagnosticLines}=require('./compiler-diagnostic-presentation');
function registerNativeSourceTesting(vscode, context, workspace, { reportDiagnostic = () => {} } = {}) {
  if (!vscode.tests) return {};
  const controller = vscode.tests.createTestController('jadeNative.tests', 'Jade Local Tests');
  const details = new WeakMap();
  const output = vscode.window.createOutputChannel('Jade Tests');
  context.subscriptions.push(controller, output);
  let discovering;
  async function discover({ project: selectedProject, prepare = true } = {}) {
    if (discovering) return discovering;
    discovering = (async () => {
      const roots = [];
      for (const folder of selectedProject ? [selectedProject.folder] : workspace.folders()) {
        const project = prepare ? await workspace.prepare(folder) : workspace.project(folder);
        if (!project.provider.snapshot) continue;
        const root = controller.createTestItem(folder.uri.toString(), folder.name);
        roots.push(root);
        let offset = 0;
        do {
          const page = await project.provider.query({ kind: 'test', offset, limit: 100 });
          for (const entity of page.items) {
            if (!entity.testIdentity?.schema || !entity.testIdentity.class || !entity.testIdentity.method)
              throw Error('The native source provider returned an incomplete test identity.');
            const item = controller.createTestItem(JSON.stringify([folder.uri.toString(), entity.id]), entity.qualifiedName
              ? [entity.qualifiedName.schema, entity.qualifiedName.type, entity.qualifiedName.member].filter(Boolean).join('::') : entity.name);
            details.set(item, { project, entity });
            root.children.add(item);
          }
          offset = page.nextOffset;
        } while (offset !== null);
      }
      if (selectedProject) roots.forEach(root => controller.items.add(root)); else controller.items.replace(roots);
    })();
    try { return await discovering; } finally { discovering = undefined; }
  }
  let refreshing = Promise.resolve();
  const refreshProject = project => {
    const operation = refreshing.then(async () => { if (discovering) await discovering; return discover({ project, prepare: false }); });
    refreshing = operation.catch(() => {});
    return operation;
  };
  controller.resolveHandler = discover;
  controller.refreshHandler = discover;
  const leaves = request => {
    const selected = new Map(), excluded = new Set((request.exclude || []).map(item => item.id));
    const visit = item => { if (excluded.has(item.id)) return; if (details.has(item)) selected.set(item.id, item); else item.children.forEach(visit); };
    if (request.include) request.include.forEach(visit); else controller.items.forEach(visit);
    return [...selected.values()];
  };
  let running = false;
  async function run(request, token) {
    if (running) throw Error('A Jade test operation is already running.');
    running = true;
    const run = controller.createTestRun(request);
    token ||= run.token;
    const reported = new Set();
    const report = (project, result) => {
      if(reported.has(result))return;
      reported.add(result);reportDiagnostic(project,result);
      for(const entry of Array.isArray(result.report?.diagnostics)?result.report.diagnostics:[]) {
        if(!entry||typeof entry!=='object')continue;
        for(const line of diagnosticLines(entry)){run.appendOutput(line+'\r\n');output.appendLine(line);}
      }
    };
    const selected = leaves(request);
    let lastResult;
    selected.forEach(item => run.enqueued(item));
    const groups = new Map();
    for (const item of selected) {
      const { project, entity } = details.get(item), identity = entity.testIdentity;
      const key = JSON.stringify([project.folder.uri.toString(), identity.schema, identity.class]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    try {
      const projects = new Map();
      for (const items of groups.values()) {
        const { project } = details.get(items[0]);
        if (!projects.has(project)) projects.set(project, []);
        projects.get(project).push(items);
      }
      for (const [project, batches] of projects) {
        if (token?.isCancellationRequested) { batches.flat().forEach(item => run.skipped(item)); continue; }
        batches.flat().forEach(item => run.started(item));
        let results;
        try {
          results = await workspace.executeBatch(project, 'test', batches.map(items => {
            const identity = details.get(items[0]).entity.testIdentity;
            return { selection: { entityIds: items.map(item => details.get(item).entity.id) },
              settings: { schema: identity.schema, methods: items.map(item => details.get(item).entity.testIdentity.method),
                ...(items.length === 1 ? { testIdentity: identity } : {}) } };
          }), { token, output: text => run.appendOutput(text.replace(/\r?\n/g, '\r\n')) });
        } catch (error) { results = batches.map(() => ({ error })); }
        for (let index = 0; index < batches.length; index++) {
          const items = batches[index], entry = results[index];
          if (entry?.error || !entry?.result) {
            const error = entry?.error || Error('Native test operation did not return a result.');
            lastResult = error.result || { passed: false, code: 2, report: { error: error.message } };
            report(project, lastResult);
            items.forEach(item => run.errored(item, new vscode.TestMessage(error.message)));
            continue;
          }
          const result = lastResult = entry.result;
          report(project, result);
          for (const item of items) {
            const identity = details.get(item).entity.testIdentity;
            const outcome = result.report?.results?.find(value => value.method === identity.method &&
              (!value.schema || value.schema === identity.schema) && (!value.class || value.class === identity.class));
            if (result.cancelled) run.skipped(item);
            else if (!result.report?.tests_completed || !result.report?.cleanup_complete || !outcome)
              run.errored(item, new vscode.TestMessage(result.report?.error || 'Native test completion and cleanup were not confirmed.'));
            else if (outcome.status === 'passed') run.passed(item);
            else if (outcome.status === 'skipped') run.skipped(item);
            else run.failed(item, new vscode.TestMessage(outcome.message || 'Native Jade test failed.'));
          }
        }
      }
    } finally { run.end(); running = false; }
    return lastResult;
  }
  controller.createRunProfile('Run Jade tests locally', vscode.TestRunProfileKind.Run, run, true);
  context.subscriptions.push(vscode.commands.registerCommand('jadeNative.refreshTests', discover));
  const runFile = async (uri, methods) => {
    const { project, document } = workspace.record(uri);
    const matching = () => {
      const selected = [];
      controller.items.forEach(root => root.children.forEach(item => {
        const value = details.get(item), entity = value?.entity;
        if (value?.project === project && (entity.id === document.entityId || entity.parentId === document.entityId) &&
            (!methods || (Array.isArray(methods) ? methods : [methods]).includes(entity.testIdentity.method))) selected.push(item);
      }));
      return selected;
    };
    let selected = matching();
    if (!selected.length) { await discover(); selected = matching(); }
    if (!selected.length) throw Error('No runnable native tests were found for the selected source.');
    return run({ include: selected });
  };
  return { controller, discover, refreshProject, run, runFile };
}
module.exports = { registerNativeSourceTesting };
