# Extension-led workspace startup

Issue: [#87](https://github.com/darrenhull/Jade-VSCode-Extension/issues/87)

Status: the initial configuration-only Initialise Workspace command is implemented for the next extension release. Git installation/cloning, source acquisition and complete first-run orchestration below remain planned. The starting baseline was extension 0.22.6 / CLI 0.10.4; native timeout separation is tracked in [CLI #50](https://github.com/darrenhull/Jade-CLI/issues/50). Official CLI 0.10.5 packaging and final packaged UI/review evidence remain delivery gates.

## Outcome and responsibilities

Add **Jade: Initialise Workspace** to guide a developer from a directory or repository to configured native source and a private Working database. On re-entry, identify incomplete prerequisites without repeating expensive work.

The extension presents choices and progress. Existing VS Code Git features own Git operations; the native CLI owns Jade configuration, runtime selection, database ownership, backup/restore and extraction. Compose existing implementations instead of adding another broker, source serializer, category planner or database-readiness manifest.

Do not automatically build, execute tests/scratch code, commit, push, publish to Source, recover a database, adopt an unmanaged database or discard Working state. Execution and reviewed publication remain separate.

## Verified starting point

- [extension/package.json](../extension/package.json) at the starting baseline contributed **Jade: Detect Runtime Settings** and **Jade: Extract All Sources**, without Initialise Workspace. The initial implementation now contributes the new configuration-only command.
- [extension/src/extension.js](../extension/src/extension.js), detectSettings, selects the installation containing bin/jom.dll, Source database/INI and server mode, then saves four folder-scoped VS Code settings. It does not initialize Git or prepare Working.
- The bundled CLI's [Project setup documentation](../packages/jade-cli-win-x64/README.md#project-setup) describes native init: minimal jade.json references a private machine connection profile. It writes configuration only; it does not connect, extract, compile or publish. Its service accepts command "cli", operation "init", explicit arguments and project cwd. Noninteractive setup must not depend on terminal prompts.
- [extension/src/cli-client.js](../extension/src/cli-client.js) already forwards native requests/output and exposes working.prepare and inspect.target. [extension/src/object-explorer.js](../extension/src/object-explorer.js) shares a pending Connect promise and forwards progress/cancellation. Reuse these paths and their ownership rules.
- The native default is project .jade/working, retaining eligible existing managed legacy state. Readiness belongs to the CLI. A moved/edited INI is not automatically adopted.
- At this baseline jadeNative.testTimeoutSeconds defaults to 120 seconds and affects native Working utility processes, including backup/restore and tests. jadeNative.extractionTimeoutSeconds separately defaults to 7200 seconds. The immediate timeout change must document actual scope/compatibility. Do not describe an extraction timeout as a backup limit, or a per-process timeout as one total setup deadline.

## Proposed flow

1. **Select the workspace.** Reuse Create/Open Folder guidance for an empty window. Show full paths for multi-root choices and bind the operation to that root. Creating a directory preserves existing contents. Opening a folder can reload VS Code; re-enter by inspecting saved facts rather than trusting an old wizard instance.

2. **Check Git.** Discover Git through the enabled VS Code Git integration and supported API. If missing/disabled, offer Enable Git, Open Official Installation Guidance, or the organisation's managed installation route, then Retry. Any installer/package-manager action must be explicitly started by the user and keep normal permission/licence prompts. Never silently install, elevate, accept agreements or change enterprise policy. Re-detect after installation and explain any required restart for PATH changes. Jade configuration may proceed while Git remains an incomplete prerequisite.

3. **Choose the source route.** Offer three alternatives, not three sequential exports:
   - **Clone a repository:** delegate to VS Code Git: Clone into a new/empty destination; VS Code owns host authentication. Validate native source/configuration after the folder opens.
   - **Use this folder's files:** preserve its repository, branch, remotes, staged/unstaged files and editor buffers. Detect a containing repository before offering Git initialization; avoid accidental nested repositories. Offer built-in Git initialization only when needed.
   - **Extract from Source:** configure Source, then invoke existing Extract All Sources into the selected source folder. Report its actual complete/partial/conflict result. Offer Git initialization afterward if needed.

   Git clone/pull/init and native extraction are distinct. An existing checkout does not require a new export to initialize. Do not automatically overlay its files from a database. Git: Pull remains an explicit Git operation with normal conflict handling; no automatic reset, clean, force-checkout, stash, commit or push.

4. **Initialize native configuration.** Use packaged CLI init with explicit values/project root and a private machine profile. First prove how extension settings and native jade.json precedence interact, so setup, extraction, connection and build resolve the same Source. Preserve existing configuration bytes; never silently repoint a profile name. Resolve ambiguity visibly through native configuration rules rather than invent another store.

   Keep shareable jade.json minimal. Machine paths/credentials belong in supported private profiles. VS Code settings stay .vscode/settings.json, not .jade/settings.json. Preserve unrelated settings and dirty buffers; never copy secrets or credential-bearing remote URLs into Git/logs.

5. **Review the resolved targets.** Show installation, detected ANSI/Unicode mode, Source database/INI/server mode, source folder and Working directory. Keep automatic character-set detection; an override does not convert databases. Source is for extraction/inspection and reviewed publication. Working is persistent private state for builds/tests/debug/scratch. A Source connection is not evidence that Working was prepared or local files compiled.

6. **Prepare Working when requested.** Offer Prepare Working in the flow, clearly explaining the first consistent Source backup and restore cost. Reuse valid native-managed state. Invoke existing preparation and, if requested, existing Working connection; do not execute user code. Preserve original SingleUser locking, recovery and development-security failures; never change server mode, bypass authorization or recover Source to make setup succeed.

7. **Finish with independent statuses.** Show folder selected; Git/repository ready; connection configured; sources available or extraction partial; Working ready/not prepared; source index building/ready. Provide relevant existing Show Output, Show Source Folder, Show Working Database and Retry actions. Configuration may complete without optional Working preparation. Indexing is separate from database preparation.

## Storage and re-entry

| Location | Meaning and policy |
| --- | --- |
| Native files and jade.json | Reviewable project content; preserve bytes/edits. Git review/commit is separate. |
| .vscode/settings.json | VS Code configuration; preserve unrelated keys/dirty editors and avoid private values in Git. |
| Private connection profiles | Machine connection identities/settings under native ownership; exclude secrets from logs. |
| .jade/source-index | Regenerable browse cache; retain existing add/delete/move invalidation. |
| .jade/working and managed generations | Persistent databases that may hold unpublished state; never automatic cache cleanup, move/adoption or recreation. |
| Owned transient staging/logs | Reproducible artifacts with bounded retention; cleanup only after owned native processes close. |

Native Working preparation currently creates a wildcard .gitignore inside a new Working root if absent; native init does not exclude all .jade state from Git. Immediate installation instructions therefore ask the user to add .jade/ to the project .gitignore, preserving existing rules, and review status before committing; already tracked files remain tracked. The complete onboarding flow should offer a reviewed ignore update through the appropriate existing owner. Keep .jade outside source/test/publish discovery. Missing cache can rebuild; missing/inconsistent Working ownership fails closed.

Initially add no persistent onboarding checkpoint database. Re-check repository/configuration and native readiness instead of a wizard success flag. Reopening or re-running setup must not automatically clone, extract, back up again or reset Working. Partial preparation is not a ready database.

## Progress and failure contract

- Display progress immediately. Repeat activation for the same root joins the current attempt; retain existing concurrency checks with other Jade operations.
- Distinguish Git, configuration, Source open, extraction, comparison/apply, backup, verification, restore, connection and indexing. Use actual counters/events; file count is not percentage complete or proof of hashing.
- Forward native output as it arrives. When quiet, show a bounded stage/elapsed heartbeat labelled as waiting. Show effective timeout and setting at stage start. Failure includes stage, elapsed time, safe target paths, original native code and log location.
- Cancel through owner-bound requests and the native safe boundary. Keep Cancelling visible until native completion. Never kill unrelated processes or launch replacement preparation while cancellation is pending. Folder/configuration changes invalidate stale replies but preserve cleanup.
- Preserve dirty-editor/local-edit checks, conflicts, unchanged-file behavior and existing per-file extraction cancellation semantics. Completed files may remain after partial extraction; unfinished extraction must not appear successful.
- Retry inspects real state. Do not delete a nonempty clone destination or incomplete database to clear an error. Offer a different empty destination where supported. Retain original locking, security and recovery causes with actionable next steps.

## Implementation and acceptance gates

1. **Configuration proof:** failing tests for missing/ambiguous profiles, existing jade.json, conflicting VS Code settings, dirty settings and multi-root scope. Prove packaged service init without a database, then prove all subsequent extension paths resolve the same Source/profile. Required missing native capability is added in the CLI first and consumed only from a verified release.
2. **Thin entry point/Git:** register Initialise Workspace and compose existing actions. Cover all three source routes, missing/disabled Git, installation dismissal/enterprise block and authentication failure. Preserve existing repo remotes/branch/index, saved bytes and unsaved editors; no automatic commit/push/publish.
3. **Working/progress:** cover valid reuse, absent base, unmanaged/moved INI, directory conflicts, lock, authorization denial, timeout, cancel/retry, repeated clicks, root/configuration changes and reload. Assert one preparation, actual progress forwarding, no redundant backup after valid reuse and no success before native result.
4. **Scale/safety:** realistic 30,000-plus-source fixture with bounded discovery/indexing, first-progress latency, incremental UI and separate cold/warm timings/memory. Record Windows/VS Code/runtime versions and limitations. Extension fixtures do not prove native export/backup speed. Native proofs use explicitly authorized disposable ANSI/Unicode databases; default tests never open developer databases.
5. **Packaged UI/docs:** capture and visually inspect actual VSIX empty-window setup, missing Git, source-route choices, backup/restore, cancellation and actionable failure. Check keyboard/loading behavior. Installation instructions name implemented commands only and cover startup order, Source/Working, timeout scope, Git, .jade storage and resume.
6. **Delivery:** focused red/green tests, required default/build/package checks, exact CLI receipt/hashes and portable outside-checkout smoke. Link issue/plan and attach UI evidence/limitations. Keep Draft until current-head verification is complete, finish automated/owner review, then verify release separately. Do not install into or change the user's environment automatically.

Per-project choices are folder, source route and connection. No extra global design decision is needed before implementation. Working migration/adoption, runtime installation/licensing, remote publication and database recovery remain separate explicit work.

## Official references

VS Code owns [built-in Git integration](https://code.visualstudio.com/docs/sourcecontrol/overview) and the [clone/remote workflow](https://code.visualstudio.com/docs/sourcecontrol/repos-remotes). The [official Git for Windows installation page](https://git-scm.com/install/win) documents installer and winget routes, noting the winget package is not maintained by Git for Windows. Setup must preserve the user's/organisation's installation choice.

## Initial configuration phase evidence

The command delegates directly to native CLI init. New project files receive a unique private profile name. Existing jade.json bytes are preserved. A native unknown-profile error enables a user-selected Configure This Machine action and a modal review of runtime/Source/INI/server before native init creates that existing alias; native profile ownership refuses conflicting repoints. Other native failures remain failures. Cancelled runtime detection settles as cancelled. Explicit outside-workspace resources, changed project bytes, dirty configuration buffers, changed runtime settings and removed roots prevent stale configuration work. This is not the complete wizard, a native Source authorization workaround or a database preparation command.

Seven added behavior cases first failed. The configuration module now passes 23 focused cases, including repair denial/collision, cancellation and retry. An explicitly opted-in proof ran the actual pinned CLI service with isolated temporary profile/broker state and nonexistent runtime/database paths: a cloned missing profile was created, existing project bytes and repeated initialization were preserved, and no database/Working directory was opened or created. The owned broker was shut down and the disposable fixture cleaned. This proof does not establish database sign-on, backup/restore or final 0.10.5 artifact verification.
## Inspection sign-in delivery boundary

The initial connection update uses the standard VS Code SecretStorage get/store/delete API to remember an accepted sign-in across restarts for the same configured Source/Working identity, including an explicit anonymous choice and empty passwords. There is no custom cipher or secret-bearing registry. Sign In bypasses the saved value but replaces it only after successful native readiness; cancelling or rejecting newly entered replacement credentials preserves the prior accepted entry. Forget Saved Inspection Sign-In deletes only the selected entry, waits for any accepted pending save and closes owned inspection. A rejected reused startup sign-in is removed for deliberate manual retry; a per-object policy denial does not clear credentials for other allowed objects.

Durable SecretStorage protection does not mean credentials never reach disk elsewhere: current native inspect/test jobs can serialize them in standard SID/SYSTEM ACL-protected transient configuration, cleaned after owned process exit. The separately queued CLI52 no-disk handoff is not implemented or added to CLI51. Native application authorization remains authoritative.
## Frontend integration checkpoint

The stable frontend passes 1248 regular JavaScript checks with 46 explicit native opt-in skips and 18 isolated PowerShell contracts. The first integrated run detected three outdated standalone 30,000-class test-fixture prerequisites; after the fixture-only correction, those focused cases and the complete regular JavaScript phase passed. No product change was needed for that correction.

Actual inspection screenshots demonstrate unchanged product modules in an isolated development host, real VS Code SecretStorage reuse across a private-profile restart and scoped Forget, with fake native responses. This is not packaged VSIX, native-runtime or customer-authorization proof. The copied native0.10.4 distribution was not executed by that UI fixture. The initialization native service proof separately executed the pinned CLI only for configuration, with no installed runtime/database. See the metadata-only [startup receipt](../docs/test-evidence/startup-onboarding-0.22.7.json). Official0.10.5 consumer pin/payload/minimum-version, final VSIX/portable verification and packaged initialization UI remain outstanding.