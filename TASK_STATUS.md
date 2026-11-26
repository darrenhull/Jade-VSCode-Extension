# Jade Tools 0.23.9 — existing Working CLI update

- Bundles official Jade CLI 0.11.8 and requires that minimum version. Closes #153.
- Enables the existing Project Setup UI to synchronize saved Git JOX source directly into the configured existing Working database, after exact-target review and overwrite consent. Default setup does not create a second database, extract source, or require a seed. Explicit source-backed mode remains available.
- Root schemas and supported nested schemaPath layouts retain repository-relative source identity. Supported saved method edits and branch changes reuse the Working database for Scratch Pad and tests; unsupported structural changes fail explicitly.
- The official manifest declares nativeDebug:false for ANSI. Consumer validators preserve this disabled declaration and reject true or malformed values; no debugger support is enabled by this update.
- Validation: focused disabled-debugger manifest regression reproduced the rejection before the compatibility fix and passed afterward. Normal extension tests passed: 2,136 cases, 2,084 passed, 52 intentional skips, zero failures. Standard VSIX packaging passed (210 files, 12.55 MB). No user database is opened by this dependency update.
- Delivery: one linked-issue review PR, normal protected checks, owner approval, auto-merge off. No additional connected-receipt or artifact requalification gate is required.
- Existing-mode object inspection remains a separate CLI limitation (Jade-CLI issue #168).

- CI follow-up: the portable metadata fixture now explicitly selects source-backed mode instead of entering existing-Working mode implicitly. Focused smoke controls: eight passed; exact packaged smoke passed with no Node on PATH, native test discovery, no database connection. Consumer docs now describe vendor-seed initialization removal/migration and persistent Scratch effects; official distribution bytes remain unchanged.
