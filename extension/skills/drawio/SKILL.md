---
name: drawio
description: Create or edit native editable draw.io diagrams and export their SVG, PNG or PDF views. Use for .drawio files, draw.io architecture diagrams, flows, relationships and requested diagram exports.
---

# Editable draw.io diagrams

Keep the editable diagram as the source of truth. Preserve the user's diagram concepts, requested format and project conventions; do not introduce architecture components or relationships that have not been established.

## Workflow

1. Inspect an existing diagram's pages, groups, cell identities, connectors and styling before changing it. Reuse those structures when extending the diagram.
2. Author native `.drawio` XML or use an available draw.io editor/import tool. A Mermaid file or ordinary SVG renamed to `.drawio` is not native editable source.
3. Use explicit groups for meaningful boundaries, consistent shape styles and typography, short labels and a clear reading direction. Keep connectors attached to the correct source and target cells. Avoid unexplained colors and overlapping labels.
4. Open or render the actual diagram with an available draw.io tool, inspect the result and correct clipping, routing or missing elements. XML parsing alone does not verify layout.
5. When an export is requested, create it from the diagram using the installed editor or supported CLI. Keep the `.drawio` source alongside requested exports unless the user requests otherwise. Where supported, include embedded diagram data so an exported SVG remains editable.

For direct XML, use an `mxfile` containing a `diagram` and `mxGraphModel`. Its root needs the base `mxCell` records with IDs `0` and `1`; vertices and edges have unique IDs and valid parent/source/target references. Vertices need geometry; edges need relative geometry. Escape XML attribute values and keep referenced shape libraries available to the renderer.

Locate an installed renderer rather than assuming a developer-specific path. A common Desktop export command is:

```text
drawio --export --format svg --embed-diagram --output architecture.drawio.svg architecture.drawio
```

Check the installed CLI's help/version before using optional layout or import flags. If converting Mermaid through Desktop, convert it to a native `.drawio` document before exporting. Report a missing renderer or unverified export honestly; do not manufacture a placeholder screenshot or silently delete the source.

Prefer local tooling for private diagrams. A diagram skill does not install the draw.io editor, authorize cloud uploads, or change application/database configuration.

## Official references

- [draw.io documentation](https://www.drawio.com/doc/)
- [Editable source and file formats](https://www.drawio.com/doc/faq/save-file-formats)
- [SVG export and embedded diagram data](https://www.drawio.com/doc/faq/export-to-svg)
- [draw.io Desktop and CLI](https://github.com/jgraph/drawio-desktop)

Use the project's Mermaid skill when the requested deliverable is a text-based Mermaid diagram rather than a draw.io document.
