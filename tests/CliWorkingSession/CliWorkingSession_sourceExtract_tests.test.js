"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { EventEmitter } = require("node:events");
const { CliWorkingSession } = require("../../extension/src/cli-client");
const sha = "a".repeat(64),
  selection = [
    {
      schema: "Pets",
      name: "Fish",
      kind: "class",
      path: "schemas/Pets/types/Fish.cls",
    },
  ];
function fixture() {
  const requests = [],
    children = [];
  const session = new CliWorkingSession({
    entry: "jade-cli.exe",
    spawn: () => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = new EventEmitter();
      child.stdin.write = (line) => {
        requests.push(JSON.parse(line));
        return true;
      };
      child.kill = () => {
        child.killed = true;
      };
      children.push(child);
      return child;
    },
  });
  return {
    session,
    requests,
    children,
    emit: (packet) =>
      children[0].stdout.emit(
        "data",
        Buffer.from(JSON.stringify(packet) + "\n"),
      ),
  };
}
const turn = () => new Promise(setImmediate);
function started(f, id, lease = "owned") {
  f.emit({
    id,
    event: "source.started",
    lease,
    scope: "classes",
    authoritative: false,
  });
}
function finish(f, id, status = "completed", counts = { added: 1 }) {
  f.emit({
    id,
    event: "result",
    result: {
      passed: status === "completed",
      code: status === "completed" ? 0 : 2,
      status,
      scope: "classes",
      version: "current",
      authoritative: false,
      partial: status !== "completed",
      counts,
      completedFiles: 1,
    },
  });
}
test("typed extraction events use the same service and owner-bound permit controls", async () => {
  const f = fixture(),
    events = [];
  const op = f.session.startSourceExtraction(
    {},
    { destination: "C:/workspace", selection },
    {
      onPermit: (event) => {
        events.push(event.path);
        return true;
      },
      onFile: (event) => events.push(event.outcome),
    },
  );
  const id = f.requests[0].id;
  assert.equal(f.requests[0].command, "source.extract");
  assert.equal(f.requests[0].promotion, "client");
  assert.equal(f.requests[0].version, "current");
  started(f, id);
  f.emit({
    id,
    event: "source.permitRequired",
    lease: "owned",
    ticket: "one",
    path: selection[0].path,
    expiresInMs: 30000,
  });
  const permit = f.requests.at(-1);
  assert.equal(permit.command, "source.permit");
  assert.equal(permit.lease, "owned");
  assert.equal(permit.ticket, "one");
  assert.equal(permit.allow, true);
  assert.equal(permit.operationId, undefined);
  f.emit({ id: permit.id, event: "result", result: { passed: true, code: 0 } });
  f.emit({
    id,
    event: "source.file",
    path: selection[0].path,
    outcome: "added",
    sha256: sha,
    bytes: 12,
  });
  finish(f, id);
  assert.equal((await op.completion).passed, true);
  assert.deepEqual(events, [selection[0].path, "added"]);
  assert.equal(f.children.length, 1);
  f.session.dispose();
});
test("cancel before lease targets request id, after lease uses source.cancel", async () => {
  const f = fixture();
  const op = f.session.startSourceExtraction(
    {},
    { destination: "C:/workspace", selection },
    { onPermit: () => true },
  );
  const id = f.requests[0].id;
  op.stop();
  assert.deepEqual(f.requests.at(-1).command, "cancel");
  assert.equal(f.requests.at(-1).operationId, id);
  started(f, id);
  await turn();
  assert.ok(
    f.requests.some(
      (row) => row.command === "source.cancel" && row.lease === "owned",
    ),
  );
  f.emit({
    id,
    event: "result",
    result: {
      passed: false,
      code: 130,
      status: "cancelled",
      scope: "classes",
      version: "current",
      authoritative: false,
      partial: false,
      counts: {},
      completedFiles: 0,
    },
  });
  assert.equal((await op.completion).status, "cancelled");
  f.session.dispose();
});
test("foreign lease never receives permission and cancels the owned operation", async () => {
  const f = fixture();
  let called = 0;
  const op = f.session.startSourceExtraction(
    {},
    { destination: "C:/workspace", selection },
    {
      onPermit: () => {
        called++;
        return true;
      },
    },
  );
  const id = f.requests[0].id;
  started(f, id);
  f.emit({
    id,
    event: "source.permitRequired",
    lease: "foreign",
    ticket: "one",
    path: selection[0].path,
    expiresInMs: 30000,
  });
  assert.equal(called, 0);
  assert.ok(
    f.requests.some(
      (row) => row.command === "source.cancel" && row.lease === "owned",
    ),
  );
  assert.ok(!f.requests.some((row) => row.command === "source.permit"));
  f.emit({
    id,
    event: "result",
    result: {
      passed: false,
      code: 6023,
      status: "failed",
      scope: "classes",
      version: "current",
      authoritative: false,
      partial: false,
      counts: {},
      completedFiles: 0,
      report: { error: "Original native error" },
    },
  });
  const result = await op.completion;
  assert.equal(result.code, 6023);
  assert.match(result.report.error, /Original native error/);
  f.session.dispose();
});
test("lost transport reports potentially partial state without reconnecting to grant permission", async () => {
  const f = fixture();
  const op = f.session.startSourceExtraction(
    {},
    { destination: "C:/workspace", selection },
    { onPermit: () => true },
  );
  started(f, f.requests[0].id);
  f.children[0].emit("close", 2);
  const result = await op.completion;
  assert.equal(result.passed, false);
  assert.equal(result.indeterminate, true);
  assert.equal(result.partial, true);
  op.stop();
  assert.equal(f.children.length, 1);
  f.session.dispose();
});
test("normal disposal cancels and waits for native result before closing service", async () => {
  const f = fixture();
  const op = f.session.startSourceExtraction(
    {},
    { destination: "C:/workspace", selection },
    { onPermit: () => false },
  );
  const id = f.requests[0].id;
  started(f, id);
  const closing = f.session.dispose();
  assert.ok(f.requests.some((row) => row.command === "source.cancel"));
  assert.ok(!f.children[0].killed);
  f.emit({
    id,
    event: "result",
    result: {
      passed: false,
      code: 130,
      status: "cancelled",
      scope: "classes",
      version: "current",
      authoritative: false,
      partial: false,
      counts: {},
      completedFiles: 0,
    },
  });
  await closing;
  assert.equal(f.children[0].killed, true);
  assert.equal((await op.completion).status, "cancelled");
});

