/**
 * Ibintec After Effects MCP: lets an AI client such as Claude Desktop build
 * and animate compositions in Adobe After Effects, and see the result.
 *
 * Based on after-effects-mcp by Dakkshin (MIT License).
 * Modifications copyright (c) 2026 Ibintec Limited. MIT License.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getBridgeDir, readLastResult, runBridgeCommand, type BridgeResult } from "./bridge.js";
import { viewComp } from "./compView.js";

const VERSION = "1.0.0-ibintec.1";

const server = new McpServer({ name: "ibintec-aftereffects-mcp", version: VERSION });

function reply(res: BridgeResult) {
  return { content: [{ type: "text" as const, text: res.text }], isError: !res.ok };
}

// ---------------------------------------------------------------------------
// Resource
// ---------------------------------------------------------------------------

server.resource("compositions", "aftereffects://compositions", async (uri) => {
  const res = await runBridgeCommand("listCompositions", {});
  return { contents: [{ uri: uri.href, mimeType: "application/json", text: res.text }] };
});

// ---------------------------------------------------------------------------
// General command runner
// ---------------------------------------------------------------------------

const COMMANDS = [
  "listCompositions", "getProjectInfo", "getLayerInfo",
  "createComposition", "setCompositionProperties",
  "createTextLayer", "createShapeLayer", "createSolidLayer", "createCamera",
  "setLayerProperties", "batchSetLayerProperties",
  "setLayerKeyframe", "setLayerExpression",
  "duplicateLayer", "deleteLayer", "setLayerMask",
  "applyEffect", "applyEffectTemplate", "bridgeTestEffects"
] as const;

server.tool(
  "run-script",
  `Run one of the bridge's built-in After Effects commands and return its result. Only these commands exist; it cannot run arbitrary code.

Read: listCompositions, getProjectInfo, getLayerInfo (layers of the ACTIVE composition).
Compositions: createComposition {name, width, height, frameRate, duration, pixelAspect, backgroundColor:{r,g,b 0-255}}; setCompositionProperties {compName, duration, frameRate, width, height}.
Layers (compName = target composition; colours are [r,g,b] from 0 to 1; position is [x,y] in pixels; times in seconds):
- createTextLayer {compName, text, position, fontSize, color, fontFamily, alignment: left|center|right, startTime, duration}
- createShapeLayer {compName, shapeType: rectangle|ellipse|polygon|star, name, position, size:[w,h], fillColor, strokeColor, strokeWidth, points, startTime, duration}
- createSolidLayer {compName, name, color, size:[w,h], position, isAdjustment, startTime, duration}
- createCamera {compName, name, position:[x,y,z], pointOfInterest:[x,y,z], zoom, oneNode}
- setLayerProperties {compName, layerName or layerIndex, position, scale:[x,y], rotation, opacity, startTime, duration, enabled, blendMode, threeDLayer, text, fontSize, fontFamily, fillColor, trackMatteType}
- batchSetLayerProperties {compName, operations:[{layerName or layerIndex, ...same properties}]}
- duplicateLayer {compName, layerName or layerIndex, newName}; deleteLayer {compName, layerName or layerIndex}
- setLayerMask {compName, layerName or layerIndex, maskRect:{top,left,width,height} or maskPath, maskMode, maskFeather, maskOpacity, maskExpansion, maskName, maskIndex}
Prefer the dedicated tools for keyframes, expressions and effects (they use compIndex/layerIndex).
After changing anything visual, call view-comp to check the result.`,
  {
    script: z.enum(COMMANDS).describe("The command to run"),
    parameters: z.record(z.string(), z.unknown()).optional().describe("Arguments for the command, as listed in the description")
  },
  async ({ script, parameters = {} }) => reply(await runBridgeCommand(script, parameters))
);

server.tool(
  "get-results",
  "Read the last result After Effects wrote. Only needed if a command timed out because it was slow (e.g. heavy effects).",
  {},
  async () => ({ content: [{ type: "text" as const, text: readLastResult() }] })
);

// ---------------------------------------------------------------------------
// Dedicated tools
// ---------------------------------------------------------------------------

server.tool(
  "create-composition",
  "Create a new composition in After Effects.",
  {
    name: z.string().describe("Name of the composition"),
    width: z.number().int().positive().describe("Width in pixels, e.g. 1920"),
    height: z.number().int().positive().describe("Height in pixels, e.g. 1080"),
    pixelAspect: z.number().positive().optional().describe("Pixel aspect ratio (default 1.0)"),
    duration: z.number().positive().optional().describe("Duration in seconds (default 10)"),
    frameRate: z.number().positive().optional().describe("Frames per second (default 30; use 25 to match footage shot at 25 fps)"),
    backgroundColor: z.object({
      r: z.number().int().min(0).max(255),
      g: z.number().int().min(0).max(255),
      b: z.number().int().min(0).max(255)
    }).optional().describe("Background colour, RGB 0-255")
  },
  async (params) => reply(await runBridgeCommand("createComposition", params))
);

const LayerIdentifierSchema = {
  compIndex: z.number().int().positive().describe("1-based index of the composition in the Project panel (see getProjectInfo / listCompositions)."),
  layerIndex: z.number().int().positive().describe("1-based index of the layer within the composition.")
};

server.tool(
  "setLayerKeyframe",
  "Set a keyframe on a layer property at a given time. Add two or more keyframes on the same property to animate it.",
  {
    ...LayerIdentifierSchema,
    propertyName: z.string().describe("Property to keyframe: 'Position', 'Scale', 'Rotation' or 'Opacity'."),
    timeInSeconds: z.number().describe("Time of the keyframe, in seconds."),
    value: z.unknown().describe("Value: [x,y] for Position, [w,h] percent for Scale, degrees for Rotation, percent for Opacity.")
  },
  async (params) => reply(await runBridgeCommand("setLayerKeyframe", params))
);

server.tool(
  "setLayerExpression",
  "Set or remove an After Effects expression on a layer property (e.g. wiggle(2,20) for gentle handheld motion).",
  {
    ...LayerIdentifierSchema,
    propertyName: z.string().describe("Property: 'Position', 'Scale', 'Rotation' or 'Opacity'."),
    expressionString: z.string().describe('The expression. Use "" to remove it.')
  },
  async (params) => reply(await runBridgeCommand("setLayerExpression", params))
);

server.tool(
  "apply-effect",
  "Apply an effect to a layer. Use get-effects-help for reliable effect match names.",
  {
    ...LayerIdentifierSchema,
    effectName: z.string().optional().describe("Display name of the effect, e.g. 'Gaussian Blur'."),
    effectMatchName: z.string().optional().describe("Internal name (more reliable), e.g. 'ADBE Gaussian Blur 2'."),
    effectCategory: z.string().optional().describe("Optional category for filtering effects."),
    presetPath: z.string().optional().describe("Optional absolute path to an effect preset (.ffx)."),
    effectSettings: z.record(z.string(), z.unknown()).optional().describe("Effect parameters, e.g. { 'Blurriness': 25 }.")
  },
  async (params) => reply(await runBridgeCommand("applyEffect", params, 60000))
);

server.tool(
  "apply-effect-template",
  "Apply a predefined combination of effects to a layer.",
  {
    ...LayerIdentifierSchema,
    templateName: z.enum([
      "gaussian-blur", "directional-blur", "color-balance", "brightness-contrast",
      "curves", "glow", "drop-shadow", "cinematic-look", "text-pop"
    ]).describe("Template to apply."),
    customSettings: z.record(z.string(), z.unknown()).optional().describe("Optional settings overriding the template's defaults.")
  },
  async (params) => reply(await runBridgeCommand("applyEffectTemplate", params, 60000))
);

server.tool(
  "view-comp",
  "SEE a composition: renders evenly spaced frames from After Effects and returns them as one IMAGE with the time of each frame. Use it after building or animating something to check text placement, timing and motion before telling the user it is done. Defaults to the active composition.",
  {
    compName: z.string().optional().describe("Composition name (default: the active composition)"),
    compIndex: z.number().int().positive().optional().describe("Or the composition's 1-based Project panel index"),
    start: z.number().min(0).optional().describe("Start of the range in seconds (default 0)"),
    end: z.number().positive().optional().describe("End of the range in seconds (default: end of the composition)"),
    frames: z.number().int().min(1).max(24).optional().describe("How many frames to show (default 8, max 24)"),
    width: z.number().int().min(160).max(960).optional().describe("Width of each frame in the sheet (default 384)")
  },
  async (params) => viewComp(params)
);

server.tool(
  "run-bridge-test",
  "Check the connection: runs the bridge's test command in After Effects, which applies test effects to the active composition.",
  {},
  async () => reply(await runBridgeCommand("bridgeTestEffects", {}))
);

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

server.tool(
  "get-help",
  "How to set up and use Ibintec After Effects MCP.",
  {},
  async () => ({
    content: [{
      type: "text" as const,
      text: `# Ibintec After Effects MCP

Setup (once):
1. In After Effects: Edit > Preferences > Scripting & Expressions > tick "Allow Scripts to Write Files and Access Network".
2. Open the bridge: Window > ibintec-ae-bridge.jsx (or File > Scripts > Run Script File... and pick ibintec-ae-bridge.jsx).
3. Keep the "Ibintec AE Bridge" window open with "Auto-run commands" ticked.

Bridge folder: ${getBridgeDir()}

Working pattern:
- listCompositions / getProjectInfo first, to learn names and indexes.
- Build with run-script (text, shapes, solids, cameras, masks), create-composition, setLayerKeyframe, setLayerExpression, apply-effect.
- Every tool waits for After Effects and returns its answer. Commands take up to ~2 s because the panel checks every 2 s.
- Check visual work with view-comp.
- Effects reference: get-effects-help.`
    }]
  })
);

server.tool(
  "get-effects-help",
  "Effect match names and the predefined effect templates.",
  {},
  async () => ({ content: [{ type: "text" as const, text: `# After Effects Effects Help

## Common Effect Match Names
These are internal names used by After Effects that can be used with the \`effectMatchName\` parameter:

### Blur & Sharpen
- Gaussian Blur: "ADBE Gaussian Blur 2"
- Camera Lens Blur: "ADBE Camera Lens Blur"
- Directional Blur: "ADBE Directional Blur"
- Radial Blur: "ADBE Radial Blur"
- Smart Blur: "ADBE Smart Blur"
- Unsharp Mask: "ADBE Unsharp Mask"

### Color Correction
- Brightness & Contrast: "ADBE Brightness & Contrast 2"
- Color Balance: "ADBE Color Balance (HLS)"
- Color Balance (RGB): "ADBE Pro Levels2"
- Curves: "ADBE CurvesCustom"
- Exposure: "ADBE Exposure2"
- Hue/Saturation: "ADBE HUE SATURATION"
- Levels: "ADBE Pro Levels2"
- Vibrance: "ADBE Vibrance"

### Stylistic
- Glow: "ADBE Glow"
- Drop Shadow: "ADBE Drop Shadow"
- Bevel Alpha: "ADBE Bevel Alpha"
- Noise: "ADBE Noise"
- Fractal Noise: "ADBE Fractal Noise"
- CC Particle World: "CC Particle World"
- CC Light Sweep: "CC Light Sweep"

## Effect Templates
The following predefined effect templates are available:

- \`gaussian-blur\`: Simple Gaussian blur effect
- \`directional-blur\`: Motion blur in a specific direction
- \`color-balance\`: Adjust hue, lightness, and saturation
- \`brightness-contrast\`: Basic brightness and contrast adjustment
- \`curves\`: Advanced color adjustment using curves
- \`glow\`: Add a glow effect to elements
- \`drop-shadow\`: Add a customizable drop shadow
- \`cinematic-look\`: Combination of effects for a cinematic appearance
- \`text-pop\`: Effects to make text stand out (glow and shadow)

## Example Usage
To apply a Gaussian blur effect:

\`\`\`json
{
  "compIndex": 1,
  "layerIndex": 1,
  "effectMatchName": "ADBE Gaussian Blur 2",
  "effectSettings": {
    "Blurriness": 25
  }
}
\`\`\`

To apply the "cinematic-look" template:

\`\`\`json
{
  "compIndex": 1,
  "layerIndex": 1,
  "templateName": "cinematic-look"
}
\`\`\`
` }] })
);

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

server.prompt("list-compositions", "List compositions in the current After Effects project", () => ({
  messages: [{ role: "user", content: { type: "text", text: "Please list all compositions in the current After Effects project." } }]
}));

server.prompt("analyze-composition", { compositionName: z.string().describe("Name of the composition to analyze") }, (args) => ({
  messages: [{
    role: "user",
    content: { type: "text", text: `Please analyze the composition named "${args.compositionName}": duration, frame rate, resolution and layers. Then use view-comp to look at it and describe what it shows.` }
  }]
}));

// ---------------------------------------------------------------------------

async function main() {
  console.error(`Ibintec After Effects MCP ${VERSION} starting. Bridge folder: ${getBridgeDir()}`);
  await server.connect(new StdioServerTransport());
  console.error("Ibintec After Effects MCP running.");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
