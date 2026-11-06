"use strict";
const path = require("node:path");
const applicationTypes = {
  S: "Non-GUI",
  N: "Non-GUI web",
  T: "Non-GUI REST",
  G: "GUI",
  F: "GUI without forms",
  W: "Web",
  R: "REST",
  J: "Java",
};
const { scanProject } = require("./native-project"),
  { xmlTree } = require("./native-source-filter"),
  { parseSource } = require("./source_symbols");
function applicationCatalog(project) {
  const records = new Map();
  for (const entry of project.entries) {
    if (entry.extension !== ".ddx") continue;
    const tree = xmlTree(entry.text, entry.file),
      schema = tree.attributes.name;
    if (!schema) throw Error("Native DDX schema has no name: " + entry.file);
    for (const node of tree.children.filter(
      (child) => child.tag === "Application",
    )) {
      const name = node.attributes.name,
        type =
          node.children
            .find((child) => child.tag === "applicationType")
            ?.text.trim() || "";
      if (!name)
        throw Error("Native DDX Application has no stored name: " + entry.file);
      const identity = schema + "::" + name,
        record = {
          schema,
          name,
          type,
          file: entry.file,
          startup:
            node.children
              .find((child) => child.tag === "initializeMethod")
              ?.text.trim() || "",
        };
      // XML method references are not inferred into executable startup metadata here.
      const prior = records.get(identity);
      if (
        prior &&
        JSON.stringify([prior.type, prior.startup]) !==
          JSON.stringify([record.type, record.startup])
      )
        throw Error(
          "Conflicting native Application definitions for " + identity,
        );
      if (!prior) records.set(identity, record);
    }
  }
  return [...records.values()].sort(
    (a, b) => a.schema.localeCompare(b.schema) || a.name.localeCompare(b.name),
  );
}
function registerApplicationDebug(vscode, context) {
  const command = vscode.commands.registerCommand(
    "jadeNative.debugApplication",
    async () => {
      try {
        const document = vscode.window.activeTextEditor?.document;
        if (
          document?.uri.scheme !== "file" ||
          !/\.cls$/i.test(document.uri.fsPath)
        )
          throw Error(
            "Open a Jade CLS class file in the source workspace before debugging an application.",
          );
        const folder = vscode.workspace.getWorkspaceFolder(document.uri),
          model = parseSource(document.getText(), document.uri.fsPath);
        if (!folder || !model.schema || !model.classes.length)
          throw Error(
            "The active CLS must declare a class and schema inside the current workspace.",
          );
        const project = await scanProject(folder.uri.fsPath),
          applications = applicationCatalog(project);
        if (!applications.length)
          throw Error(
            "No native Application definitions were found in workspace DDX files. Pull the applications for the schema first. Application class names are not stored application names.",
          );
        const items = applications.map((application) => ({
          label: application.name,
          description:
            application.schema +
            " · " +
            (applicationTypes[application.type] ||
              "Native type " + (application.type || "unspecified")),
          detail: path.relative(folder.uri.fsPath, application.file),
          application,
        }));
        items.sort(
          (a, b) =>
            Number(b.application.schema === model.schema) -
            Number(a.application.schema === model.schema),
        );
        const selected = await vscode.window.showQuickPick(items, {
          title: "Debug Jade application",
          placeHolder: "Choose a stored native Application definition",
          matchOnDescription: true,
          matchOnDetail: true,
        });
        if (!selected) return;
        const application = selected.application;
        if (!["S", "N", "T"].includes(application.type))
          throw Error(
            "This debugger currently supports native non-GUI applications (applicationType S, N or T). " +
              application.schema +
              "::" +
              application.name +
              " uses " +
              (application.type || "an unspecified type") +
              ". GUI message-loop debugging is not supported yet.",
          );
        let schema = project.schemas.find(
            (item) => item.name === application.schema,
          ),
          program;
        const seen = new Set();
        while (schema && !seen.has(schema.name)) {
          seen.add(schema.name);
          program =
            schema.name === model.schema
              ? document.uri.fsPath
              : schema.classes[0]?.file;
          if (program) break;
          schema = project.schemas.find((item) => item.name === schema.parent);
        }
        if (!program)
          throw Error(
            "No CLS class source exists for schema " +
              application.schema +
              ". Pull its class source before debugging this application.",
          );
        const parameter = await vscode.window.showQuickPick(
          [
            {
              label: "No startup argument",
              description: "Use a zero-argument native initializer",
              argument: false,
            },
            {
              label: "Supply String argument",
              description:
                "Pass a String to the native initializer (empty is allowed)",
              argument: true,
            },
          ],
          {
            title: "Jade startup parameter",
            placeHolder:
              "Match the configured application initializer signature",
          },
        );
        if (!parameter) return;
        let applicationParameter;
        if (parameter.argument) {
          applicationParameter = await vscode.window.showInputBox({
            title: "Application startup String",
            prompt:
              "Passed to the configured native initializer. An empty String is valid.",
            ignoreFocusOut: true,
          });
          if (applicationParameter === undefined) return;
        }
        return await vscode.debug.startDebugging(folder, {
          type: "jade-native-experimental",
          request: "launch",
          name: "Jade: " + application.schema + "::" + application.name,
          program,
          schema: application.schema,
          launchMode: "application",
          application: application.name,
          ...(parameter.argument ? { applicationParameter } : {}),
        });
      } catch (error) {
        void vscode.window.showErrorMessage(error.message);
        return { error: error.message };
      }
    },
  );
  context.subscriptions.push(command);
  return command;
}
module.exports = { applicationCatalog, registerApplicationDebug };