test("a granted file already promoted when cancellation arrives remains an honest applied prefix", async () => {
  const f = fixture();
  const op = f.session.startSourceExtraction(
    {},
    { destination: "C:/workspace", selection },
    { onPermit: () => true },
  );
  const id = f.requests[0].id;
  started(f, id);
  f.emit({
    id,
    event: "source.permitRequired",
    lease: "owned",
    ticket: "one",
    path: selection[0].path,
    expiresInMs: 30000,
  });
  op.stop();
  f.emit({
    id,
    event: "source.file",
    path: selection[0].path,
    outcome: "added",
    sha256: sha,
    bytes: 12,
  });
  finish(f, id, "cancelled");
  const result = await op.completion;
  assert.equal(result.status, "cancelled");
  assert.equal(result.completedFiles, 1);
  assert.equal(result.counts.added, 1);
  assert.equal(result.indeterminate, undefined);
  f.session.dispose();
});

test("selection metadata can exceed 30k without an artificial adapter count ceiling", async () => {
  const f = fixture(),
    many = Array.from({ length: 30001 }, (_, i) => ({
      schema: "Pets",
      name: "C" + i,
      kind: "class",
      path: "types/C" + i + ".cls",
    }));
  const op = f.session.startSourceExtraction(
    {},
    { destination: "C:/workspace", selection: many },
    { onPermit: () => false },
  );
  const id = f.requests[0].id;
  assert.equal(f.requests[0].selection.length, 30001);
  op.stop();
  f.emit({
    id,
    event: "result",
    result: {
      passed: false,
      code: 130,
      status: "cancelled",
      scope: "classes",
      version: "current",
      authoritative: false,
      partial: false,
      counts: {},
      completedFiles: 0,
    },
  });
  assert.equal((await op.completion).status, "cancelled");
  f.session.dispose();
});

