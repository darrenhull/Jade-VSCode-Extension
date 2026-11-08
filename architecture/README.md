# Runtime architecture

The diagram describes the shipped extension and its optional MCP integration. The class editor and read-only object views are presentation inside the extension.

- [Editable Draw.io source](jade-tools.drawio)
- [Rendered SVG with embedded Draw.io XML](jade-tools.drawio.svg)

## Boundaries

| Boundary | Responsibility |
| --- | --- |
| VS Code extension | JavaScript presentation, editor integration, Testing, debugger UI, source creation and explicit publication review. The CLI is bundled in the VSIX. |
| Native C++ CLI and broker | Configuration, workspace/dependency selection, job ownership, cancellation and warm native sessions. Matching CLI builds can share the per-user broker. Compatible Working operations reuse its native node. |
| Our C++ helpers | Typed native compile and test execution share the Working node with a separate native read-only inspection context. Scratch Pad hands off to the supported non-GUI Jade client for reliable write output. Source inspection stays separate. Structural loads reconnect; debugging takes an exclusive lease. Vendor tools also perform native database/schema operations. |
| Installed Jade runtime | Compiler, Object Manager, database utilities and runtime semantics. Vendor DLLs and databases are not shipped by these repositories. |
| Workspace files and Git | Application source and user-reviewed commits. Build/test consume saved source; previews and Scratch Pad have explicitly described unsaved-buffer behaviour. |
| Private storage | System metadata cache, broker state and Working databases outside the source checkout. The metadata cache does not replace an executable database. |
| Source database | Explicit extraction, native consistent backup, read-only inspection and user-confirmed publication. |
| Working database | Native compilation, tests, debugging and scratch execution. Application code can write Working data and access the operating system as permitted. |
| Optional MCP server | Official SDK protocol adapter with a packaged runtime and its own verified CLI; data inspection is read-only. MCP does not expose Source publication. |

Arrows show simplified operation/data dependencies. The snapshot arrow is a native consistent backup/restore operation, not a direct filesystem copy or live synchronization. Editor-only source features can work without a database connection; native build/test execution uses Working and the installed runtime.

## Edit and export

Open **jade-tools.drawio** in Draw.io, then export the SVG with **Include a copy of my diagram** enabled. Keep both files committed so reviewers can inspect the image and maintain the editable source.

With Draw.io Desktop available on PATH:

~~~text
draw.io -x -f svg -e -b 20 -o jade-tools.drawio.svg jade-tools.drawio
~~~

Run that command from this folder. Desktop installations on Windows may require the full executable path. Visually check the SVG after exporting and update the root README links if the filenames change.
