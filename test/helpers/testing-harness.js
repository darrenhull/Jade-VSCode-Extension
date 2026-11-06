'use strict';
function testingHarness() {
  class Collection extends Map {
    add(item) { this.set(item.id, item); }
    replace(items) { this.clear(); items.forEach(item => this.add(item)); }
  }
  class TestMessage { constructor(message) { this.message = message; } }
  class TestRunRequest { constructor(include, exclude) { Object.assign(this, { include, exclude }); } }
  class Range { constructor(start, end, endLine, endCharacter) {
    if (typeof start === 'number') { this.start = { line: start, character: end }; this.end = { line: endLine, character: endCharacter }; }
    else Object.assign(this, { start, end });
  } }
  class Location { constructor(uri, range) { Object.assign(this, { uri, range }); } }
  const disposable = () => ({ dispose() {} });
  const runs = [];
  const controller = {
    items: new Collection(), dispose() {},
    createTestItem(id, label, uri) { return { id, label, uri, children: new Collection() }; },
    createRunProfile(name, kind, handler) { this.handler = handler; return disposable(); },
    createTestRun(request) {
      const states = [], output = [];
      const run = { request, states, output, token: { isCancellationRequested: false, onCancellationRequested: disposable },
        appendOutput(text) { output.push(text); }, end() { this.ended = true; } };
      for (const status of ['enqueued', 'started', 'passed', 'failed', 'errored', 'skipped']) run[status] = (item, message) => states.push({ status, method: item.label, message });
      runs.push(run); return run;
    }
  };
  return { controller, runs, api: { tests: { createTestController: () => controller }, TestMessage, TestRunRequest,
    Range, Location, Uri: { file: fsPath => ({ fsPath, scheme: 'file', toString: () => 'file:///' + fsPath }) }, TestRunProfileKind: { Run: 1 } } };
}
module.exports = { testingHarness };
