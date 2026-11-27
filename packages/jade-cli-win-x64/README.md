# Jade CLI — native C++

## 0.11.11

- Set up an existing Working database using only saved Git changes, without building the full source catalogue first.
- Reuse the source catalogue after restarting, refreshing changed files only.
- Show setup stages and elapsed progress, with broker exit details when a connection fails.
- Preserve ignored deletions and saved edits hidden by Git index flags.

`jade-cli.exe` is a native Windows C++ executable. Command handling, configuration discovery, the shared broker, dependency selection, Working database preparation and build/test orchestration run in C++. There is no embedded Node runtime, JavaScript engine or Python process in the CLI.

Jade's installed native tools and object manager perform compilation and execution. The distribution includes our native helper executables, not Jade vendor DLLs or a database. A compatible licensed Windows Jade installation is required for connected operations. Terminal commands and JSONL service requests use the same native implementation.

The JOX engine is pinned to JadeGit v0.18.1. Native JOX operations require matching packaged components and qualification for the installed Jade character mode. A publication cursor from a different engine is not replayed or deleted; existing source files and Working data are preserved.

## Project Working files

JOX projects default to the existing configured `databasePath` as Working. Saved Git source under `schemas` (or the repo-relative `schemaPath`) is reconciled directly into that database after reviewed confirmation. This route creates no second database and performs no extraction, backup or restore. See [Existing Working checkout synchronization](#existing-working-checkout-synchronization) for its supported changes and safety checks.

Explicit `workingMode: "source-backed"` retains the isolated database workflow described below. In that mode, new configured workspaces default their managed Working database in the first selected workspace root under `.jade/working`. This is persistent unpublished state, separate from disposable `.jade/source-index` metadata. An explicit `workingDatabaseDirectory` still selects an external or dedicated project Working directory. Relative explicit paths in `jade.json` resolve against that configuration file. The automatic default follows the configured workspace root, not process cwd. Recreate generations use separate descendants and preserve previous data.

`jade-cli init` requires Git on PATH. It reuses an existing repository (including an ancestor or linked worktree), or initializes the project directory, and ensures the project `.gitignore` excludes the entire managed `/.jade/` directory. Existing configuration and ignore-file bytes/rules are preserved; repeated setup is idempotent. It does not stage, commit or push source files.

All native source discovery excludes `.jade`; explicit source selections beneath it are refused. New managed Working directories ignore their contents in Git. Only `.jade/working` and its descendants may overlap a source workspace; Source database overlap and redirected paths remain forbidden.

Moving a database directory does not update absolute INI paths or recorded ownership. A moved, incomplete or redirected Working copy is refused and preserved; do not delete it or treat it as index cache. Restore its original layout or choose a new empty Working location until verified relocation is available. Existing configured external paths are retained. When no project Working directory exists, an existing ready base in the previous private storage location remains selected, preserving unpublished state; an explicit override selects a new location. Source installation paths, published schemas and user configuration are never rewritten by location selection.

## Native connection reuse

Database Objects follows development inspection behavior only when JADE positively confirms a usable development environment. Configured development-security authentication and per-class task denials remain mandatory. Production/runtime inspection retains inherited application `allowedToInspect` filters. The internal JADE eligibility method is qualified on ANSI and Unicode JADE 2025; missing or changed metadata uses deployed policy, while actual native failures deny with their original diagnostics. The helper reads eligibility again for each authorization request.

The first inspection or build opens its native target when needed. Working inspection shares the retained compiler/test node through a separate thread-affine application signed on with native `DB_READ_ONLY`; the update application remains separate. Source inspection shares its own read-only node. A first Working inspection can prepare the ordinary private backup/restore copy automatically; it never publishes local files to Source. Cancellation during its Source backup is observed after that backup completes and before private restore; configured native timeouts still apply.

Working preparation starts a fresh private backup when no verified snapshot is available. A completed native-verified backup survives restore failure or cancellation; the next attempt validates it with native checksums and resumes that captured snapshot without backing up Source again. Progress shows its capture time: this resumes the same snapshot rather than claiming the latest Source data. Each restore uses a fresh owned directory, and completed restores can recover an interrupted promotion without repeating backup or restore. Protected checkpoints bind the Windows user, Source, configuration and owned directories; incomplete or unverified attempts use fresh staging, while a recorded completed snapshot that fails integrity checks is preserved with a clear error and no silent rebackup. Earlier backups are preserved; authenticated owned staging is cleaned only after Working is safely ready. A temporary deletion lock produces a cleanup warning without invalidating a successfully restored Working database. Unsafe linked/overlapping destinations, changed unmanaged Working INIs and pre-existing unowned restore files are refused instead of overwritten. Progress reports the Source read path, backup write path and Working restore path. Application/security settings and unknown custom INI paths remain unchanged; Working isolation is not an operating-system sandbox.

Method-only builds, test switches and repeated inspection reuse a healthy compatible Working node. Structural loads close it for the native loader/reorganisation path and reopen it automatically. Scratch Pad still uses its native `jadclient` handoff, then the next compatible operation reconnects lazily. Debugging keeps its existing exclusive helper ownership; a paused debugger is not stopped to run another tool.

When local inputs are required, automatic tests and Scratch refuse an existing Working database with unverified source proof or no usable compiled-input inventory. Run `jade-cli build <intended-file>` for explicit scoped reconciliation under the configured JADE development policy; proof is published only after a successful native load. A fresh restore created by the same operation may perform its initial scoped compilation. Existing records remain evidence; rebuilding `.jade/source-index` does not establish a Working baseline. Native error6295 and JadeGit developer-session requirements remain native policy failures. External in-place writes or restores retaining both file identities remain outside this bounded identity check.

Each inspection consumer owns its cursors. Closing a view or service channel releases only that consumer, retaining the healthy connection. An explicit `inspect.close` service request with `args.disconnect: true` releases the selected physical target when no other inspection consumer owns it; another target is left open. The same request can release an idle retained target after logical close when its original config and target are supplied. A refusal still releases the caller's logical resources.

Inspection results include opaque `body.connectionEpoch`. Clients can send the last value as `args.connectionEpoch`; after reconnect, a stale request returns `staleConnection: true` with the new epoch before accessing old handles. Refresh from a fresh catalog rather than replaying a cursor. Native cursor tokens are independently scoped to their consumer and node lifetime.

## Commands

Unzip the Windows x64 distribution and run `jade-cli.exe help`. Keep its adjacent `native` folder with the executable. Add the distribution folder to PATH to use `jade-cli` from any working folder. Neither users nor CLI builders need Node or npm.

```text
jade-cli init --profile demo --install C:\Jade2025
jade-cli doctor --json
jade-cli build --json
jade-cli test .\FishTest.cls --json
jade-cli sync --config jade.json --json
jade-cli workspace run .\scratch.jade --schema ExampleSchema --json
jade-cli tests list --config jade.json --json
jade-cli source search --config jade.json --query Fish --json
jade-cli source compare --schema ExampleSchema --class Fish --file schemas/ExampleSchema/types/Fish.cls --base HEAD --json
jade-cli inspect catalog --config jade.json --target working --json
jade-cli inspect instances --config jade.json --target working --args "{...}" --json
jade-cli status --json
jade-cli disconnect --json
jade-cli shutdown --json
```

The CLI automatically finds the nearest `jade.json` in the current folder or its parents. Paths inside that configuration are relative to the configuration file; source arguments are relative to your terminal's current folder. `--config` selects a different configuration explicitly.

```powershell
jade-cli build .\Fish.cls .\Hampster.cls
jade-cli test .\FishTest.cls .\HampsterTests.cls
```

Run `jade-cli build` without filenames to scan the configured project, including newly added files. It ignores any legacy selected `program` setting and compares current source against the last successful Working build. Unchanged native inputs are reused; method-body-only edits can use incremental CLS loads. New classes, schema declarations and structural changes use native `jadloadb` with Latest Schema Version. The CLI releases its owned Working helper, lets Jade perform and finish any required reorganisation/transition, then confirms a healthy native reconnection. Persistent Working data is reorganised by Jade rather than recreated. Proven method-body-only changes keep the retained Current Schema Version fast path. Signature, declaration or metadata changes conservatively use the structural path; Jade decides whether an actual reorganisation is required. The same policy prepares builds, tests and Workspace code. A failed load invalidates reusable build claims while retaining managed source identities, so retries cannot skip the failure or execute a removed local schema through stale Working definitions. Git and the shared metadata cache identify saved inputs; the successful Working inventory remains the compiled-state authority. This does not publish to Source. Configured roots must belong to the same supported Git worktree.

Multiple build files are supplied together to one native project build. Multiple test files run sequentially through the same shared session, with a result for each file and a failing exit status if any fails. Duplicate source arguments are removed. Quote paths containing spaces. Pass explicit filenames; wildcard expansion is not implemented. These commands use the isolated Working database and do not publish to Source.

Owned generated join/load sources are removed after native consumers stop and diagnostics are mapped. Failed generated sources remain available until the next native load attempt for the same Working target. Cleanup examines a bounded ownership record rather than sweeping older folders; locked or unconfirmed consumers preserve their files and report the exact path. If all four retention slots remain blocked, a new load is refused before allocating more sources.

Structural schema compiler failures include native source diagnostics as well as their Jade error code. The helper captures only the current load's bounded compiler log. Unambiguous generated source lines map back to their original local file with the native position/length; ambiguous mappings retain the actual generated file and line rather than guessing a location. A successful retry clears the failed load's diagnostics.
`--args` takes a JSON object with native inspection fields such as `classOid`, `oid`, `cursor` and `limit`. Pages are bounded to 100. Inspection defaults to Working; `--target source` explicitly selects the original database. Use the persistent service for cursor paging across requests.

The result reports `native_load_style`, `native_load_milliseconds` and `native_reconnect_milliseconds` when loading occurs. A failed native load or reconnect does not establish a successful input baseline or start dependent code; native commits can already exist after failure. Source publication remains a separate explicit operation. See [the checked-in implementation plan](https://github.com/darrenhull/Jade-CLI/blob/main/plans/automatic-structural-loading.md).

## Pull native source into a workspace

Start in a new project folder, configure its Jade installation, then pull all user schemas from Source:

```powershell
mkdir C:\Git\JadeWorkspace
cd C:\Git\JadeWorkspace
jade-cli init --profile demo --install C:\Jade2025
jade-cli source extract --all --json
```

To pull one named schema into the configured workspace instead:

```powershell
jade-cli source extract --schema ExampleSchema --json
```

Both commands select the native **current** schema version and read Source without publishing changes to it. Latest-version extraction is not supported. The destination is one existing configured workspace root; use `--workspace` when the project has several roots. `--all` cannot be combined with a named schema, class or output path.

The full-source layout contains native CLS files and schema section files under `schemas/<schema>/`, with the schema header alongside that folder as `schemas/<schema>.scm`. Each schema has one complete native resource file at `schemas/<schema>/schemaResources.ddx`, covering its forms and other native schema resources. Full pulls do not also produce individual DDX sidecars. Build/test loading consumes the aggregate once. A destination containing older individual DDX files requires an explicit layout migration; extraction stops before writing rather than silently mixing both layouts.

One read-only native batch session writes a complete file into a private candidate beside its destination, then hashes, compares and reconciles that file before continuing. Unchanged files retain their timestamps. Accepted remote baselines preserve local-only edits and local deletions; simultaneous local and remote changes remain conflicts, and an unmanaged differing file is not overwritten. IDE clients must grant each changed-file promotion after checking dirty editors. Terminal commands cannot inspect unsaved editor buffers.

Files apply one at a time. Cancellation, failure or a later conflict can therefore leave earlier successful files applied; the result reports this partial outcome. Unpromoted candidates are discarded after native closure. Conflicts and rejected promotions return `result.code: 4` and `passed: false`; inspect the final result even when earlier files were added or updated. Files absent from the native inventory are not automatically deleted from the workspace. Each pull still exports the requested scope through Jade; unchanged-file comparison avoids workspace rewrites rather than claiming an incremental native export.

To compare a full pull with a specific committed Git baseline, run from the repository root:

```powershell
jade-cli source extract --all --base HEAD --json
```

The explicit ref is resolved once for the whole operation. Git blob IDs use the repository's SHA1 or SHA256 format and exact file bytes, including formatting, BOM and line endings; no clean filter runs. The CLI adds `gitComparison` metadata to file outcomes and the final summary. This comparison context never grants permission to replace a file: accepted native baselines and current editor permits still protect committed-but-unpublished, staged, unstaged and deleted local work. Without `--base`, existing extraction behavior is unchanged. Git's index, refs, HEAD and object database remain unchanged.

The summary counts tracked paths in the selected schema namespace that were not emitted, with a bounded sample. These are reported as `baselinePathsNotExtracted`, not silently assumed equal or automatically deleted. Native extraction still serializes every selected artifact; Git comparison avoids additional payload reads and does not claim incremental database export.

Progress distinguishes native inventory, local snapshot, native writing, completed-candidate hashing/comparison, guarded apply and native close. The result separates native-write, hash/compare, guarded-apply and Git-baseline timing from total wall time.

A selected class can still be pulled to an explicit relative path:

```powershell
jade-cli source extract --schema ExampleSchema --class Pet --output schemas/ExampleSchema/types/Pet.cls --json
```

This route requires `--output` within the chosen root and supports its existing native CLS/Form-sidecar contract. Application, external-component and custom-control sidecar cases fail clearly. A Form in a schema using `schemaResources.ddx` requires a full schema refresh rather than a second individual DDX file. Selected classes do not establish an authoritative schema inventory.

### JSONL source clients

In the qualified full-source package, `doctor.capabilities.sourceExtraction` reports protocol 1, scopes `classes`, `schemas` and `all`, versions `["current"]`, `fullSchema: true`, `layout: "schema-ddx"` and required client promotion permits. Check that capability before offering full extraction; older packages can advertise classes-only support.

JSONL clients send `source.extract` with `config`, an absolute existing `destination` and `promotion: "client"`. Use `scope: "all"` for all user schemas, or `scope: "schemas", schemas: ["ExampleSchema"]` for named schemas. Full scopes cannot be mixed with class selection. Add an explicit `base: "HEAD"` (or another ref) to request Git comparison context. Selected-class requests retain explicit `selection: [{schema, name, kind: "class"|"interface", path}]`.

The typed `source.started`, `source.stage`, `source.permitRequired` and `source.file` events retain the extraction request id. Reply to promotion tickets using `source.permit` with their lease, ticket and allow boolean; `source.cancel` uses the owning lease. Both controls bypass the native job queue. Before receiving a lease, use the existing cancel operationId. Expired permits and client disconnection deny unpromoted files and wait for native closure. Total extraction deadlines are checked synchronously before terminal and client write grants, including when the background control reader is delayed. Client tickets advertise at most 30 seconds, bounded by the remaining total extraction budget. Cancellation publishes its first reason before the cancellation flag; later timeout or stale frames preserve that cause.

The compact final result follows actual process exit and reports counts, appliedFiles, completedFiles, status, partial, scope and native stage timings. Only a successfully completed full pull without conflicts or rejected promotions reports `authoritative: true`. Failed, cancelled and selected-class pulls cannot establish that authority. Events contain file metadata rather than source bodies. See the checked-in [full-schema implementation plan](plans/full-schema-source-extraction.md) and [selected-source plan](plans/selected-source-extraction.md) for the protocol and baseline details.

## Compare selected class source with Git

`jade-cli source refresh --workspace <folder>` explicitly initialises or repairs the disposable `.jade/source-index` metadata cache from saved Git workspace files. It works without a Jade installation, database or connection profile, including a newly initialised repository without a commit. The cache stores derived metadata and exact raw-byte identities, never source bodies, and is independent of the successful Working build inventory. Git is required; untracked and ignored native source files remain inputs. The native CLI is the sole cache writer. JSONL clients use `source.index.refresh`, `source.index.prepare` and digest-bound `source.index.browser.update`; `doctor.capabilities.sourceIndex` advertises the format and native version. The cache metadata contract is independent of the CLI release number. Verified 0.10.10/0.10.11 caches can adopt the current contract from their existing metadata while still checking current Git candidates; unknown or incomplete formats require explicit refresh. Invalid or incompatible cache state requires an explicit refresh. Build, test and Scratch Pad use this same preparation service. Class/test queries reuse its native metadata, and a CLI test invocation verifies one shared snapshot for all selected classes. Tests and Scratch Pad still execute natively on every request. Ordinary preparation reads Git status and committed changes since the cache baseline, captures only candidate source contents and reuses unchanged cached metadata. Previous dirty paths remain candidates until a clean revert has been captured. Changes to Git normalisation, clean filters or `.gitattributes` require an explicit `jade-cli source refresh`; Git may otherwise consider raw-only formatting changes clean. Assume-unchanged/skip-worktree source flags and sparse source worktrees are rejected. Initial refresh and cold native compilation are separate from unchanged execution costs.

`jade-cli source compare --schema ExampleSchema --class Fish --file schemas/ExampleSchema/types/Fish.cls --base HEAD --json` compares CURRENT class source in the configured Source database, the selected committed Git baseline and the current local file. Run it at a checked-out Git repository root with one configured workspace root, or select that root using `--workspace`. Git must be installed on PATH; the verified Git version is 2.48.1 and comparison requires its `--no-lazy-fetch` option. `doctor.capabilities.sourceComparison` reports the packaged capability. The baseline can be a commit or ref; it is resolved once and remains fixed if HEAD later moves. Selected comparison reads only the path's parent-tree listings rather than recursively inventorying unrelated source trees.

The result includes all three Git blob IDs and an explicit change/conflict status. A completed comparison returns code 0 even when it finds a conflict; scripts must inspect `status` before any separate merge or publication. This is read-only: it does not change Source, Working, local source files, the Git index, refs or object database. Missing native classes are absent targets; native errors remain errors. A genuine native owner mismatch requires its defining schema; official per-schema placeholders such as Object.cls are preserved. This first command compares class CLS source only; it does not claim full schema, DDX/resource or database deletion inventory, or implement a pull/publish merge.

Comparison hashes **exact bytes** using the repository's SHA1/SHA256 Git blob rules. It preserves formatting, BOM and line endings and runs no Git clean filters. If your Git commit normalizes CRLF to LF, those different bytes are reported as a difference. It uses the same native section-CLS serializer as extraction; a different native memory-envelope representation is not silently normalized to match.

Jade serializes one selected class into one owned private candidate. The CLI hashes it and removes it after the native connection closes; it does not create another complete source tree. Cancellation waits for the current native serializer to finish and close safely. This selected-class command is a first integration slice; a future full-schema comparison must reuse a single baseline/session rather than invoke it once per class.

## Jade Workspace execution

`jade-cli workspace run scratch.jade --schema ExampleSchema` executes a signature-free native Jade Workspace, for example:

```jade
vars
    value : Integer;
begin
    value := 40 + 2;
    write value;
end;
```

The CLI prepares saved source in the selected Working database before executing the supplied script. In default JOX existing mode, that is the configured database and committed persistent changes remain there. Explicit source-backed mode uses its separate private Working copy. The following full-schema preparation details describe the preserved legacy CLS workflow; the bounded direct JOX changes are described in Existing Working checkout synchronization. Saved headers and resources are included even when a schema has no class files. Within selected filesystem schemas, source is authoritative: removed local classes are removed from Working on the next preparation when the schema header declares completeDefinition; a partialDefinition header fails closed for class deletion; unrelated schema inventories are retained. Removing an entire managed schema header fails closed and requires restoring the header or an explicit complete project build. Each invocation has independent local variables. Committed persistent changes affect Working and can survive later runs; this is not an automatic rollback sandbox. A separate Source database is not published by the Scratch command. RootSchema script execution is rejected by Jade, so choose a user schema for compilation. Execution uses the fixed native RootSchemaApp application context. Custom application contexts are not exposed. `write` output is captured; interactive input, GUI code and Workspace debugging are not exposed. The initial execution mode is void, so print values rather than returning a value.

ANSI Scratch uses the reviewed native payload and registered SDK/build controls. Packaging binds the exact current helper, component and provider hashes without claiming that rebuilt bytes were connected-tested. Historical connected receipts remain bound to their original package identities and are not release gates. Unqualified Unicode Scratch stays unavailable.

The JSONL operation is `workspace.run`, with `config`, exact `sourceText`, an optional `source` URI label, and optional zero-based `lineOffset`/`columnOffset` for a selected source snapshot. The result preserves native compiler codes and UTF-16 positions/lengths in `report.diagnostics`, with one-based source line/column, plus `report.output`, execution state and Working identity. Clients must inspect `passed` and diagnostics: a handled Jade compiler error can accompany a native process exit code of zero. Cancellation/timeout stop the owned process; partial redirected output can remain buffered until exit.

Progress identifies local source scanning, scope/dependency planning, Working preparation and native helper/client waits with elapsed times. These stages do not confirm script execution. Shared native-helper startup and response waits use one request deadline even when progress packets continue; Working backup/restore and other stages retain their own limits. Missing completion markers remain execution-unconfirmed; console output retains its ANSI-safe buffering.

Workspace input is limited to 64 KiB of UTF-8 text; result output is bounded to 256 KiB and indicates truncation. Standard input is closed: a Jade `read` receives EOF/default input instead of asking the user, so code containing `read` may still complete with an empty/default value. The verified `jadclient` runtime emits redirected output using the Windows ANSI code page, which the CLI decodes before returning UTF-8 JSON. `outputEncoding` identifies that code page. Jade can replace characters unavailable in that encoding, so this path does not promise lossless Unicode console output. Source snapshots retain their original encoding; diagnostics preserve the source locations supplied by native Jade.

Structural load errors also use Jade's per-load compiler log. An unambiguous source line is mapped back to its original local file. If a generated line cannot be identified uniquely, the diagnostic retains the actual generated file and native location rather than guessing a user source line.

## Project setup

Register a machine connection once, from your project folder:

```powershell
jade-cli init --profile demo --install C:\Jade2025
jade-cli build
jade-cli test .\FishTest.cls .\HampsterTests.cls
```

`init` creates a minimal `jade.json` suitable for source control:

```json
{ "connection": "demo" }
```

The installation path lives in your private `%LOCALAPPDATA%/JadeTools/connections.json`, outside the repository. The CLI infers the configured database as `<installPath>/system`, its INI as `<databasePath>/jade.ini`, and the workspace root as the folder containing `jade.json`. JOX default mode uses that existing database as Working. Explicit source-backed mode treats it as Source and creates its separate private Working copy. Projects that need separate data must select different database paths. Initialization writes configuration only; it does not connect, extract, compile or publish source.

Native helper selection defaults to `"characterSet": "auto"`. The CLI detects whether the configured installation uses ANSI or Unicode and selects the matching packaged helper before opening a native session. An optional `characterSet` preference can be stored in the project configuration or a private connection profile; a project preference overrides the profile. The accepted values are exactly `auto`, `ansi` and `unicode`. A conflicting preference fails with the requested and detected modes; it does not convert a database or substitute vendor DLLs.

```json
{ "connection": "demo", "characterSet": "ansi" }
```

Normally omit this preference and leave detection automatic. Runtime selection does not establish support for every debugger ABI; debugging still requires a verified matching native profile.

For a detected installation, feature availability uses that exact ANSI or Unicode package variant. Another variant cannot supply initialization, tests, synchronization, Scratch or debugger qualification. An unconfigured doctor can show the aggregate installed-package inventory; Scratch remains unavailable until a compatible runtime has actually been detected. Running Scratch also requires its own connected qualification, independently of compilation and tests.

A missing `jade.json` is initialized automatically by `build`, `test` or `workspace run`. With one saved connection it is selected automatically. With several, use `--profile demo`; an interactive terminal can choose from a list. With no saved connection, use `--install`, set `JADE_INSTALL` (or `JADE_HOME`), or enter the installation folder when prompted. Piped input, JSONL services and CI never prompt: ambiguous or missing setup returns a clear configuration error. An explicitly named missing `--config` file is an error, rather than an implicit new project.

Reuse the connection in another project:

```powershell
cd C:\repos\another-project
jade-cli init --profile demo
jade-cli build
```

On a different machine, a checked-in `{ "connection": "demo" }` can be connected with `jade-cli init --install C:\Jade2025`. Existing project files are preserved byte-for-byte. Existing profile names cannot silently be repointed to another database: register a different name for a different connection.

Override a machine's Source location when creating a profile, including MultiUser mode when required:

```powershell
jade-cli init --profile shared --install C:\Jade2025 --database D:\JadeData --ini D:\JadeData\jade.ini --server multiUser
```

Project overrides remain optional and relative to `jade.json`:

```json
{
  "connection": "demo",
  "schema": "ExampleSchema",
  "workspaceRoots": ["schemas"],
  "databasePath": "../another-base"
}
```

Command-line `--profile`, `--install`, `--database`, `--ini`, `--server` and `--schema` override the selected configuration for that invocation. Source arguments remain relative to the terminal folder. `--workspace` selects a workspace root. Full legacy JSON configurations with explicit `installPath`, `databasePath`, `iniPath`, `storagePath` and other settings continue to work. Optional `files`, `methods`, `testDependencyScope`, `workingDatabaseDirectory`, `workingDatabaseGeneration` and `timeoutMilliseconds` retain their engine meanings. Credentials are session inputs, not checked-in configuration. Saved JOX semantic preparation uses `sourcePreparationTimeoutSeconds` (integer 1..7200, default 900 seconds), unless resolved `timeoutMilliseconds` is explicitly configured. This preparation-only fallback does not change later test or Scratch execution deadlines. Working preparation utilities (backup, retained-backup verification and restore) use `workingDatabaseTimeoutSeconds` (integer 1..86400, default 7200), independently of `testTimeoutSeconds` (default 120). An explicit `timeoutMilliseconds` retains precedence for API clients. Native stage start/completion, elapsed time and effective limits are logged; per-map backup completion does not mean the whole backup has completed.

**Disable JadeGit for the Working database:** set `workingJadeGitPolicy` to `"disabled"`. The default is `"inherit"`; Source is unchanged.

For isolated automation, `JADE_TOOLS_CONNECTIONS_FILE` selects an absolute private profile-file path. For example:

```powershell
$env:JADE_TOOLS_CONNECTIONS_FILE = "$env:LOCALAPPDATA\JadeTools\ci-connections.json"
$env:JADE_TOOLS_STATE_DIRECTORY = Join-Path $env:TEMP ("jade-ci-" + [guid]::NewGuid().ToString("N"))
jade-cli init --profile ci --install C:\Jade2025 --json
jade-cli build --profile ci --json
```

The broker inherits these environment settings when it starts. Choose a fresh private `JADE_TOOLS_STATE_DIRECTORY` for isolated automation, as above, or run `jade-cli shutdown` before changing the profile-file location. Changing an environment variable does not reconfigure an already-running broker.

CLI results preserve native errors and diagnostics. Progress goes to stderr; final JSON goes to stdout. Exit codes are 0 success, 1 operation failure, 2 transport/configuration failure, and 130 reported cancellation.

When a headered project selects a dependency from another schema, that schema must also have a `.scm` or `schemaDefinitions.sec` supplied in the workspace or `config.files`; otherwise the build fails before loading, rather than using a stale database definition.

## Native ownership and private state

Compile/test loads local changes into the selected Working database. The default is the configured existing database; explicit source-backed mode uses its separate private copy. Tests execute afresh; reusing a native session does not reuse old test results. Public publication commands are not exposed in this release.

Source inspection, retained Working sessions and migration catalog inspection pass startup settings through their inherited input pipe. Their ACL-protected launcher files contain only the installation path, character set and startup protocol. CLI and helper transport versions must match; incompatible startup fails without writing credentials to a fallback file.

An authenticated per-user named-pipe broker owns native processes and retains a warm compile/test session. Its credential directory has a Windows owner-restricted ACL; the local protocol also requires a random token. Clients do not receive tokens in output. Native jobs currently serialize globally, including independent Working bases: safe ownership takes precedence over parallel execution.

A held inspector/debugger helper lease returns an explicit busy result to another client rather than terminating debugging or waiting indefinitely. Close that session before compiling. The broker releases warm runtime handles before external tools. Surviving native PIDs block broker restart until ownership is resolved. It never terminates unrelated Jade applications.

Default broker state: `%LOCALAPPDATA%/JadeTools/broker-v2-native`. Set `JADE_TOOLS_STATE_DIRECTORY` to a separate private directory for isolated tests. `disconnect` releases retained native sessions; `shutdown` closes the broker and its owned helpers. These affect clients sharing that broker. The native broker has a separate namespace from the archived Node implementation.

SingleUser Source must be available for initial backup. MultiUser Source uses native quiesced online backup: clients stay connected while updates briefly pause. Source server mode and original INI are not rewritten. Inspection is native read-only with security enforced. Test/application execution can mutate Working data.

## JSONL service

`jade-cli service --stdio` accepts JSONL:

```json
{"id":"1","command":"build","config":{}}
{"id":"2","command":"cancel","operationId":"1"}
{"id":"3","command":"sync","cwd":"C:/repos/example","config":{"sourceFormat":"jox"}}
```

`jade-cli sync` and JSONL `sync` apply saved JOX changes to an already initialized, owned Working database through the shared broker. They do not run tests, create Working, or write to Source. Check `doctor.capabilities.sourceSemantic.providers` for the JOX provider's `sync` boolean. Sync requires an explicit `sync: true` and managed upload qualification for the installed ANSI or Unicode runtime; older manifests default to unavailable. This is separate from the classic `working.sync` source extraction protocol.

On confirmed sync, `report.repositoryHead` identifies Working's accepted commit and `report.savedOverlayFiles` counts the saved paths that differ from that commit, including deletions. These fields also describe a confirmed no-op and do not include unsaved editor buffers.

### Existing Working checkout synchronization

Existing Working debugging is available for the exact supported ANSI debugger profile. Read-only object inspection remains tracked separately in issue #168.

JOX checkout setup defaults to the existing configured Working database: `databasePath` is Working, and `schemas/` lives directly inside the repository root. Preview with `working.location`; initial `working.initialize` requires the preview's `expectedWorkingIdentity` and `overwriteWorkingChanges: true`, acknowledging that unexported Working source may be overwritten. Complete explicit configuration needs no root `jade.json`. No Source, vendor seed, backup, restore, extraction or second database is used by this mode. Select `workingMode: "source-backed"` explicitly for the separate legacy database-backed workflow.

Set optional `schemaPath` in `jade.json` to the repository-relative native schema folder, for example `"schemaPath": "src/schemas"`. The default is `schemas`. The folder must exist inside the checkout, contain saved JOX, and be locally available. Nested parents are supported; the leaf remains lowercase `schemas` to preserve JadeGit's native layout. Absolute/network/outside paths and traversal are refused before synchronization. This does not rewrite the project file or move source.


The CLI checks local fixed storage and exact database/INI identity before writing, keeps execution-only files outside the database, and uses the maintained native JadeGit baseline plus saved disk source. Accepted cursors support no-op/restart and A-to-B-to-A method-body changes; failed/cancelled/partial apply never advances the cursor. The new baseline/direct binding must be included in the managed native component before shipment; older components refuse it. Confirmed initial overwrite supports bounded native method-body changes, including when recorded HEAD already equals disk. Unsupported metadata/structural changes are refused before dispatch.

The legacy explicit `workingMode: "git-first"` seed-backed route is separate from default existing-Working setup. In a saved JOX project, `workingMode: "git-first"` selects a private SingleUser Working generation from the saved checkout without a Source connection. A package that advertises JOX `checkoutInitialization` can preview the target with `working.location` and create it with `working.initialize`; pass the preview's Working identity as `expectedWorkingIdentity`. Set `workingSeedDirectory` to the verified vendor-only seed directory containing just `_control.dat` and `_monitor.dat`, not an application database or its INI. Setup refuses a runtime or seed whose bytes do not match the package's qualification. `working.prepare` only reopens an accepted generation; it never replaces a failed one. The Git-first capability is not enabled in shipping packages until the matching native producer is qualified.

Clients that review a Git-first Sync target must require both `sync` and `reviewedWorkingSync` in the JOX provider capabilities, then send the preview's opaque `working.identity` as top-level `expectedWorkingIdentity` on `sync`. The CLI rejects an empty, malformed, stale or replaced target before source staging or native dispatch; a successful reviewed Sync echoes `report.reviewedWorkingIdentity`. Omitted identities retain legacy configuration-owned Sync behavior and do not claim a reviewed target.

Obtain the seed from a licensed vendor **Fresh Copy** installation that matches the qualified release and character set. Before loading application schemas or opening it for development, copy the two vendor `.dat` files from its `system` directory to a separate local directory. Do not copy `jade.ini` or distribute the seed with the CLI or extension. Setup uses its own isolated INI and copies the approved files into Working; it does not open the seed itself. A failed or unsupported deployment preserves its output for diagnosis. After reviewing the failure, choose a new `workingDatabaseGeneration` to recreate from the saved checkout rather than deleting or reusing the old generation.

The release package checks the producer's checkout qualification separately for each character set. Enabling it requires the approved seed fingerprints and a connected qualification receipt bound to the exact packaged CLI, managed helper, component and provider. The producer must attest to Source-free setup, restart, branch and saved-edit round trips, a no-op, isolation and refusal of an unsupported change. Passing offline package checks does not substitute for those connected runs.

`config` accepts a private connection reference such as `{ "connection": "demo", "workspaceRoots": ["C:/repos/example"] }`, installation-only settings with inferred defaults, or the existing fully resolved settings. Native operations require a configured connection. Service setup is noninteractive; `{ "command": "cli", "operation": "init", "argv": ["--profile", "demo"], "cwd": "C:/repos/example" }` initializes a project without opening the database. Events are `{id,event:"output",text}` and `{id,event:"result",result}`. Build/test results include `code`, `passed`, `cancelled`, `report`, diagnostics and test outcomes. Commands: `doctor`, `status`, `build`, `test`, `workspace.run`, `tests.list`, `source.search`, `inspect.catalog`, `inspect.instances`, `inspect.object`, `inspect.collection`, `inspect.release`, `inspect.close`, `disconnect`, `cancel`, `shutdown`.

Inspection sessions bind target/configuration identity. Close an old session before changing target; object identities and cursors never transfer between Source and Working. Client transport loss cancels its active jobs and closes its owned helper/inspection sessions. Successful idle compile/test state can remain warm in the broker.

Inspection returns Jade's own object identity strings unchanged, using the fixed native `getObjectStringForObject` formatter and `String.asObject` parser. This includes native transient/shared-transient and subobject distinctions; for example, a persistent object can be `9002.1`. Existing `oid` fields, catalog identities and reference-valued properties use this representation. Native identity strings are opaque to clients: do not construct, trim, decode or reinterpret them. Cursor and session tokens remain separate opaque transport identifiers.

Inspection accepts bounded native identity strings (1–512 UTF-8 bytes without ASCII control characters). The old 44-character packed hexadecimal representation remains an input-only compatibility format. Parsing an identity does not establish that an object exists or that access is permitted: the selected database and native inspection authorization still apply. `distribution.json.oidFormat`, `doctor.capabilities.oidFormat`, helper ready packets and inspection response bodies advertise `jade-native`; adapters must check this capability before accepting the new identities. Both Source and Working data inspection use native read-only sessions. Compilation, tests and Workspace execution can write to the selected Working database. In default existing mode that is the reviewed configured database; these operations are not made read-only by inspection permissions.

Native gateways `native.run` and `helper inspect|debug|compiler [session.json]` preserve Jade's native protocols. Utilities are restricted to `jadclient`, `jadloadb`, `jdbutilb` and `jdbadmin` in the configured installation. These are trusted local interfaces; callers remain responsible for authorizing Source writes. The helper gateway forwards native stdio under a broker lease. Version-pinned debugger ABI checks remain active. Arbitrary expressions, GUI hosting and unrestricted attach are not added.

Protocol clients launch `jade-cli.exe service --stdio`. `{ "command": "cli", "operation": "build", "argv": [], "cwd": "C:/repos/example" }` uses the same configuration discovery and command handling as the terminal. `prepare` returns resolved configuration metadata without connecting to a database.

## Development and verification

Build with the Visual Studio 2022 x64 C++ toolchain and Windows SDK:

```powershell
./scripts/build-native-cli.ps1
```

The script compiles the native library, runs grouped C++ tests, and builds `dist/jade-cli-win-x64/jade-cli.exe` with a static C++ runtime. It discovers the installed Visual Studio toolchain automatically. `-TestsOnly` runs tests; `-TestFilter 'BrokerRuntime*'` selects a group. Test compilation uses at most four MSVC workers, capped by the available processor count; `-TestCompileJobs 1` selects serial compilation. Test objects use a separate output directory, and all selected executables still link and run sequentially in discovery order. A fresh test-only precompiled header shares stable Windows/STL/JSON parsing across the selected tests; product and helper builds remain unchanged. The log reports PCH creation, compile, link and execution times separately. PCH outputs are removed after the invocation; test results and object compilation are not cached. `-DisableTestPch` selects the unprecompiled path for matched measurements. No package manager or downloaded C++ dependency is needed: the existing MIT-licensed nlohmann/json header is vendored.

Tests cover configuration and positional arguments, schema-qualified discovery, process quoting/cancellation, source staging, diagnostics, warm sessions, broker startup races, authentication, client ownership, helper leases and recovery. The [test coverage matrix](native-cli/tests/README.md) identifies each test group and its limits. Default tests do not open a developer database. The explicit `JADE_CPP_TEST_SEED` connected proof accepts a private disposable TEMP database and validates actual Jade compilation and test execution. Hosted CI does not claim connected coverage without the licensed runtime.

Rebuilding Jade helper executables also requires the installed Jade SDK. No Jade vendor DLLs, databases, credentials or generated evidence belong in Git. The previous Node implementation is preserved on the `codex/agent/ci-releases` branch (with a local `codex/node-cli-baseline` checkpoint) for comparison; it is not included in the native distribution.

The explicit native identity proof is `tests/NativeOid/NativeOid_roundtrip_tests.ps1 -JadeHome <licensed-install> -Seed <private-TEMP-integration-seed>`. It validates native formatting/parsing for persistent, transient, shared-transient and subobject identities, shared inspector output paths and unchanged primitive strings. `JADE_CPP_OID_TEST_SEED` enables the grouped `NativeOid_inspection_native_tests` proof through actual Source and Working inspection sessions against a disposable private seed. Default hosted tests skip connected proofs.

Both C++ proof entry points independently validate the seed's mutable INI directories before opening Jade, including when invoked directly. The service proof also requires a version-matched staged distribution with verified manifest/runtime hashes; it never searches the checkout or falls back to an older helper. Run it from the repository root:

```powershell
./scripts/build-native-cli.ps1 -SkipTests
$env:JADE_CPP_TEST_DISTRIBUTION = (Resolve-Path dist/jade-cli-win-x64).Path
$env:JADE_CPP_OID_TEST_SEED = '<private native-restored TEMP seed root>'
./scripts/build-native-cli.ps1 -TestsOnly -TestFilter NativeOid_inspection_native_tests
```


## 0.11.10 changes

Debug saved JOX methods in the configured existing Working database with the supported Jade 2025 ANSI runtime. Native preparation verifies the reviewed database identity, execution INI and installed DLLs against the packaged debugger profile before launch. Breakpoints, stepping and clean Stop preserve Working reuse; unsupported runtime builds remain unavailable.

Raw JOX editor lookup returns the exact semantic method and native UTF16 source-map runs through entities, CDATA, CRLF and non-ASCII text. Dirty editors, stale file hashes and another selected member are refused. `source.semantic.read` accepts `originUri`, saved `originText`, and either `position` or `entityId`; `working.prepare` with `purpose: "debug"` and `expectedWorkingIdentity` returns the admitted `body.debugSession` for the caller to pass unchanged to the helper.

Protected main promotes the exact successful PR artifact and its immutable digest. If those bytes are unavailable it stops instead of rebuilding another executable. Historical local debugger CLI hashes are evidence, not an identity requirement for the hosted release; exact helper/profile/runtime and all PR artifact/manifest checks remain active. See [the implementation plan](https://github.com/darrenhull/Jade-CLI/blob/main/plans/existing-working-debugging-and-raw-jox-navigation.md).

## 0.11.9 changes

Large checkout Git queries now honor the existing saved-source preparation deadline rather than a hidden 30-second per-query cap. The default remains 15 minutes; sourcePreparationTimeoutSeconds and explicit timeoutMilliseconds precedence are unchanged. Unbounded standalone queries retain the 30-second fallback. Cancellation remains available.

An ambiguous Windows path error now identifies both conflicting Git index spellings. Correct the duplicate tracked paths before retrying; the CLI never silently selects one.

Semantic browsing and editing decode each returned value independently: valid UTF-8 is preserved, and legacy bytes fall back to the Windows ANSI code page only for a configured or detected ANSI runtime. Different values in the same origin may use different encodings. No-op saves retain the original bytes; edits encode the changed value in its detected encoding, using the runtime preference for new values, and refuse unrepresentable characters. Native JadeGit still receives the unchanged captured source bytes. Actual conversion errors identify their source path and byte context. File-local projection failures are summarized as warnings with the exact Git-relative path; other origins continue, and repaired or deleted files clear their warnings. Large lists return bounded inline `warnings`, full `warningCount`, `remainingWarningCount` and a `warningDetailsUri` pointing to the complete current report in the managed semantic cache. One report per project is updated atomically; no JOX source is converted or rewritten. Cancellation, deadlines and global preparation failures still stop the operation. Raw native publication is not filtered by projection warnings, and actual native load failures remain failures. See [ANSI text and lossless editing](plans/ansi-jox-semantic-text.md).

## 0.11.8 changes

Saved JOX checkouts now synchronize directly into the configured existing Working database after target review and overwrite confirmation. The default route performs no seed, backup, restore, extraction or second-database creation. Branch switches, saved method edits and bounded unexported method overwrites use the persisted native baseline and publication cursor.

Projects can set a repository-relative `schemaPath` ending in lowercase `schemas`; the default is root `schemas`. Checkout, schema and database paths must be local. Explicit `workingMode: "source-backed"` retains the separate database-backed workflow.

Rebuilt ANSI payloads are released after their exact hashes, normal build and registered SDK controls pass. Historical connected receipts remain records bound to their original package identities and no longer gate rebuilt payload releases.

## 0.11.7 changes

Large JOX directory trees now reuse libgit2's bounded object cache. Saved-source preparation defaults to 15 minutes with the preparation-only setting described above. Ordinary native source changes no longer require updating a recorded source digest before builds; native-runtime integrity and normal functional/review checks remain enforced.

## GitHub builds and releases

Windows CI builds and tests the native executable, verifies a portable copy outside the checkout, and creates `jade-cli-win-x64.zip`, `jade-cli.exe` and `SHA256SUMS`. The ZIP contains the complete native runtime and its hash manifest; the standalone EXE still needs the adjacent native helpers for connected operations. There is no npm runtime release.

Pull requests build, test and package the native CLI once. After an approved merge to `main`, release automation first looks for the successful same-repository PR run that tested the exact merged source tree. Squash commits may have a different commit SHA; reuse requires the same Git tree, the canonical workflow version, the actual PR checkout commit and the successful run attempt. The immutable artifact ID/digest, build identity, `SHA256SUMS`, safe ZIP members and every distribution file hash are checked before reusing the exact ZIP and EXE bytes. Selection does not depend on the plan-dependent `github.ref_protected` context: the exact same-repository merged PR, reviewed head, main commit/tree and successful workflow attempt remain the authority. JOX 0.11 packages must retain basic upload/test/initialization qualification and explicit unsupported Scratch in Unicode and every declared ANSI variant.

For ordinary releases, protected `main` waits up to 35 minutes for a matching in-progress PR run. A failed run, pending timeout, invalid artifact or unqualified package stops release rather than starting another build. When no matching trusted run/source provenance exists, or the artifact is absent or expired, main builds afresh. Main has a 95-minute job limit for the wait-plus-fallback path; PR jobs keep their 55-minute limit.

Ordinary publication runs on protected-main pushes. PR artifact reuse skips compilation, test execution, assembly and recompression without bypassing the existing reviewed-main ancestry or owner approval gates. Ordinary native source changes do not require a source-digest qualification-record update. Rebuilt runtime payloads are bound by exact hashes and their registered SDK/build controls; historical connected receipts remain records rather than publication gates. Functional tests and review remain checked. An already-published version remains unchanged. Bump the native version to publish a new CLI release. Tag pushes do not start a competing publisher. Before retaining an existing published version, the release job verifies its tag is in reviewed `main` history and checks its downloaded EXE, ZIP, checksums and native manifest. The release job verifies downloaded artifacts and finishes uploading a draft before publication. `SHA256SUMS` covers the EXE and ZIP; `distribution.json` records the hashes of the executable and its runtime files.

Bot PR creation runs separately from the full build. Squash auto-merge waits for the required owner approval, checks and resolved discussions; feature branches are deleted after merge. GitHub may require approval to start workflows on a newly bot-created PR.


## Architecture diagram

![Architecture](docs/architecture.drawio.svg)

[Edit the diagram in draw.io](docs/architecture.drawio). The SVG is the rendered companion to the editable source.


## Native runtime character sets

`characterSet` is optional: `auto` selects the ANSI or Unicode helper using Jade's native Character conversion API before opening a database. Set `ansi` or `unicode` to require that ABI; native Working build/test and inspection reject an explicit mismatch before dispatch and preserve an already healthy shared connection. It does not convert a database or replace vendor DLLs. JSON/source editing stays UTF-8; the shared C++ boundary uses the SDK's `Character` type and Windows code-page conversion for ANSI strings. Unsupported/unrepresentable parameter text fails instead of being silently replaced.

Native error resources are decoded through Jade's SDK conversion. Resource/conversion failures retain the original Jade error code with a safe message fallback; character encoding alone does not diagnose a database-lock error.

| Capability | ANSI | Unicode |
| --- | --- | --- |
| Working native compilation, structural load/reorganisation and tests | SDK-typed helper | SDK-typed helper |
| Read-only database metadata/object inspection | SDK-typed helper with native read-only sign-on | SDK-typed helper with native read-only sign-on |
| Scratch Pad execution | Matching installed `jadclient` | Matching installed `jadclient` |
| Debugging | Existing Working with the packaged exact ANSI ABI profile | Existing verified debugger ABI profiles |
| Retired offline compiler/type-cache helper | Explicitly unavailable | Existing supported private ABI profile |

The distribution contains ABI-neutral inspection/test/debug entry points plus ANSI/Unicode typed variants. Vendor Jade DLLs are required from the configured installation and are not redistributed. Native `StringUtf8` values use the SDK UTF-8 reference getter directly, preserving Chinese, emoji and other Unicode characters even in ANSI databases. Ordinary ANSI `String` text uses the Windows active code page; CP1252 was exercised against the isolated local Jade 25.0.1.24 demo clone, with fake conversion coverage for DBCS CP932. This does not claim connected coverage of every code page or vendor hotfix. Loader method errors retain the native method and line; when native output provides no column, the existing line-only diagnostic uses column 1 rather than inventing an offset.

Retired cache/index commands are unavailable on ANSI. Their raw helper lease can release this CLI's idle shared sessions before its stdin request is validated; no cache is created, and the next supported operation reconnects automatically. This legacy path does not have the early mismatch-preservation guarantee of native Working operations.

Native compilation reuses objects only after validating MSVC `/sourceDependencies`, raw dependency hashes, compiler/flags/include-resolution identity and object integrity. Every selected test is relinked and executed again. GitHub Actions retains only compilation artifacts. A restored PCH is never loaded by a compiler on another host: missed tests use the same forced header with `/Y-`, while existing objects retain their verified matching creator; cold or invalid bundles are built locally. Cache misses remain ordinary cold builds. The targeted two-test fixture proves reuse; full hosted speed savings are not yet measured.

The source-only [catalogue paging contract](plans/catalogue-paging-protocol.md) specifies bounded schema directories, exact class lookup and snapshot-bound pages for an upcoming consumer. Native acquisition remains eager; this checkpoint is not a packaged capability claim.
