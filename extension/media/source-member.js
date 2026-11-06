"use strict";
const vscode = acquireVsCodeApi(),
  $ = (id) => document.getElementById(id);
let revision;
$("original").onclick = () => vscode.postMessage({ command: "openOriginal" });
window.addEventListener("message", ({ data }) => {
  if (data.command === "error" && data.revision === revision) {
    $("status").textContent = data.message;
    return;
  }
  if (data.command !== "member") return;
  revision = data.revision;
  const member = data.content;
  $("class-name").textContent = member.schema + " :: " + member.owner;
  $("member-name").textContent = member.member;
  $("member-kind").textContent = member.kind;
  $("source-path").textContent = member.file;
  $("source").replaceChildren();
  for (const segment of member.segments?.length
    ? member.segments
    : [{ text: member.text }]) {
    const span = document.createElement("span");
    span.textContent = segment.text;
    if (segment.kind) span.className = segment.kind;
    $("source").append(span);
  }
  $("status").textContent = member.missing
    ? "The source changed; this member could not be found."
    : "Read-only preview. Unsaved edits in the original source appear here.";
  vscode.postMessage({ command: "rendered", revision: data.revision });
});
vscode.postMessage({ command: "ready" });
