"use strict";
const { parseSource } = require("./source_symbols");
const identity = (symbol) =>
  symbol &&
  [symbol.schema, symbol.owner || symbol.name, symbol.kind, symbol.name].join(
    "::",
  );

// Source-only navigation. Edges refer to the statically resolved declaration,
// not a prediction of runtime dispatch or dynamically named method calls.
class ImpactModel {
  constructor(project) {
    this.project = project;
    this.generation = -1;
    this.calls = [];
    this.symbols = [];
    this.hydratedGeneration = -1;
  }
  collectSymbols(token) {
    const symbols = [],
      seen = new Set();
    for (const entries of this.project.groups.values()) {
      if (token?.isCancellationRequested) return [];
      const type = this.project.type(
        entries[0].cls.name,
        entries[0].model.schema,
      );
      if (!type) continue;
      for (const member of [type, ...type.members]) {
        const id = identity(member);
        if (!member.model || seen.has(id)) continue;
        seen.add(id);
        symbols.push(member);
      }
    }
    return symbols;
  }
  collectCalls(members, model, locationModel, calls, token) {
    for (const member of members) {
      if (token?.isCancellationRequested) return;
      if (member.kind !== "method" || member.bodyStart === undefined) continue;
      const start = member.signatureEnd || member.bodyStart,
        body = model.code.slice(start, member.end);
      for (const match of body.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) {
        const offset = start + match.index,
          context = this.project.context(model, offset);
        let target;
        if (match[1] === "inheritMethod") {
          const parent = this.project.type(
            context.owner?.parent,
            context.owner?.schema,
          );
          target =
            parent &&
            this.project
              .members(parent, context, Boolean(member.typeMethod))
              .find((m) => m.kind === "method" && m.name === member.name);
        } else target = this.project.referenceAt(model, offset)?.symbol;
        if (target?.kind === "method")
          calls.push({
            from: member,
            to: target,
            model: locationModel,
            start: offset,
            end: offset + match[1].length,
          });
      }
    }
  }
  async ready(read, token) {
    if (token?.isCancellationRequested) return false;
    const generation = this.project.generation;
    if (this.hydratedGeneration === generation) return true;
    if (!read) return this.refresh(token);
    const symbols = this.collectSymbols(token),
      byUri = new Map(),
      calls = [];
    for (const symbol of symbols) {
      const uri = symbol.model.uri;
      if (!byUri.has(uri)) byUri.set(uri, []);
      byUri.get(uri).push(symbol);
    }
    const models = [...this.project.models.values()];
    let next = 0;
    // Retain only resolved edges/locations. Closed files stay metadata-only in the
    // main index; at most eight complete source buffers are hydrated concurrently.
    await Promise.all(
      Array.from({ length: Math.min(8, models.length) }, async () => {
        while (
          next < models.length &&
          !token?.isCancellationRequested &&
          this.project.generation === generation
        ) {
          const metadata = models[next++];
          if (!byUri.has(metadata.uri)) continue;
          const source = metadata.code
            ? metadata
            : parseSource(await read(metadata.uri), metadata.uri);
          this.collectCalls(
            byUri.get(metadata.uri),
            source,
            metadata,
            calls,
            token,
          );
        }
      }),
    );
    if (
      token?.isCancellationRequested ||
      this.project.generation !== generation
    )
      return false;
    this.symbols = symbols;
    this.calls = calls;
    this.generation = generation;
    this.hydratedGeneration = generation;
    return true;
  }
  refresh(token) {
    if (token?.isCancellationRequested) return false;
    if (this.generation === this.project.generation) return true;
    const symbols = this.collectSymbols(token),
      calls = [];
    for (const member of symbols)
      this.collectCalls([member], member.model, member.model, calls, token);
    this.symbols = symbols;
    this.calls = calls;
    this.generation = this.project.generation;
    return true;
  }
  current(symbol) {
    return this.symbols.find((item) => identity(item) === identity(symbol));
  }
  edges(symbol, direction, token) {
    if (!this.refresh(token)) return [];
    const id = identity(symbol),
      groups = new Map();
    for (const call of this.calls) {
      if (token?.isCancellationRequested) return [];
      const source = direction === "incoming" ? call.to : call.from,
        target = direction === "incoming" ? call.from : call.to;
      if (identity(source) !== id || !target.model) continue;
      const key = identity(target);
      if (!groups.has(key)) groups.set(key, { symbol: target, sites: [] });
      groups
        .get(key)
        .sites.push({ model: call.model, start: call.start, end: call.end });
    }
    return [...groups.values()];
  }
  incoming(symbol, token) {
    return this.edges(symbol, "incoming", token);
  }
  outgoing(symbol, token) {
    return this.edges(symbol, "outgoing", token);
  }
  references(symbol, includeDeclaration, token) {
    if (!this.refresh(token)) return [];
    const result = [],
      seen = new Set();
    const add = (model, start, end) => {
      const key = model.uri + ":" + start;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ model, start, end });
      }
    };
    if (includeDeclaration && symbol.model)
      add(
        symbol.model,
        symbol.selection,
        symbol.selection + symbol.name.length,
      );
    for (const model of this.project.models.values()) {
      if (token?.isCancellationRequested) return [];
      for (const site of this.referencesIn(symbol, model))
        add(model, site.start, site.end);
    }
    return result;
  }
  referencesIn(symbol, model) {
    const result = [],
      id = identity(symbol);
    for (const match of model.code.matchAll(/\b[A-Za-z_]\w*\b/g)) {
      if (match[0] !== symbol.name) continue;
      const at = match.index,
        context = this.project.context(model, at);
      if (symbol.kind === "class") {
        // Type annotations and superclass declarations are uses; the repeated CLS
        // owner headings are definitions, rather than references to themselves.
        if (model.classes.some((cls) => cls.selection === at)) continue;
        if (
          /^\s*(?:completeDefinition|partialDefinition)\b/.test(
            model.code.slice(at + symbol.name.length),
          )
        )
          continue;
        if (
          /^\s*\(\s*jadeMethodSources\b/.test(
            model.code.slice(at + symbol.name.length),
          )
        )
          continue;
      } else {
        // Method signatures and local declarations aren't property/method usages.
        if (
          !context.method ||
          at < (context.method.signatureEnd || context.method.bodyStart)
        )
          continue;
        const scope = model.code.slice(
          context.method.signatureEnd || context.method.bodyStart,
          at,
        );
        if (!/\bbegin\b/.test(scope)) continue;
      }
      const found = this.project.referenceAt(model, at)?.symbol;
      if (identity(found) === id)
        result.push({ start: at, end: at + match[0].length });
    }
    return result;
  }
  async referencesAsync(symbol, includeDeclaration, read, token) {
    if (!read) return this.references(symbol, includeDeclaration, token);
    if (
      !["class", "method", "property"].includes(symbol.kind) ||
      token?.isCancellationRequested
    )
      return [];
    const generation = this.project.generation,
      result = [],
      seen = new Set();
    const add = (model, start, end) => {
      const key = model.uri + ":" + start;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ model, start, end });
      }
    };
    if (includeDeclaration && symbol.model)
      add(
        symbol.model,
        symbol.selection,
        symbol.selection + symbol.name.length,
      );
    const models = [...this.project.models.values()];
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(8, models.length) }, async () => {
        while (
          next < models.length &&
          !token?.isCancellationRequested &&
          this.project.generation === generation
        ) {
          const metadata = models[next++],
            source = metadata.code
              ? metadata
              : parseSource(await read(metadata.uri), metadata.uri);
          for (const site of this.referencesIn(symbol, source))
            add(metadata, site.start, site.end);
        }
      }),
    );
    return token?.isCancellationRequested ||
      this.project.generation !== generation
      ? []
      : result;
  }
  implementations(symbol, token) {
    if (!this.refresh(token)) return [];
    const owner =
      symbol.kind === "class"
        ? symbol
        : this.project.type(symbol.owner, symbol.schema);
    if (!owner) return [];
    return this.symbols.filter((candidate) => {
      if (
        candidate.kind !== symbol.kind ||
        identity(candidate) === identity(symbol)
      )
        return false;
      const type =
        candidate.kind === "class"
          ? candidate
          : this.project.type(candidate.owner, candidate.schema);
      return (
        type &&
        this.project.subtype(type, owner) &&
        (symbol.kind === "class" || candidate.name === symbol.name)
      );
    });
  }
}
module.exports = { ImpactModel, identity };
