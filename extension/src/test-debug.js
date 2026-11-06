"use strict";
const crypto = require("node:crypto");
function registerTestDebugging(vscode, context) {
  const jobs = new Map();
  const finish = (job, result) => {
    if (!jobs.has(job.id)) return;
    jobs.delete(job.id);
    job.cancelSubscription?.dispose();
    job.resolve(result);
  };
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterTrackerFactory(
      "jade-native-experimental",
      {
        createDebugAdapterTracker(session) {
          const job = jobs.get(session.configuration.jadeTestRunId);
          if (!job) return;
          job.session = session;
          if (job.cancelled) void vscode.debug.stopDebugging(session);
          return {
            onDidSendMessage(message) {
              if (message.type !== "event") return;
              if (message.event === "output")
                job.output?.(message.body?.output || "");
              if (
                message.event === "exited" &&
                Number.isInteger(message.body?.exitCode)
              )
                job.exitCode = message.body.exitCode;
            },
            onError(error) {
              job.error = error.message;
            },
          };
        },
      },
    ),
    vscode.debug.onDidTerminateDebugSession((session) => {
      const job = jobs.get(session.configuration.jadeTestRunId);
      if (!job) return;
      if (job.cancelled) return finish(job, { passed: false, cancelled: true });
      if (job.exitCode === undefined)
        return finish(job, {
          passed: false,
          error:
            job.error ||
            "Native test debugging ended without a complete test result.",
        });
      const passed = job.exitCode === 0;
      finish(job, {
        passed,
        report: {
          tests_completed: true,
          cleanup_complete: true,
          results: [
            {
              method: job.method,
              status: passed ? "passed" : "failed",
              message: passed
                ? undefined
                : "Native Jade test failed, including any setup or teardown failure. See the debug output.",
            },
          ],
        },
      });
    }),
    {
      dispose() {
        for (const job of [...jobs.values()])
          finish(job, { passed: false, cancelled: true });
      },
    },
  );
  return async (uri, method, token, output) => {
    if (token?.isCancellationRequested)
      return { passed: false, cancelled: true };
    const id = crypto.randomUUID();
    let resolve;
    const completion = new Promise((value) => {
      resolve = value;
    });
    const job = { id, uri, method, output, resolve };
    jobs.set(id, job);
    job.cancelSubscription = token?.onCancellationRequested(() => {
      job.cancelled = true;
      if (job.session) void vscode.debug.stopDebugging(job.session);
    });
    try {
      const started = await vscode.debug.startDebugging(
        vscode.workspace.getWorkspaceFolder(uri),
        {
          type: "jade-native-experimental",
          request: "launch",
          name: "Jade: Debug Test " + method,
          program: uri.fsPath,
          method,
          jadeTestRunId: id,
        },
      );
      if (!started)
        finish(job, {
          passed: false,
          error: "Jade test debug session could not start.",
        });
    } catch (error) {
      finish(job, { passed: false, error: error.message });
    }
    return completion;
  };
}
module.exports = { registerTestDebugging };
