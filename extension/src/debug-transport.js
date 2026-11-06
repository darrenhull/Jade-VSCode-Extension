"use strict";
const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const { StringDecoder } = require("node:string_decoder");

// Transport owns process lifetime and pending requests. It has no VS Code APIs.
class NativeDebugger extends EventEmitter {
  constructor(executable, session, options = {}) {
    super();
    this.options = {
      readyTimeout: 20000,
      requestTimeout: 10000,
      stopTimeout: 2000,
      maxMessageBytes: 4 * 1024 * 1024,
      ...options,
    };
    this.pending = new Map();
    this.seq = 0;
    this.state = "starting";
    this.buffer = "";
    this.decoder = new StringDecoder("utf8");
    this.child = (options.spawn || ((...args)=>require('./cli-gateway').spawnHelper('debug',...args)))(executable, [session], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.on("error", (error) => this.fail(error));
    this.child.stdin.on("error", () => {});
    this.child.stdout.on("data", (bytes) => this.read(bytes));
    this.child.stderr.on("data", (bytes) =>
      this.emit("output", bytes.toString("utf8")),
    );
    this.child.once("close", (code) => this.close(code));
    this.startTimer = setTimeout(
      () => this.fail(Error("Native debugger startup did not become ready.")),
      this.options.readyTimeout,
    );
  }

  read(bytes) {
    if (this.state === "closed") return;
    this.buffer += this.decoder.write(bytes);
    let newline;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      if (Buffer.byteLength(line) > this.options.maxMessageBytes) {
        this.fail(Error("Native debugger message exceeds its size limit."));
        return;
      }
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        this.emit("output", line + "\n");
        continue;
      }
      if (message?.protocol !== "jade-debug/1") {
        this.emit("output", line + "\n");
        continue;
      }
      if (Number.isInteger(message.id) && message.id > 0) {
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.success) pending.resolve(message.body || {});
        else
          pending.reject(
            Error(message.message || "Native debugger command failed."),
          );
      } else if (typeof message.event === "string") {
        if (message.event === "ready") {
          clearTimeout(this.startTimer);
          if (this.state === "starting") this.state = "ready";
        }
        this.emit("message", message);
      }
    }
    if (Buffer.byteLength(this.buffer) > this.options.maxMessageBytes)
      this.fail(Error("Native debugger message exceeds its size limit."));
  }

  request(command, args = {}) {
    if (
      this.state === "closed" ||
      (this.state === "stopping" && command !== "stop")
    )
      return Promise.reject(Error("Native debugger is closed or stopping."));
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error("Native debugger command timed out: " + command));
      }, this.options.requestTimeout);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(
        JSON.stringify({ id, command, ...args }) + "\n",
        (error) => {
          if (!error) return;
          const pending = this.pending.get(id);
          if (!pending) return;
          clearTimeout(pending.timer);
          this.pending.delete(id);
          pending.reject(error);
        },
      );
    });
  }

  fail(error) {
    if (this.state === "closed") return;
    this.emit("failure", error);
    this.child.kill();
    // Spawn failures do not always produce a close event immediately.
    this.close(this.child.exitCode ?? 2);
  }

  stop() {
    if (this.state === "closed" || this.state === "stopping") return;
    this.state = "stopping";
    clearTimeout(this.startTimer);
    void this.request("stop").catch(() => {});
    this.stopTimer = setTimeout(() => {
      if (this.state !== "closed") this.child.kill();
    }, this.options.stopTimeout);
  }

  close(code) {
    if (this.state === "closed") return;
    this.state = "closed";
    clearTimeout(this.startTimer);
    clearTimeout(this.stopTimer);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(Error("Native debugger exited (" + code + ")."));
    }
    this.pending.clear();
    this.emit("close", code);
  }

  dispose() {
    this.stop();
  }
}
module.exports = { NativeDebugger };
