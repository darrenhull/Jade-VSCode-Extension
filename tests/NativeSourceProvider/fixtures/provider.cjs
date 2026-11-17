"use strict";
const crypto = require("node:crypto");
const hash = text => crypto.createHash("sha256").update(text).digest("hex");
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(options = {}) {
  const text = "value(): Integer;\nbegin\n return 1;\nend;";
  const flags = { catalogue: true, projectionRead: true, projectionEdit: true, deploymentFromSavedSnapshot: true, nativeTests: true, nativeScratch: false, ...options.flags };
  const snapshot = { provider: "jox", projectId: "native-project-A", generation: "generation-1", snapshotHash: hash("snapshot"), counts: { schemas: 1, types: 1, members: 1 }, changes: { added: [], modified: [], deleted: [] }, capabilities: flags };
  const document = { provider: "jox", projectId: snapshot.projectId, generation: snapshot.generation, documentId: "opaque-document", entityId: "Schema::Type::Value", revision: { generation: snapshot.generation, originByteHash: hash("rawJOX"), memberHash: hash(text) }, origin: { uri: "file:///C:/project/Example/Type.jox", format: "jox", originByteHash: hash("rawJOX") }, projection: { cacheUri: "file:///C:/project/.jade/projections/document.jade", text, contentHash: hash(text), editKind: "projectionText", selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, mapping: [] }, context: { symbols: [], parameters: [], references: [] }, members: [], supportedEdits: flags.projectionEdit ? ["projectionText"] : [] };
  const requests = [], connection = {}, client = { client: connection, probes: 0, nextId: 0,
    connect() { return this.client; },
    async sourceCapabilities() { this.probes++; return options.unsupported ? {} : { sourceSemantic: { format: 1, providers: [{ id: "jox", ...flags }] } }; },
    request(command, body, _output, _events, captured) {
      if (captured && captured !== this.client) throw Error("Original connection changed");
      const request = { command, body: clone(body), client: this.client, id: ++this.nextId }; requests.push(request);
      const respond = () => {
        if (options.reply) { const value = options.reply(command, body); if (value !== undefined) return value; }
        if (command === "source.semantic.prepare") return { passed: true, code: 0, body: clone(snapshot) };
        if (command === "source.semantic.query") return { passed: true, code: 0, body: { provider: "jox", projectId: snapshot.projectId, generation: snapshot.generation, items: [], offset: body.offset, limit: body.limit, total: 0, nextOffset: null } };
        if (command === "source.semantic.read") return { passed: true, code: 0, body: clone(document) };
        if (command === "source.semantic.applyEdit") {
          const revision = { generation: "generation-2", originByteHash: hash("updatedJOX"), memberHash: hash(body.replacementText) };
          return { passed: true, code: 0, body: { provider: "jox", projectId: snapshot.projectId, documentId: document.documentId, entityId: document.entityId, saved: true, newRevision: revision, origin: { ...document.origin, originByteHash: revision.originByteHash }, projection: { ...document.projection, text: body.replacementText, contentHash: hash(body.replacementText) }, changedEntityIds: [document.entityId] } };
        }
        if (command === "cancel") return { passed: true, code: 0, cancelled: true };
        throw Error("Unexpected legacy/native operation: " + command);
      };
      return { id: request.id, client: request.client, promise: Promise.resolve().then(respond) };
    },
  };
  const config = { sourceFormat: "jox", workspaceRoots: ["C:/project"], user: "", password: "" };
  return { client, config, requests, snapshot, document, flags, hash, clone };
}
module.exports = { fixture, hash, clone };
