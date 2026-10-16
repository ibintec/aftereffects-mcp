/**
 * view-comp: lets Claude SEE a composition.
 *
 * The panel saves PNG frames with CompItem.saveFrameToPng into
 * <bridge>/frames/<jobId>/; this module waits for them, tiles them into one
 * contact sheet with ffmpeg, and returns it as an MCP image with the time of
 * every frame.
 *
 * Copyright (c) 2026 Ibintec Limited. MIT License.
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getBridgeDir, runBridgeCommand } from "./bridge.js";

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

export interface ViewCompArgs {
  compName?: string;
  compIndex?: number;
  start?: number;
  end?: number;
  frames?: number;
  width?: number;
}

const COLS = 4;

function run(cmd: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let stderr = "";
    p.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    p.on("error", (e) => resolve({ code: -1, stderr: e.message }));
    p.on("close", (code) => resolve({ code: code ?? -1, stderr }));
  });
}

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

/** saveFrameToPng can finish writing after it returns, so wait for each file to exist and stop growing. */
async function waitForFiles(files: string[], timeoutMs: number): Promise<string[]> {
  const start = Date.now();
  const lastSize = new Map<string, number>();
  while (Date.now() - start < timeoutMs) {
    const missing = files.filter((f) => {
      try {
        const size = fs.statSync(f).size;
        const stable = size > 0 && lastSize.get(f) === size;
        lastSize.set(f, size);
        return !stable;
      } catch {
        return true;
      }
    });
    if (missing.length === 0) return [];
    await new Promise((r) => setTimeout(r, 300));
  }
  return files.filter((f) => !fs.existsSync(f));
}

export async function viewComp(a: ViewCompArgs): Promise<{ content: Content[]; isError?: boolean }> {
  const frames = Math.max(1, Math.min(24, Math.round(a.frames ?? 8)));
  const jobId = `job${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const args: Record<string, unknown> = { jobId, count: frames, start: a.start ?? 0 };
  if (a.end !== undefined) args.end = a.end;
  if (a.compName) args.compName = a.compName;
  if (a.compIndex) args.compIndex = a.compIndex;

  const jobDir = path.join(getBridgeDir(), "frames", jobId);
  try {
    // Rendering 4K frames on a laptop can take a while.
    const res = await runBridgeCommand("renderFrames", args, 120000);
    if (!res.ok) return { content: [{ type: "text", text: res.text }], isError: true };

    const names: string[] = res.data.files || [];
    const times: number[] = res.data.times || [];
    const comp = res.data.composition || {};
    const files = names.map((n) => path.join(jobDir, n));
    const missing = await waitForFiles(files, 60000);
    if (missing.length) {
      return { content: [{ type: "text", text: `After Effects reported the frames as saved, but ${missing.length} of them never appeared in ${jobDir}.` }], isError: true };
    }

    const cols = Math.min(COLS, files.length);
    const rows = Math.ceil(files.length / COLS);
    const sheet = path.join(jobDir, "sheet.jpg");
    const r = await run("ffmpeg", ["-v", "error", "-y", "-i", path.join(jobDir, "f%02d.png"),
      "-vf", `scale=${a.width ?? 384}:-2,tile=${cols}x${rows}:padding=4:color=black`,
      "-frames:v", "1", "-q:v", "4", sheet]);
    if (r.code !== 0 || !fs.existsSync(sheet)) {
      const hint = r.code === -1 ? " ffmpeg was not found: install it (Windows: winget install Gyan.FFmpeg) and fully restart Claude Desktop." : "";
      return { content: [{ type: "text", text: `Could not build the preview image.${hint} ${r.stderr.slice(-400)}` }], isError: true };
    }

    const legend = [`Composition "${comp.name}" (${comp.width}x${comp.height}, ${comp.frameRate} fps, ${Number(comp.duration).toFixed(2)}s).`,
      "Frames read left-to-right, top-to-bottom. Transparent areas show as black. Times:"];
    times.forEach((t, i) => legend.push(`  #${i + 1} (row ${Math.floor(i / cols) + 1}, col ${(i % cols) + 1}) at ${fmt(t)} (${t.toFixed(2)}s)`));

    return {
      content: [
        { type: "image", data: fs.readFileSync(sheet).toString("base64"), mimeType: "image/jpeg" },
        { type: "text", text: legend.join("\n") }
      ]
    };
  } finally {
    fs.rmSync(jobDir, { recursive: true, force: true });
  }
}
