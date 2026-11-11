"use strict";
const { sourceTargetPath, relativeIdentity } = require("./source-pull-path");
const kinds = new Set(["class", "interface", "schema"]),
  components = new Set([
    "source",
    "schema-resources",
    "section",
    "application",
    "package",
  ]),
  identifier = (value) =>
    typeof value === "string" &&
    value.length <= 256 &&
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
/** Validate native output metadata only; native Jade owns inventory and source. */
function sourceArtifact(destination, relative, artifact, schemas) {
  sourceTargetPath(destination, relative);
  if (
    !artifact ||
    !identifier(artifact.schema) ||
    !kinds.has(artifact.kind) ||
    !components.has(artifact.component) ||
    (artifact.name !== undefined &&
      (typeof artifact.name !== "string" ||
        !artifact.name.length ||
        artifact.name.length > 256 ||
        /[\x00-\x1f\x7f]/.test(artifact.name))) ||
    (artifact.kind !== "schema" && !identifier(artifact.name))
  )
    throw Error("Invalid native source artifact metadata.");
  if (schemas && !schemas.has(artifact.schema.toLowerCase()))
    throw Error(
      "Native artifact belongs to a schema outside the requested scope.",
    );
  const parts = relativeIdentity(relative).split("/"),
    schema = artifact.schema.toLowerCase();
  if (
    parts[0] !== "schemas" ||
    !/\.(scm|sec|cls|ddx)$/i.test(relative) ||
    !(
      (parts.length === 2 && parts[1] === schema + ".scm") ||
      (parts.length >= 3 && parts[1] === schema)
    )
  )
    throw Error(
      "Native source artifact path is outside its schema resource layout.",
    );
  const resource = /\.ddx$/i.test(relative),
    aggregate =
      parts.length === 3 &&
      parts[2] === "schemaresources.ddx" &&
      artifact.kind === "schema" &&
      artifact.component === "schema-resources";
  if (
    (resource && !aggregate) ||
    (!resource && artifact.component === "schema-resources")
  )
    throw Error(
      "Full extraction requires the canonical schema resource aggregate layout.",
    );
  return [
    artifact.schema.toLowerCase(),
    artifact.kind,
    artifact.name?.toLowerCase() || "",
    artifact.component,
  ].join("::");
}
module.exports = { sourceArtifact };
