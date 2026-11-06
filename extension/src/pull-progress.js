"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  {
    Worker,
    isMainThread,
    workerData,
    parentPort,
  } = require("node:worker_threads");
function cancellationError() {
  return Object.assign(
    Error("Source pull preparation cancelled. Working source was not changed."),
    { code: "JADE_PULL_CANCELLED" },
  );
}
function elapsedLabel(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
}
function createPullProgress(progress, options) {
  const {
      directory,
      intervalMs = 3000,
      now = Date.now,
      watch = fs.watch,
    } = options,
    start = now();
  let disposed = false,
    timer,
    watcher,
    refreshing,
    count = 0,
    dirty = true,
    phase = "Native extraction";
  const report = () => {
    if (!disposed)
      progress.report({
        message:
          phase +
          " · " +
          count.toLocaleString() +
          " class files observed · " +
          elapsedLabel(now() - start) +
          " elapsed",
      });
  };
  async function scan() {
    let total = 0;
    const directories = [directory];
    while (directories.length && !disposed) {
      const current = directories.pop();
      let entries;
      try {
        entries = await fs.promises.readdir(current, { withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      for (const entry of entries) {
        if (entry.isDirectory())
          directories.push(path.join(current, entry.name));
        else if (entry.isFile() && /\.cls$/i.test(entry.name)) total++;
      }
    }
    return total;
  }
  function refresh() {
    if (disposed) return Promise.resolve();
    if (refreshing) return refreshing;
    if (watcher && !dirty) {
      report();
      return Promise.resolve();
    }
    dirty = false;
    refreshing = scan()
      .then(
        (value) => {
          count = value;
          report();
        },
        () => report(),
      )
      .finally(() => {
        refreshing = undefined;
      });
    return refreshing;
  }
  function schedule() {
    if (disposed) return;
    timer = setTimeout(async () => {
      await refresh();
      schedule();
    }, intervalMs);
    timer.unref?.();
  }
  try {
    watcher = watch(options.watchRoot || directory, { recursive: true }, () => {
      dirty = true;
    });
    watcher.on?.("error", () => {
      watcher?.close();
      watcher = undefined;
    });
  } catch {} // Counting still works on platforms without recursive watchers.
  report();
  void refresh();
  schedule();
  return {
    refresh,
    phase(value) {
      phase = value;
      report();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      watcher?.close();
      watcher = undefined;
    },
  };
}
function preparePullSources(input, options = {}) {
  const { token, report = () => {}, WorkerClass = Worker } = options;
  if (token?.isCancellationRequested)
    return Promise.reject(cancellationError());
  return new Promise((resolve, reject) => {
    let worker,
      subscription,
      cancelled = false,
      result,
      failure,
      closed = false;
    const cleanup = () => {
      subscription?.dispose();
      worker?.removeAllListeners();
    };
    try {
      worker = new WorkerClass(__filename, {
        workerData: { jadePullPreparation: true, input },
      });
      worker.on("message", (message) => {
        if (message.phase && !cancelled) report(message.phase);
        if (message.error) failure = Error(message.error);
        if (message.result) result = message.result;
      });
      worker.on("error", (error) => {
        failure = error;
      });
      worker.once("exit", (code) => {
        closed = true;
        cleanup();
        if (cancelled) reject(cancellationError());
        else if (failure) reject(failure);
        else if (code !== 0 || !result)
          reject(
            Error(
              "Source preparation worker exited before completion (" +
                code +
                ").",
            ),
          );
        else resolve(result);
      });
      subscription = token?.onCancellationRequested(() => {
        if (closed || cancelled) return;
        cancelled = true;
        void worker.terminate().catch((error) => {
          failure = error;
        });
      });
      if (token?.isCancellationRequested) {
        cancelled = true;
        void worker.terminate();
      }
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
if (!isMainThread && workerData?.jadePullPreparation) {
  try {
    const { rawDirectory, organizedDirectory, destination, previous } =
      workerData.input;
    parentPort.postMessage({ phase: "Organizing native source files" });
    const organized = require("./source-layout").organizeSources(
      rawDirectory,
      organizedDirectory,
    );
    parentPort.postMessage({
      phase: "Comparing extracted source with workspace files",
    });
    const plan = require("./extract").planSourceUpdate(
      organized.directory,
      destination,
      previous,
    );
    parentPort.postMessage({
      result: {
        organized: {
          directory: organized.directory,
          schemas: organized.schemas,
        },
        plan,
      },
    });
  } catch (error) {
    parentPort.postMessage({ error: error.message });
    process.exitCode = 1;
  }
}
module.exports = { createPullProgress, preparePullSources, elapsedLabel };
