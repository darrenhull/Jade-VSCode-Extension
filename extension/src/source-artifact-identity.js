"use strict";
// Logical identity for unsaved class/interface views, independent of file layout.
function sourceArtifactIdentity(artifact) {
  return artifact &&
    ["class", "interface"].includes(artifact.kind) &&
    typeof artifact.schema === "string" &&
    typeof artifact.name === "string"
    ? JSON.stringify([
        artifact.schema.toLowerCase(),
        artifact.name.toLowerCase(),
      ])
    : undefined;
}
function projectArtifactIdentity(projectId, artifact) {
  const identity = sourceArtifactIdentity(artifact);
  return typeof projectId === "string" && identity
    ? projectId.toLowerCase() + "::" + identity
    : undefined;
}
module.exports = { sourceArtifactIdentity, projectArtifactIdentity };
