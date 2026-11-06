"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { NativeDebugger } = require("./debug-transport");
const {
  debugMethods,
  nativeLocation,
  breakpointPosition,
  sourceVariables,
} = require("./debug-source");
function registerDebugger(vscode, context, services) {
  const output = vscode.window.createOutputChannel("Jade Debug");
  context.subscriptions.push(output);
  async function select(document, methodName) {
    const methods = debugMethods(document.getText(), document.uri.fsPath);
    if (!methods.length)
      throw Error(
        "Select a concrete CLS with a parameterless instance method.",
      );
    if (methodName) {
      const match = methods.find((m) => m.name === methodName);
      if (!match)
        throw Error(
          "The selected method must be concrete, non-static and parameterless.",
        );
      return match;
    }
    const cursor =
      vscode.window.activeTextEditor?.document.uri.toString() ===
      document.uri.toString()
        ? document.offsetAt(vscode.window.activeTextEditor.selection.active)
        : -1;
    const current = methods.find((m) => m.start <= cursor && cursor <= m.end);
    if (current) return current;
    if (methods.length === 1) return methods[0];
    return (
      await vscode.window.showQuickPick(
        methods.map((m) => ({
          label: m.owner + "::" + m.name,
          description: m.unitTest
            ? "Native test setup, test body and teardown"
            : "Run directly on a new transient instance",
          method: m,
        })),
        { title: "Select Jade method to debug (experimental)" },
      )
    )?.method;
  }
  class Adapter {
    constructor() {
      this.emitter = new vscode.EventEmitter();
      this.onDidSendMessage = this.emitter.event;
      this.sequence = 0;
      this.breakpointSeq = 0;
      this.models = [];
      this.breakpoints = [];
      this.configured = false;
      this.ended = false;
      this.busy = false;
      this.cancelled = false;
      this.abort = new AbortController();
      this.disposed = false;
      this.nativeQueue = Promise.resolve();
      this.breakpointQueue = Promise.resolve();
      this.frames = [];
      this.variableHandles = new Map();
      this.nativeHandles = new Map();
      this.nextVariableHandle = 1000;
      this.sourceSnapshots = new Map();
    }
    send(message) {
      if (this.disposed) return;
      this.emitter.fire({ seq: ++this.sequence, ...message });
    }
    event(event, body = {}) {
      this.send({ type: "event", event, body });
    }
    response(request, body = {}, error) {
      this.send({
        type: "response",
        request_seq: request.seq,
        command: request.command,
        success: !error,
        body,
        ...(error ? { message: error.message } : {}),
      });
    }
    async finish() {
      if (this.ended) return;
      this.ended = true;
      if (this.sessionFile) {
        try {
          fs.unlinkSync(this.sessionFile);
        } catch (error) {
          if (error.code !== "ENOENT") output.appendLine(error.message);
        }
        this.sessionFile = undefined;
      }
      if (this.busy) {
        this.busy = false;
        await services.setBusy(false);
      }
      this.event("terminated");
    }
    assertActive() {
      if (this.cancelled || this.ended)
        throw Error("Debug launch was cancelled.");
    }
    async handleMessage(request) {
      try {
        const a = request.arguments || {};
        switch (request.command) {
          case "initialize":
            this.response(request, {
              supportsConfigurationDoneRequest: true,
              supportsTerminateRequest: true,
              supportsEvaluateForHovers: true,
              supportsStepBack: false,
              supportsSetVariable: false,
            });
            break;
          case "launch": {
            if (services.beforeOperation) await services.beforeOperation();
            if (services.isBusy())
              throw Error("Another Jade operation is already running.");
            this.busy = true;
            await services.setBusy(true);
            output.clear();
            output.show(true);
            const document = await vscode.workspace.openTextDocument(
              a.program || vscode.window.activeTextEditor?.document.uri,
            );
            this.assertActive();
            if (document.isDirty && !(await document.save()))
              throw Error("Save the CLS before debugging.");
            this.assertActive();
            const config = {
              ...services.config(document),
              signal: this.abort.signal,
            };
            if (
              a.launchMode !== undefined &&
              !["method", "application"].includes(a.launchMode)
            )
              throw Error("Unsupported native launch mode.");
            this.applicationMode = a.launchMode === "application";
            if (this.applicationMode) {
              config.schema = a.schema || config.schema;
              this.applicationName = a.application || config.application;
              if (!this.applicationName)
                throw Error("Configure the native application name.");
              this.selected = {
                schema: config.schema,
                owner: this.applicationName,
                name: "Application startup",
                file: document.uri.fsPath,
              };
            } else this.selected = await select(document, a.method);
            this.assertActive();
            if (!this.selected) throw Error("No method selected.");
            await services.workingFiles(config);
            this.assertActive();
            output.appendLine(
              "Experimental native debugger: " +
                this.selected.owner +
                "::" +
                this.selected.name,
            );
            output.appendLine(
              this.applicationMode
                ? "Runs native application initialization and finalization with the configured startup parameter. No Jade IDE is started; changes stay in the private working database."
                : this.selected.unitTest
                  ? "Runs the selected test through JadeTestRunner, including native test setup and teardown. No Jade IDE is started; changes stay in the private working database."
                  : "Runs this method directly on a new transient instance. No Jade IDE is started; changes stay in the private working database.",
            );
            const abi = path.join(
                context.extensionPath,
                "vendor/jade-tools-cli/native/debugger-abi.json",
              ),
              manifest = JSON.parse(fs.readFileSync(abi, "utf8"));
            for (const [name, digest] of Object.entries(manifest.libraries))
              if (
                crypto
                  .createHash("sha256")
                  .update(
                    fs.readFileSync(path.join(config.installPath, "bin", name)),
                  )
                  .digest("hex") !== digest
              )
                throw Error(
                  "Experimental debugging does not support this Jade DLL build: " +
                    name,
                );
            this.operation = services.startWorking(
              config,
              "compile",
              (text) => output.append(text),
            );
            const compiled = await this.operation.completion;
            if (!compiled.passed)
              throw Error(
                compiled.report?.error || "Native compilation failed.",
              );
            this.assertActive();
            this.preparing =
              services.prepareWorking(
                config,
                (text) => output.append(text),
              );
            const working = await this.preparing;
            this.assertActive();
            this.models = config.files.flatMap((file) =>
              debugMethods(fs.readFileSync(file, "utf8"), file, false),
            );
            const directory = path.join(working.root, "debug-sessions");
            fs.mkdirSync(directory, { recursive: true });
            const file = path.join(directory, crypto.randomUUID() + ".json");
            this.sessionFile = file;
            fs.writeFileSync(
              file,
              JSON.stringify({
                ...working,
                workingWrites: true,
                sourceDatabasePath: config.databasePath,
                launchMode: this.applicationMode ? "application" : "method",
                ...(this.applicationMode
                  ? {
                      application: this.applicationName,
                      applicationParameter: a.applicationParameter,
                    }
                  : {}),
                schema: this.selected.schema,
                owner: this.selected.owner,
                method: this.selected.name,
                unitTest: this.selected.unitTest,
                abi,
              }),
            );
            this.native = new NativeDebugger(
              path.join(context.extensionPath, "vendor/jade-tools-cli/native/jade-debug-helper.exe"),
              file,
            );
            this.native.on("output", (text) => {
              output.append(text);
              this.event("output", { category: "console", output: text });
            });
            this.native.on("failure", (error) => {
              this.event("output", {
                category: "stderr",
                output: error.message + "\n",
              });
              void this.finish();
            });
            this.native.on("close", (code) => {
              output.appendLine("DebuggerExitCode=" + code);
              void this.finish();
            });
            this.native.on("message", (message) => {
              this.nativeQueue = this.nativeQueue
                .then(() => this.nativeMessage(message))
                .catch((error) => {
                  this.event("output", {
                    category: "stderr",
                    output: error.message + "\n",
                  });
                  this.native.stop();
                });
            });
            this.response(request);
            this.event("initialized");
            break;
          }
          case "setBreakpoints": {
            const file = a.source?.path;
            if (typeof file !== "string" || !file)
              throw Error("A breakpoint needs a source file path.");
            if (
              (a.breakpoints || []).some(
                (b) => !Number.isInteger(b.line) || b.line < 1,
              )
            )
              throw Error("Breakpoint lines must be positive integers.");
            this.breakpoints = this.breakpoints.filter(
              (b) => b.file.toLowerCase() !== file.toLowerCase(),
            );
            for (const b of a.breakpoints || [])
              this.breakpoints.push({
                file,
                line: b.line,
                id: ++this.breakpointSeq,
              });
            const actual = await this.applyBreakpoints();
            this.response(request, {
              breakpoints: (a.breakpoints || []).map(
                (b) =>
                  actual.find(
                    (v) =>
                      v.requested === b.line &&
                      v.file.toLowerCase() === file.toLowerCase(),
                  ) || {
                    id: this.breakpoints.find(
                      (v) => v.file === file && v.line === b.line,
                    )?.id,
                    verified: false,
                    line: b.line,
                    message:
                      "Initially supports breakpoints in the launched method.",
                  },
              ),
            });
            break;
          }
          case "configurationDone":
            this.configured = true;
            this.response(request);
            if (this.pendingStop) await this.presentStop();
            break;
          case "threads":
            this.response(request, {
              threads: [{ id: 1, name: "Jade native execution" }],
            });
            break;
          case "stackTrace": {
            const start = a.startFrame ?? 0,
              levels = a.levels ?? 0;
            if (
              !Number.isInteger(start) ||
              start < 0 ||
              !Number.isInteger(levels) ||
              levels < 0
            )
              throw Error("Invalid stack page.");
            const frames = this.paused ? this.frames : [];
            this.response(request, {
              stackFrames: frames
                .slice(start, levels ? start + levels : undefined)
                .map((f) => ({
                  id: f.id,
                  name: f.owner + "::" + f.name,
                  source: {
                    ...(f.file
                      ? { name: path.basename(f.file), path: f.file }
                      : {
                          name: f.owner + "::" + f.name,
                          sourceReference: f.sourceReference,
                        }),
                  },
                  ...(f.position === null
                    ? { line: 0, column: 0 }
                    : nativeLocation(f, f.source, f.position)),
                })),
              totalFrames: frames.length,
            });
            break;
          }
          case "source":
            this.response(request, {
              content:
                this.sourceSnapshots.get(a.sourceReference) ??
                this.location?.source ??
                "",
              mimeType: "text/plain",
            });
            break;
          case "scopes": {
            if (!this.paused) {
              this.response(request, { scopes: [] });
              break;
            }
            const frame = this.frames.find((f) => f.id === (a.frameId ?? 1));
            if (!frame) throw Error("Stack frame is no longer available.");
            this.variableHandles.set(frame.id, { frame });
            this.response(request, {
              scopes: [
                {
                  name: "Locals",
                  variablesReference: frame.id,
                  expensive: false,
                },
              ],
            });
            break;
          }
          case "variables": {
            if (!this.frame || !this.paused) {
              this.response(request, { variables: [] });
              break;
            }
            const handle =
              this.variableHandles.get(a.variablesReference) ||
              ((a.variablesReference ?? 1) === 1
                ? { frame: this.frames[0] || this.frame }
                : undefined);
            if (!handle)
              throw Error("Variable reference is no longer available.");
            const result = handle.nativeReference
              ? await this.native.request("expand", {
                  reference: handle.nativeReference,
                  filter: a.filter,
                  start: a.start ?? 0,
                  count: a.count ?? 100,
                })
              : await this.native.request("variables", {
                  names: ["self", ...handle.frame.variables],
                  level: handle.frame.level ?? 0,
                });
            this.response(request, {
              ...result,
              variables: this.mapVariables(result.variables || []),
            });
            break;
          }
          case "evaluate": {
            if (!this.paused)
              throw Error("Variables are available only while Jade is paused.");
            if (!/^[A-Za-z_]\w*$/.test(a.expression || ""))
              throw Error("This preview evaluates local variable names only.");
            const frame =
              this.frames.find((f) => f.id === (a.frameId ?? 1)) ||
              ((a.frameId ?? 1) === 1 ? this.frame : undefined);
            if (!frame) throw Error("Stack frame is no longer available.");
            const result = await this.native.request("variables", {
                names: [a.expression],
                level: frame.level ?? 0,
              }),
              v = this.mapVariables(result.variables || [])[0];
            if (!v) throw Error("Variable is unavailable.");
            this.response(request, {
              result: v.value,
              type: v.type,
              variablesReference: v.variablesReference || 0,
            });
            break;
          }
          case "pause":
            if (this.paused) throw Error("Jade is already paused.");
            await this.native.request("pause");
            this.response(request);
            break;
          case "continue":
          case "next":
          case "stepIn":
          case "stepOut": {
            if (!this.paused) throw Error("Jade is not paused.");
            this.paused = false;
            this.variableHandles.clear();
            this.nativeHandles.clear();
            await this.native.request(
              request.command === "stepOut" ? "stepOut" : "resume",
              {
                mode:
                  request.command === "continue"
                    ? 2
                    : request.command === "next"
                      ? 3
                      : 0,
              },
            );
            this.response(request, { allThreadsContinued: true });
            this.event("continued", { threadId: 1, allThreadsContinued: true });
            break;
          }
          case "disconnect":
          case "terminate":
            this.cancelled = true;
            this.abort.abort();
            this.operation?.stop?.();
            this.native?.stop();
            this.response(request);
            if (!this.native) {
              await this.operation?.completion?.catch(() => {});
              await this.preparing?.catch(() => {});
              await this.finish();
            }
            break;
          case "setExceptionBreakpoints":
            this.response(request, { breakpoints: [] });
            break;
          default:
            throw Error(
              "Not supported by the experimental Jade debugger: " +
                request.command,
            );
        }
      } catch (error) {
        this.response(request, {}, error);
        output.appendLine(error.message);
        if (request.command === "launch") {
          this.native?.stop();
          await this.finish();
        }
      }
    }
    mapVariables(variables) {
      return variables.map((value) => {
        if (!value.variablesReference)
          return { ...value, variablesReference: 0 };
        let handle = this.nativeHandles.get(value.variablesReference);
        if (!handle) {
          handle = this.nextVariableHandle++;
          this.nativeHandles.set(value.variablesReference, handle);
          this.variableHandles.set(handle, {
            nativeReference: value.variablesReference,
          });
        }
        return { ...value, variablesReference: handle };
      });
    }
    async nativeMessage(message) {
      if (message.event === "ready") {
        if (this.sessionFile) {
          try {
            fs.unlinkSync(this.sessionFile);
            this.sessionFile = undefined;
          } catch (error) {
            if (error.code === "ENOENT") this.sessionFile = undefined;
            else
              output.appendLine(
                "Session file cleanup will retry on exit: " + error.message,
              );
          }
        }
        this.nativeSource = message.method.source;
        this.targetMethod = message.method;
        if (this.applicationMode) {
          const model = this.models.find(
            (model) =>
              model.schema === message.method.schema &&
              model.owner === message.method.owner &&
              model.name === message.method.method,
          );
          this.selected = {
            ...(model || {}),
            schema: message.method.schema,
            owner: message.method.owner,
            name: message.method.method,
          };
        }
        await this.applyBreakpoints();
      } else if (message.event === "stopped") {
        this.location = message.method;
        this.stopReason = message.reason || "step";
        this.pendingStop = true;
        this.paused = true;
        this.variableHandles.clear();
        this.nativeHandles.clear();
        this.sourceSnapshots.clear();
        const native = await this.native.request("stack");
        this.frames = (native.frames || [message.method]).map(
          (frame, index) => {
            const local = this.models.find(
              (m) =>
                m.schema === frame.schema &&
                m.owner === frame.owner &&
                m.name === frame.method,
            );
            const value = {
              ...(local || {}),
              ...frame,
              name: frame.method,
              id: index + 1,
              level: frame.level ?? index,
              line:
                local?.line ??
                1 + (frame.source.match(/^\s*/)?.[0].match(/\n/g) || []).length,
              variables: local?.variables || sourceVariables(frame.source),
            };
            if (!local?.file) {
              value.sourceReference = index + 1;
              this.sourceSnapshots.set(value.sourceReference, frame.source);
            }
            this.variableHandles.set(value.id, { frame: value });
            return value;
          },
        );
        this.frame = this.frames[0];
        if (this.configured) await this.presentStop();
      } else if (message.event === "error") {
        this.event("output", {
          category: "stderr",
          output: message.message + "\n",
        });
        output.appendLine(message.message);
      } else if (message.event === "exited") {
        this.event("output", {
          category: "console",
          output:
            "Native method completed" +
            (message.result?.value ? " → " + message.result.value : "") +
            "\n",
        });
        this.event("exited", { exitCode: message.exitCode });
      }
    }
    async applyBreakpoints() {
      const operation = this.breakpointQueue.then(() =>
        this.applyBreakpointSnapshot(),
      );
      this.breakpointQueue = operation.catch(() => {});
      return operation;
    }
    async applyBreakpointSnapshot() {
      if (!this.nativeSource || !this.selected?.file) return [];
      const candidates = this.breakpoints
        .filter(
          (b) =>
            path.resolve(b.file).toLowerCase() ===
            path.resolve(this.selected.file).toLowerCase(),
        )
        .map((b) => ({
          ...b,
          position: breakpointPosition(
            this.selected,
            this.nativeSource,
            b.line,
          ),
        }))
        .filter((b) => b.position !== undefined);
      const result = await this.native.request("breakpoints", {
        positions: candidates.map((b) => b.position),
      });
      return candidates.map((b, i) => ({
        id: b.id,
        file: b.file,
        requested: b.line,
        verified: true,
        ...nativeLocation(
          this.selected,
          this.nativeSource,
          result.positions[i],
        ),
      }));
    }
    async presentStop() {
      this.pendingStop = false;
      const actual = await this.applyBreakpoints();
      for (const b of actual)
        this.event("breakpoint", {
          reason: "changed",
          breakpoint: {
            id: b.id,
            verified: true,
            source: { path: b.file },
            line: b.line,
          },
        });
      this.event("stopped", {
        reason: this.stopReason || "step",
        threadId: 1,
        allThreadsStopped: true,
      });
    }
    dispose() {
      this.cancelled = true;
      this.disposed = true;
      this.abort.abort();
      this.operation?.stop?.();
      this.native?.stop();
      void Promise.allSettled([this.operation?.completion, this.preparing])
        .then(() => this.finish())
        .catch(() => {});
      this.emitter.dispose();
    }
  }
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory(
      "jade-native-experimental",
      {
        createDebugAdapterDescriptor: () =>
          new vscode.DebugAdapterInlineImplementation(new Adapter()),
      },
    ),
  );
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider(
      "jade-native-experimental",
      {
        resolveDebugConfiguration(folder, config) {
          return {
            ...config,
            type: "jade-native-experimental",
            request: "launch",
            name: config.name || "Jade: Debug Current Method (Experimental)",
            program:
              config.program ||
              vscode.window.activeTextEditor?.document.uri.fsPath,
          };
        },
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "jadeNative.debugMethod",
      async (uri, method) => {
        try {
          const document = uri
            ? await vscode.workspace.openTextDocument(uri)
            : vscode.window.activeTextEditor?.document;
          if (!document || !/\.cls$/i.test(document.uri.fsPath))
            throw Error("Open a Jade CLS file.");
          const selected = await select(document, method);
          if (!selected) return;
          return vscode.debug.startDebugging(
            vscode.workspace.getWorkspaceFolder(document.uri),
            {
              type: "jade-native-experimental",
              request: "launch",
              name: "Jade: Debug " + selected.owner + "::" + selected.name,
              program: document.uri.fsPath,
              method: selected.name,
            },
          );
        } catch (error) {
          void vscode.window.showErrorMessage(error.message);
          return false;
        }
      },
    ),
  );
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: "jade-nz", pattern: "**/*.cls" },
      {
        provideCodeLenses(document) {
          return debugMethods(document.getText(), document.uri.fsPath).map(
            (m) =>
              new vscode.CodeLens(
                new vscode.Range(
                  document.positionAt(m.selection),
                  document.positionAt(m.selection),
                ),
                {
                  title: m.unitTest
                    ? "Debug Test (Native Framework)"
                    : "Debug Method (Experimental)",
                  command: "jadeNative.debugMethod",
                  arguments: [document.uri, m.name],
                },
              ),
          );
        },
      },
    ),
  );
}
module.exports = { registerDebugger, NativeDebugger };
