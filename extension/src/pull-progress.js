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
    directory, intervalMs = 3000, now = () => performance.now(),
    watch = fs.watch, log = () => {}, initialPhase = "Native extraction",
  } = options;
  const start = now();
  let phaseStart = start, lastReport = -Infinity, phase = initialPhase;
  let disposed = false, timer, watcher, refreshing, count = 0, dirty = true, counters;
  let observing = initialPhase === "Native extraction";
  const report = () => {
    if (disposed) return;
    lastReport = now();
    const detail = observing
      ? count.toLocaleString() + " class files observed · "
      : counters && Number.isInteger(counters.total)
        ? counters.completed.toLocaleString() + "/" + counters.total.toLocaleString() + " files hashed · "
        : "";
    // Progress rendering must not replace the extraction outcome.
    try { progress.report({ message: phase + " · " + detail + elapsedLabel(now() - phaseStart) + " stage · " + elapsedLabel(now() - start) + " elapsed" }); } catch {}
  };
  async function scan() {
    let total = 0;
    const directories = [directory];
    while (directories.length && !disposed && observing) {
      const current = directories.pop();
      let entries;
      try { entries = await fs.promises.readdir(current, { withFileTypes: true }); }
      catch (error) { if (error.code === "ENOENT") continue; throw error; }
      for (const entry of entries) {
        if (entry.isDirectory()) directories.push(path.join(current, entry.name));
        else if (entry.isFile() && /\.cls$/i.test(entry.name)) total++;
      }
    }
    return total;
  }
  function refresh() {
    if (disposed) return Promise.resolve();
    if (!observing) { report(); return Promise.resolve(); }
    if (refreshing) return refreshing;
    if (watcher && !dirty) { report(); return Promise.resolve(); }
    dirty = false;
    refreshing = scan().then(value => { if (observing) count = value; report(); }, () => report())
      .finally(() => { refreshing = undefined; });
    return refreshing;
  }
  function schedule() {
    if (disposed) return;
    timer = setTimeout(async () => { await refresh(); schedule(); }, intervalMs);
    timer.unref?.();
  }
  if (observing) {
    try {
      watcher = watch(options.watchRoot || directory, { recursive: true }, () => { dirty = true; });
      watcher.on?.("error", () => { watcher?.close(); watcher = undefined; });
    } catch {} // Observation still works where recursive watching is unavailable.
  }
  report();
  if (observing) void refresh();
  schedule();
  const finishPhase = () => {
    const duration = Math.max(0, now() - phaseStart);
    try { log(phase + ": " + elapsedLabel(duration) + " stage (" + Math.round(duration) + " ms)"); } catch {}
  };
  return {
    refresh,
    phase(value) {
      if (disposed) return;
      const next = typeof value === "string" ? value : value.phase;
      const changed = next !== phase;
      if (changed) { finishPhase(); phase = next; phaseStart = now(); counters = undefined; }
      if (phase !== "Native extraction" && observing) {
        observing = false; watcher?.close(); watcher = undefined;
      }
      if (typeof value === "object") counters = value;
      if (changed || now() - lastReport >= 250 || counters?.completed === counters?.total && counters?.total !== undefined) report();
    },
    dispose() {
      if (disposed) return;
      finishPhase(); disposed = true; clearTimeout(timer); watcher?.close(); watcher = undefined;
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
