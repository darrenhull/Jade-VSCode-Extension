"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { scanProject } = require("./native-project"),
  {
    collectionCatalog,
    generateCollection,
    collectionKeyChoices,
  } = require("./collections"),
  { writeCollection } = require("./collection-files"),
  { parseSource } = require("./source_symbols");
async function chooseCollectionMember(vscode, schema, current) {
  if (!schema) return;
  const items = schema.members.map((member) => ({
    label: member.name,
    description:
      member.schema && member.schema !== schema.name
        ? "Inherited from " + member.schema
        : "Local to " + schema.name,
    detail: member.name === current ? "Currently selected" : undefined,
    member: member.name,
  }));
  const selected = await vscode.window.showQuickPick(items, {
    title: "Choose collection member — " + schema.name,
    placeHolder:
      "Search " +
      items.length +
      " visible classes from this schema and its ancestors",
    matchOnDescription: true,
  });
  return selected?.member;
}
function registerCollections(vscode, context) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "jadeNative.createKeyedCollection",
      async (request) => {
        try {
          const folders = vscode.workspace.workspaceFolders || [],
            active = vscode.window.activeTextEditor?.document.uri;
          const folder =
            (active && vscode.workspace.getWorkspaceFolder(active)) ||
            (folders.length === 1
              ? folders[0]
              : (
                  await vscode.window.showQuickPick(
                    folders.map((folder) => ({ label: folder.name, folder })),
                    { title: "Choose Jade source workspace" },
                  )
                )?.folder);
          if (!folder) throw Error("Open a Jade source workspace first.");
          const readCatalog = async () => {
            const project = await scanProject(folder.uri.fsPath);
            for (const doc of vscode.workspace.textDocuments) {
              if (
                doc.uri.scheme !== "file" ||
                !doc.isDirty ||
                !vscode.workspace
                  .getWorkspaceFolder(doc.uri)
                  ?.uri.toString()
                  .startsWith(folder.uri.toString()) ||
                !/\.cls$/i.test(doc.uri.fsPath)
              )
                continue;
              const model = parseSource(doc.getText(), doc.uri.fsPath),
                s = project.schemas.find((s) => s.name === model.schema);
              if (!s) continue;
              s.classes = s.classes.filter(
                (c) =>
                  path.resolve(c.file).toLowerCase() !==
                  path.resolve(doc.uri.fsPath).toLowerCase(),
              );
              for (const cls of model.classes)
                s.classes.push({
                  file: doc.uri.fsPath,
                  owner: cls.name,
                  model,
                });
            }
            return collectionCatalog(project);
          };
          let catalog = await readCatalog();
          if (!catalog.schemas.length)
            throw Error(
              "Create or pull a user schema before adding a collection.",
            );
          const create = async (value) => {
            const latest = await readCatalog(),
              generated = generateCollection(value, latest),
              target = path.join(generated.folder, "types", generated.fileName);
            if (
              vscode.workspace.textDocuments.some(
                (d) =>
                  d.isDirty &&
                  path.resolve(d.uri.fsPath).toLowerCase() ===
                    target.toLowerCase(),
              )
            )
              throw Error("An unsaved editor already uses this file.");
            const file = writeCollection(folder.uri.fsPath, generated);
            await vscode.window.showTextDocument(
              await vscode.workspace.openTextDocument(file),
            );
            return file;
          };
          if (request?.schema) return await create(request);
          const panel = vscode.window.createWebviewPanel(
            "jade.keyedCollection",
            "Create Jade Keyed Collection",
            vscode.ViewColumn.Active,
            {
              enableScripts: true,
              localResourceRoots: [
                vscode.Uri.file(path.join(context.extensionPath, "media")),
              ],
            },
          );
          const nonce = crypto.randomBytes(24).toString("hex"),
            web = panel.webview;
          let initialized;
          const rendered = new Promise((resolve) => {
            initialized = resolve;
          });
          const readyTimer = setTimeout(
            () =>
              initialized({
                error:
                  "The collection designer did not initialize. Close it and reopen the command.",
              }),
            15000,
          );
          const asset = (name) =>
            web
              .asWebviewUri(
                vscode.Uri.file(
                  path.join(context.extensionPath, "media", name),
                ),
              )
              .toString();
          web.html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${web.cspSource}; script-src 'nonce-${nonce}';"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${asset("elements-lite.css")}"><link rel="stylesheet" href="${asset("collections.css")}"></head><body>
   <header class="hero"><div><div class="eyebrow">JADE WORKSPACE / NEW CLASS</div><h1>Keyed collection</h1><p>Define the members. Choose the keys. Let Jade do the rest.</p></div><span class="local-badge"><span></span> Local source only</span></header>
   <form id="designer"><div class="designer-layout"><main><section class="card"><div class="section-title"><span class="step">1</span><div><h2>Class &amp; membership</h2><p>Choose where this collection belongs and what it holds.</p></div></div><div class="grid">
   <label>Schema<select id="schema"></select></label><label>Collection name<input class="vscode-textfield" id="name" placeholder="FishByName" autocomplete="off"><small class="membership-info">Name of the new keyed collection, for example FishByName.</small></label>
   <label>Dictionary<select id="kind"><option value="member">Member keys</option><option value="external">External keys</option></select></label>
   <label class="choice-field">Collection class<div class="member-control"><input class="vscode-textfield" id="membership" placeholder="Search classes…" autocomplete="off" aria-describedby="membership-info"><button class="vscode-button secondary" id="browse-members" type="button" title="Browse all visible collection member classes">Choose class…</button></div><div id="members" class="choice-popup" role="listbox" hidden></div><small id="membership-info" class="membership-info"></small></label>
   <label>Lifetime<select id="lifetime"><option value="transient">Transient</option><option value="persistent">Persistent</option></select></label>
   <label class="check"><input id="duplicates" type="checkbox"> Allow duplicate keys</label></div><details class="advanced"><summary>Superclass &amp; tuning</summary><div class="grid"><label>Dictionary superclass<input class="vscode-textfield" id="superclass" list="superclasses" autocomplete="off"><datalist id="superclasses"></datalist></label><label>Load factor (%)<input class="vscode-textfield" id="load-factor" type="number" min="1" max="100" step="1" placeholder="Jade default"></label></div><p>Leave tuning empty to use Jade’s default. The native compiler validates inherited membership and keys.</p></details></section>
   <section class="card"><div class="section-title"><span class="step">2</span><div><h2>Sort keys</h2><p>Keys are evaluated from top to bottom. Search a property or enter a reference path, such as owner.name.</p></div></div><div id="keys"></div><button class="vscode-button secondary" id="add" type="button">＋ Add another key</button><p id="path-note" hidden>Reference paths used in automatically maintained relationships require inverse references along the path. Jade validates these when used.</p></section></main>
   <aside class="card preview-card"><div class="preview-heading"><h2>Source preview</h2><button class="vscode-button secondary" id="copy-source" type="button" title="Copy the generated native CLS source" disabled>Copy source</button></div><p>Native Jade format, ready to compile.</p><pre id="preview" tabindex="0" aria-label="Generated Jade source">Choose a member class and key to preview your source.</pre></aside></div>
   <footer><div><p id="error" role="status">Choose a member class to get started.</p><small>Creates a file under the schema’s types folder. Compile with F5.</small></div><button class="vscode-button" id="create" type="submit" disabled>Create collection →</button></footer></form>
   <script nonce="${nonce}" src="${asset("collection-choices.js")}"></script><script nonce="${nonce}" src="${asset("collections.js")}"></script></body></html>`;
          let creating = false;
          const listener = web.onDidReceiveMessage(async (message) => {
            try {
              if (message?.command === "rendered") {
                clearTimeout(readyTimer);
                initialized({ opened: true });
                return;
              }
              if (message?.command === "ready") {
                const current =
                  active &&
                  vscode.workspace.textDocuments.find(
                    (d) => d.uri.toString() === active.toString(),
                  );
                const model =
                  current && parseSource(current.getText(), current.uri.fsPath);
                await web.postMessage({
                  command: "catalog",
                  initial: model
                    ? {
                        schema: model.schema,
                        membership: model.classes[0]?.name,
                      }
                    : undefined,
                  catalog: {
                    schemas: catalog.schemas.map((s) => ({
                      name: s.name,
                      parent: s.parent,
                      locales: s.locales,
                      members: s.members.map((m) => ({
                        name: m.name,
                        schema: m.schema,
                        dictionaryKind: m.dictionaryKind,
                      })),
                    })),
                  },
                });
                return;
              }
              if (message?.command === "chooseMember") {
                const selected = await chooseCollectionMember(
                  vscode,
                  catalog.schemas.find(
                    (schema) => schema.name === message.schema,
                  ),
                  message.member,
                );
                if (selected)
                  await web.postMessage({
                    command: "memberSelected",
                    schema: message.schema,
                    member: selected,
                  });
                return;
              }
              if (message?.command === "properties") {
                const selectedMember = catalog.schemas
                  .find((s) => s.name === message.schema)
                  ?.members.find((m) => m.name === message.member);
                const properties = collectionKeyChoices(
                  selectedMember,
                  catalog,
                  message.schema,
                );
                await web.postMessage({
                  command: "properties",
                  schema: message.schema,
                  member: message.member,
                  properties,
                });
                return;
              }
              if (message?.command === "preview") {
                const generated = generateCollection(message.request, catalog);
                await web.postMessage({
                  command: "preview",
                  sequence: message.sequence,
                  text: generated.text,
                });
              }
              if (message?.command === "copySource") {
                const generated = generateCollection(
                  message.request,
                  await readCatalog(),
                );
                await vscode.env.clipboard.writeText(generated.text);
                await web.postMessage({
                  command: "copied",
                  sequence: message.sequence,
                });
              }
              if (message?.command === "create" && !creating) {
                creating = true;
                try {
                  await create(message.request);
                  panel.dispose();
                } finally {
                  creating = false;
                }
              }
            } catch (error) {
              await web.postMessage({
                command: "error",
                sequence: message?.sequence,
                message: error.message,
              });
            }
          });
          panel.onDidDispose(() => {
            clearTimeout(readyTimer);
            initialized({ opened: false, cancelled: true });
            listener.dispose();
          });
          return await rendered;
        } catch (error) {
          void vscode.window.showErrorMessage(error.message);
          return { error: error.message };
        }
      },
    ),
  );
}
module.exports = { registerCollections, chooseCollectionMember };
