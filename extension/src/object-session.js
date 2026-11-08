"use strict";
const { EventEmitter } = require("node:events");
const commands = new Set([
  "catalog",
  "instances",
  "object",
  "collection",
  "release",
]);
class InspectionSession extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.target = "working";
    this.generation = 0;
    this.history = [];
    this.position = -1;
    this.client = undefined;
  }
  async connect() {
    if (this.disconnecting) await this.disconnecting;
    if (this.connecting) return this.connecting;
    if (this.client) {
      await this.client.ready;
      return this.client;
    }
    const generation = this.generation, target = this.target;
    const pending = this.connectOnce(generation, target);
    this.connecting = pending;
    try { return await pending; }
    finally { if (this.connecting === pending) this.connecting = undefined; }
  }
  async connectOnce(generation, target) {
    const client = await this.options.connect(target);
    if (generation !== this.generation) {
      await client.stop();
      throw Error("Database selection changed while connecting.");
    }
    this.client = client;
    client.on("epoch", () => {
      if (this.client !== client) return;
      this.generation++;
      this.resetHistory();
      this.emit("invalidated");
    });
    client.once("close", () => {
      if (this.client === client) {
        this.client = undefined;
        this.generation++;
        this.resetHistory();
        this.emit("change");
      }
    });
    try {
      await client.ready;
      if (generation !== this.generation)
        throw Error("Inspection connection was cancelled.");
      this.emit("change");
      return client;
    } catch (error) {
      await client.stop();
      if (this.client === client) this.client = undefined;
      throw error;
    }
  }
  async request(command, args = {}) {
    if (!commands.has(command))
      throw Error(
        "Object Explorer supports read-only inspection operations only.",
      );
    const client = this.client,
      generation = this.generation;
    if (!client) throw Error("Connect to a database first.");
    const result = await client.request(command, args);
    if (generation !== this.generation || client !== this.client)
      throw Error("Database changed or inspection was cancelled.");
    return result;
  }
  resetHistory() {
    this.history = [];
    this.position = -1;
  }
  visit(entry) {
    if (this.position >= 0 && this.history[this.position]?.oid === entry.oid)
      return;
    this.history.splice(this.position + 1);
    this.history.push({ ...entry });
    if (this.history.length > 100) this.history.shift();
    this.position = this.history.length - 1;
    this.emit("history");
  }
  back() {
    if (this.position > 0) this.position--;
    return this.history[this.position];
  }
  forward() {
    if (this.position < this.history.length - 1) this.position++;
    return this.history[this.position];
  }
  async disconnect(options) {
    if (this.disconnecting) return this.disconnecting;
    this.generation++;
    this.connecting = undefined;
    const client = this.client;
    this.client = undefined;
    this.resetHistory();
    this.emit("change");
    if (client) {
      const closing = Promise.resolve(client.stop(options));
      this.disconnecting = closing;
      try {
        await closing;
      } finally {
        if (this.disconnecting === closing) this.disconnecting = undefined;
      }
    }
  }
  async select(target) {
    if (!["working", "source"].includes(target))
      throw Error("Invalid database selection.");
    await this.disconnect();
    this.target = target;
    this.emit("change");
  }
}
module.exports = { InspectionSession };
