# Changelog

## 1.0.0-ibintec.1 - 2026-10-16

Ibintec After Effects MCP, forked from after-effects-mcp by Dakkshin
(commit 88d5fbf, MIT License).

### Added
- `view-comp`: renders evenly spaced frames of a composition and returns them
  to the AI client as one image with timestamps, so the AI can check its own
  animation work.
- `renderFrames` command in the panel (used by `view-comp`). It only writes
  inside the bridge folder.

### Changed
- Every tool now waits for After Effects to finish and returns the result
  directly. Previously tools only queued a command and the AI had to call
  `get-results` afterwards.
- Commands are sent one at a time, so two tool calls can no longer overwrite
  each other's command.
- Errors from After Effects are reported to the AI instead of appearing as a
  timeout.
- `run-script` now lists each command's arguments and is described accurately
  (it runs built-in commands, some of which change the project).
- The bridge folder moved from `Documents\ae-mcp-bridge` to
  `<user profile>\ibintec-ae-bridge`, out of folders that OneDrive or iCloud
  may sync. `AE_MCP_BRIDGE_DIR` can override it on the server side.
- The panel is renamed `ibintec-ae-bridge.jsx` ("Ibintec AE Bridge").
- The installer waits for the Windows permission prompt, checks the panel was
  really copied, creates the bridge folder and prints the Claude Desktop
  settings to add.
- Rebranded as Ibintec After Effects MCP (`@ibintec/aftereffects-mcp`).

### Security
- The panel no longer evaluates the command file as code. ExtendScript has no
  built-in JSON, and the original fallback parser used `eval`, so any text
  written to the command file would run inside After Effects. The new parser
  checks that the text is plain JSON data before reading it (the json2.js
  method).

### Removed
- `test-animation` (wrote a script for the user to run by hand).
- `mcp_aftereffects_applyEffect` and `mcp_aftereffects_applyEffectTemplate`
  (duplicates of `apply-effect` and `apply-effect-template`).
- The standalone scripts in `src/scripts/` that the panel no longer used, the
  unused `node-fetch` dependency, and a sample config containing the original
  author's personal folder path.
- `mcp_aftereffects_get_effects_help` is now `get-effects-help`.
