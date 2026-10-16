# Ibintec After Effects MCP

**Motion graphics in Adobe After Effects 2022+, built by AI, which can see what it made.**

Ibintec After Effects MCP connects an AI client such as Claude Desktop to Adobe
After Effects on your computer. The AI can create compositions, add text,
shapes and solids, animate them with keyframes and expressions, apply effects,
and then look at the result with `view-comp` to check it.

It is based on the open-source
[after-effects-mcp](https://github.com/Dakkshin/after-effects-mcp) by Dakkshin
(MIT License), with changes by Ibintec Limited. Not affiliated with or endorsed
by Adobe.

It works alongside [Ibintec Premiere MCP](https://github.com/ibintec/premiere-mcp):
build titles and animations here, then place them in your edit in Premiere.

## What it can do

| Tool | What it does |
|---|---|
| `create-composition` | New composition with your size, frame rate, length and background |
| `run-script` | Built-in commands: list compositions and layers, project info, create text / shape / solid / camera layers, set layer properties (one or many layers), duplicate or delete layers, masks, composition settings |
| `setLayerKeyframe` | Keyframe Position, Scale, Rotation or Opacity, to animate them |
| `setLayerExpression` | Add an expression, e.g. `wiggle(2,20)` |
| `apply-effect`, `apply-effect-template` | Apply effects or ready-made combinations (glow, drop shadow, cinematic look, text pop and more) |
| `view-comp` | **See** the composition: frames across it as one image with timestamps |
| `get-effects-help`, `get-help` | Reference for effects and setup |
| `run-bridge-test`, `get-results` | Connection check; read a slow command's result |

Every tool waits for After Effects and returns its answer. `run-script` only
runs these built-in commands; it cannot run arbitrary code.

Example request to your AI client:

> In After Effects, make a 1920x1080, 25 fps, 5-second composition called
> "Lower Third". Add a white "Harvest Day" title with a gold "Kiambu, October"
> line under it in the lower left, sliding in from the left over 0.6 seconds
> and fading out at the end. Then check it with view-comp.

## Requirements

- Windows 10/11 or macOS
- Adobe After Effects 2022 or newer
- [Node.js](https://nodejs.org/) 20 or newer
- ffmpeg on your PATH, for `view-comp` (Windows: `winget install Gyan.FFmpeg`;
  macOS: `brew install ffmpeg`)
- An MCP client on the same computer, such as Claude Desktop

## Install (Windows)

In PowerShell:

```powershell
git clone https://github.com/ibintec/aftereffects-mcp.git C:\Tools\aftereffects-mcp
cd C:\Tools\aftereffects-mcp
npm install
npm run install-bridge
```

`npm install` also builds the project. `npm run install-bridge` copies the
panel into After Effects (Windows asks for administrator permission; click
**Yes**), creates the bridge folder, and prints the settings to add to Claude
Desktop. Keep the `C:\Tools\aftereffects-mcp` folder where it is.

On macOS, clone anywhere and run the same two npm commands.

### Connect Claude Desktop

In Claude Desktop open **Settings > Developer > Edit config** and add the
entry the installer printed inside `"mcpServers"`. With Ibintec Premiere MCP
already installed, it looks like this:

```json
{
  "mcpServers": {
    "premiere-pro": { "...": "your existing Premiere entry, unchanged" },
    "aftereffects": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Tools\\aftereffects-mcp\\build\\index.js"]
    }
  }
}
```

Use **Edit config** rather than editing `%APPDATA%\Claude` by hand: Claude
Desktop from the Microsoft Store keeps its settings in a different folder.
Save, then quit Claude Desktop from the system tray and reopen it.
**Settings > Developer** should show `aftereffects` as running.

### Set up After Effects

1. **Edit > Preferences > Scripting & Expressions**: tick **Allow Scripts to
   Write Files and Access Network**. Restart After Effects.
2. Open a project, then **Window > ibintec-ae-bridge.jsx**.
3. Keep the **Ibintec AE Bridge** window open with **Auto-run commands**
   ticked. (In After Effects 2025 and later it opens as a floating window.)

### Check it works

Ask your AI client:

> Use run-script with listCompositions.

## Tips

- **Ask the AI to look.** "Check it with view-comp" catches overlapping text,
  titles off-screen and timing problems.
- **Match your footage.** Use the same size and frame rate as your Premiere
  sequence (for example 1920x1080 at 25 fps).
- **Colours are 0 to 1** in layer commands (white is `[1, 1, 1]`), but 0 to 255
  for a composition's background colour.
- **Indexes vs names.** Keyframe, expression and effect tools use the
  composition's Project panel number and the layer number; `run-script`
  commands use names. Ask the AI to list compositions and layers first.
- **Save often** and work on a copy of important projects. Ctrl+Z undoes
  changes in After Effects.
- After Effects is demanding: on a laptop, keep animations simple and
  `view-comp` previews small.

## Limits

- `view-comp` shows sampled frames, not playback. Fast motion between frames
  can be missed; ask for more frames over a shorter range to look closer.
- Rendered previews show transparent areas as black.
- Only the built-in commands are available; anything else must be done in
  After Effects by hand.
- The automation builds what it is asked to; it does not replace your own
  design judgement.

## Troubleshooting

| Problem | Fix |
|---|---|
| "After Effects did not answer" | After Effects open with a project, the Ibintec AE Bridge window open, Auto-run ticked, and the Scripting & Expressions preference on |
| The panel is not in the Window menu | Run `npm run install-bridge` again and click **Yes** on the permission prompt, then restart After Effects |
| `aftereffects` not listed in Settings > Developer | Add it with **Edit config** (not by editing the file in `%APPDATA%`), then quit Claude Desktop from the tray |
| `view-comp` says ffmpeg was not found | Install ffmpeg, then quit Claude Desktop from the tray and reopen it |
| The panel log shows errors | Copy the log text from the panel into your AI chat or an issue |

## Privacy

Everything runs on your computer and Ibintec receives no data. Tool results,
including `view-comp` frames, go to your AI client. See [PRIVACY.md](PRIVACY.md).

## License and credits

MIT License, see [LICENSE](LICENSE).

- Original project: after-effects-mcp, copyright (c) 2025 Dakkshin
- view-comp, bridge hardening and other changes: copyright (c) 2026 Ibintec
  Limited (see [CHANGELOG.md](CHANGELOG.md))

Support: [open an issue](https://github.com/ibintec/aftereffects-mcp/issues).