test("selected class companion DDX has its own dirty veto and acknowledged outcome", async () => {
  const f = fixture(),
    ddx = selection[0].path.replace(/\.cls$/i, ".ddx"),
    op = f.session.startSourceExtraction(
      {},
      { destination: "C:/workspace", selection },
      { onPermit: (event) => !event.path.endsWith(".ddx") },
    );
  const id = f.requests[0].id;
  started(f, id);
  f.emit({
    id,
    event: "source.stage",
    stage: "inventory",
    completedFiles: 0,
    totalFiles: 2,
  });
  f.emit({
    id,
    event: "source.file",
    path: selection[0].path,
    outcome: "unchanged",
    sha256: sha,
    bytes: 12,
  });
  f.emit({
    id,
    event: "source.permitRequired",
    lease: "owned",
    ticket: "ddx",
    path: ddx,
    expiresInMs: 30000,
  });
  const permit = f.requests.at(-1);
  assert.equal(permit.command, "source.permit");
  assert.equal(permit.allow, false);
  f.emit({ id: permit.id, event: "result", result: { passed: true, code: 0 } });
  f.emit({
    id,
    event: "source.file",
    path: ddx,
    outcome: "rejected",
    sha256: sha,
    bytes: 12,
  });
  f.emit({
    id,
    event: "result",
    result: {
      passed: false,
      code: 4,
      status: "completed",
      scope: "classes",
      version: "current",
      authoritative: false,
      partial: true,
      counts: { unchanged: 1, rejected: 1 },
      completedFiles: 2,
    },
  });
  const value = await op.completion;
  assert.equal(value.code, 4);
  assert.equal(value.completedFiles, 2);
  assert.equal(value.clientError, undefined);
  f.session.dispose();
});

test("declared Form companion cannot disappear from a successful completion",async()=>{
 const f=fixture(),op=f.session.startSourceExtraction({}, {destination:"C:/workspace",selection},{onPermit:()=>true});const id=f.requests[0].id;started(f,id);f.emit({id,event:"source.stage",stage:"inventory",completedFiles:0,totalFiles:2});f.emit({id,event:"source.file",path:selection[0].path,outcome:"unchanged",sha256:sha,bytes:12});finish(f,id,"completed",{unchanged:1});const value=await op.completion;assert.equal(value.passed,false);assert.equal(value.indeterminate,true);f.session.dispose();
});
test("an interface cannot authorize a same-stem DDX companion",async()=>{
 const f=fixture();let permits=0;const op=f.session.startSourceExtraction({}, {destination:"C:/workspace",selection:[{...selection[0],kind:"interface"}]},{onPermit:()=>{permits++;return true;}});const id=f.requests[0].id;started(f,id);f.emit({id,event:"source.permitRequired",lease:"owned",ticket:"ddx",path:selection[0].path.replace(/\.cls$/i,".ddx"),expiresInMs:30000});assert.equal(permits,0);assert.equal(f.requests.at(-1).command,"source.cancel");f.emit({id,event:"result",result:{passed:false,code:130,status:"cancelled",scope:"classes",version:"current",authoritative:false,partial:false,counts:{},completedFiles:0}});await op.completion;f.session.dispose();
});

test('native reconciliation progress stages preserve extraction ownership and completion',async()=>{
 const f=fixture(),seen=[];const op=f.session.startSourceExtraction({}, {destination:'C:/workspace',selection},{onPermit:()=>true,onStage:event=>seen.push(event.stage)});const id=f.requests[0].id;started(f,id);
 for(const stage of ['opening','git-baseline','inventory','local-snapshot','native-write','hash-and-compare','guarded-apply','closing'])f.emit({id,event:'source.stage',stage,completedFiles:0,totalFiles:1});
 f.emit({id,event:'source.file',path:selection[0].path,outcome:'unchanged',sha256:sha,bytes:12});finish(f,id,'completed',{unchanged:1});const result=await op.completion;assert.equal(result.passed,true,JSON.stringify(result));assert.deepEqual(seen,['opening','git-baseline','inventory','local-snapshot','native-write','hash-and-compare','guarded-apply','closing']);await f.session.dispose();
});