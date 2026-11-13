# Project-relative Working configuration

Closes #85; depends on Jade-CLI#46. Prepared on indexing PR84 head to avoid another review cycle there.

1. Reproduce relative Working overrides resolving inconsistently and .jade source/test discovery. Resolve overrides from selected workspace for class and database inspection paths; preserve blank automatic selection and absolute external settings.
2. Exclude .jade paths from source index scope, Testing and native project publication scans. Preserve explicit Source publication and dirty-buffer gates.
3. Bundle verified official CLI with project-local default/guards before updating Settings/help/minimum version or declaring support. Native Working remains persistent unpublished state; moved copies are preserved and require verified relocation.
4. Focused RED/GREEN, complete regressions, actual portable VSIX and Settings UI screenshot with final dependency. No user installation or database changes. No Ready/owner review until compatible native release and exact-head verification.

Checkpoint: relative resolver and managed-path source exclusions implemented; failing-first tests reproduced. Actual activation coverage confirms classbuild, Working inspection, Scratch and debug resolve the same selected-folder override.23 focused configuration/project/scope tests pass. RuntimeCharacterSet activation fixture now loads the real path helpers rather than its generic mock. Settings/minimumCLI/version/payload/UI evidence remain gated on the official compatible native release, not yet changed or shipped.
