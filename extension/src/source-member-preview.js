"use strict";
const path = require("node:path"),
  crypto = require("node:crypto");
const { memberPreview } = require("./class-view-model"),
  { lexSource } = require("./source-lex");
function highlighted(text) {
  const excluded = lexSource(text).excluded,
    segments = [];
  let cursor = 0;
  function code(value) {
    let at = 0;
    for (const match of value.matchAll(
      /\b(?:begin|end|vars|return|if|then|else|endif|while|do|endwhile|foreach|in|endforeach|create|delete|transient|persistent|updating|protected|public|unitTest|epilog|self|null|true|false)\b/g,
    )) {
      if (match.index > at)
        segments.push({ text: value.slice(at, match.index) });
      segments.push({ text: match[0], kind: "keyword" });
      at = match.index + match[0].length;
    }
    if (at < value.length) segments.push({ text: value.slice(at) });
  }
  for (const range of excluded) {
    code(text.slice(cursor, range.start));
    segments.push({
      text: text.slice(range.start, range.end),
      kind: range.kind === "comment" ? "comment" : "string",
    });
    cursor = range.end;
  }
  code(text.slice(cursor));
  return segments;
}
function createSourceMemberPreviews(
  vscode,
  context,
  { readSource, onOriginal },
) {
  const records = new Map();
  let activeKey,
    disposed = false;
  const current = (record, revision) =>
    !disposed &&
    records.get(record.key) === record &&
    record.revision === revision;
  const result = (record, reused, cancelled = false) => ({
    schema: record.row.schema,
    owner: record.row.owner,
    member: record.row.name,
    panelKey: record.key,
    title: record.panel.title,
    readOnly: true,
    reused,
    ...(cancelled ? { cancelled: true } : {}),
  });
  function send(record) {
    if (record.ready && record.content)
      return record.panel.webview.postMessage({
        command: "member",
        revision: record.revision,
        content: record.content,
      });
  }
  async function openOriginalFromPanel(record) {
    const revision = record.revision;
    try {
      await onOriginal({ ...record.row });
    } catch (error) {
      if (!current(record, revision)) return;
      try {
        await record.panel.webview.postMessage({
          command: "error",
          revision,
          message: "Could not open original source: " + (error?.message || String(error)),
        });
      } catch {
        // The panel may have closed while opening the original file.
      }
    }
  }
  function create(row, key) {
    const panel = vscode.window.createWebviewPanel(
        "jadeSourceMember",
        key,
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          enableFindWidget: true,
          localResourceRoots: [
            vscode.Uri.file(path.join(context.extensionPath, "media")),
          ],
        },
      ),
      record = { key, panel, row: { ...row }, revision: 0, ready: false };
    records.set(key, record);
    const listeners = [];
    listeners.push(
      panel.webview.onDidReceiveMessage((message) => {
        if (records.get(key) !== record) return;
        if (message?.command === "ready") {
          record.ready = true;
          void send(record);
        }
        if (
          message?.command === "rendered" &&
          message.revision === record.revision
        ) {
          record.lastRenderedRevision = message.revision;
          clearTimeout(record.renderTimer);
          record.renderResolve?.();
          record.renderResolve = undefined;
        }
        if (message?.command === "openOriginal")
          void openOriginalFromPanel(record);
      }),
    );
    if (panel.onDidChangeViewState)
      listeners.push(
        panel.onDidChangeViewState(() => {
          if (panel.active) activeKey = key;
        }),
      );
    panel.onDidDispose(() => {
      record.revision++;
      clearTimeout(record.renderTimer);
      record.renderResolve?.();
      record.renderResolve = undefined;
      for (const listener of listeners) listener?.dispose();
      if (records.get(key) === record) records.delete(key);
      if (activeKey === key) activeKey = undefined;
    });
    const nonce = crypto.randomBytes(24).toString("hex"),
      asset = (name) =>
        panel.webview
          .asWebviewUri(
            vscode.Uri.file(path.join(context.extensionPath, "media", name)),
          )
          .toString();
    panel.webview.html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${asset("source-member.css")}"></head><body><header><div><div class="eyebrow" id="class-name"></div><h1 id="member-name">Loading member…</h1><p id="member-kind"></p></div><div class="actions"><span class="badge">Read-only</span><button id="original" title="Edit this member in its original CLS file">Open Original Source</button></div></header><p id="source-path"></p><pre tabindex="0" aria-label="Read-only Jade member source"><code id="source"></code></pre><p class="help" id="status">This preview follows unsaved edits to the original source.</p><script nonce="${nonce}" src="${asset("source-member.js")}"></script></body></html>`;
    return record;
  }
  function open(row, { refresh = false, reveal = true } = {}) {
    if (!row?.file || !row.schema || !row.owner || !row.name)
      return Promise.resolve();
    const key = row.schema + "::" + row.owner;
    let record = records.get(key),
      reused = Boolean(record);
    if (!record) record = create(row, key);
    if (reveal) {
      activeKey = key;
      record.panel.reveal(vscode.ViewColumn.Active);
    }
    const requestKey = JSON.stringify([row.file, row.name, row.kind]);
    if (!refresh && record.requestKey === requestKey) {
      if (record.pending)
        return record.pending.then((value) => ({ ...value, reused: true }));
      if (record.content) return Promise.resolve(result(record, true));
    }
    record.renderResolve?.();
    clearTimeout(record.renderTimer);
    const revision = ++record.revision;
    record.row = { ...row };
    record.requestKey = requestKey;
    const pending = (async () => {
      let text = "",
        readError;
      try {
        ({ text } = await readSource(row.file));
      } catch (error) {
        readError = error.message;
      }
      if (!current(record, revision)) return result(record, reused, true);
      const member = memberPreview(text, row.file, row.owner, row.name);
      record.content =
        member && member.schema === row.schema
          ? {
              title: member.title,
              text: member.text,
              kind: member.kind,
              schema: row.schema,
              owner: row.owner,
              member: row.name,
              file: row.file,
              segments: highlighted(member.text),
            }
          : {
              title: row.schema + "::" + row.owner + "::" + row.name,
              text: readError
                ? "Source unavailable: " + readError
                : "This member is no longer present in this class. Refresh Object Explorer or open the original source.",
              kind: row.kind,
              schema: row.schema,
              owner: row.owner,
              member: row.name,
              file: row.file,
              missing: true,
              segments: [],
            };
      record.rendered = new Promise((resolve, reject) => {
        record.renderResolve = resolve;
        record.renderTimer = setTimeout(
          () =>
            reject(
              Error(
                "Source member preview did not initialize. Close and reopen the class tab.",
              ),
            ),
          15000,
        );
      });
      record.rendered.catch(() => {});
      await send(record);
      await record.rendered;
      if (!current(record, revision)) return result(record, reused, true);
      return result(record, reused);
    })();
    record.pending = pending;
    void pending
      .finally(() => {
        if (record.pending === pending) record.pending = undefined;
      })
      .catch(() => {});
    return pending;
  }
  return {
    records,
    open,
    refresh: (files) => {
      const changed = new Set(files);
      return Promise.all(
        [...records.values()]
          .filter((record) => changed.has(record.row.file))
          .map((record) => open(record.row, { refresh: true, reveal: false })),
      );
    },
    openOriginal: (row) => {
      const record =
        row?.schema && row?.owner
          ? records.get(row.schema + "::" + row.owner)
          : records.get(activeKey);
      return record ? onOriginal({ ...record.row }) : undefined;
    },
    dispose() {
      disposed = true;
      for (const record of [...records.values()]) record.panel.dispose();
      records.clear();
    },
  };
}
module.exports = { createSourceMemberPreviews, highlighted };
