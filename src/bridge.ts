/**
 * File bridge between the MCP server and the Ibintec AE Bridge panel inside
 * After Effects.
 *
 * The server writes ae_command.json; the panel (polling every 2 seconds)
 * runs the command and writes ae_mcp_result.json tagged with the command
 * name. Commands are sent one at a time, so a second tool call can never
 * overwrite a command the panel has not picked up yet.
 *
 * Based on after-effects-mcp by Dakkshin (MIT).
 * Modifications copyright (c) 2026 Ibintec Limited. MIT License.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * <user profile>\ibintec-ae-bridge (Windows) or ~/ibintec-ae-bridge (macOS),
 * matching the panel. Not in Documents, which OneDrive/iCloud may sync.
 * AE_MCP_BRIDGE_DIR overrides it (the panel must then be changed to match).
 */
export function getBridgeDir(): string {
  const dir = process.env.AE_MCP_BRIDGE_DIR || path.join(os.homedir(), "ibintec-ae-bridge");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const commandPath = () => path.join(getBridgeDir(), "ae_command.json");
export const resultPath = () => path.join(getBridgeDir(), "ae_mcp_result.json");

export interface BridgeResult {
  ok: boolean;        // the panel answered and did not report an error
  timedOut: boolean;  // the panel did not answer in time
  text: string;       // the panel's JSON, or an explanation
  data?: any;         // parsed JSON, when available
}

const PANEL_HINT =
  'Check that After Effects is open with a project, that the "Ibintec AE Bridge" window is open ' +
  "(File > Scripts > Run Script File... > ibintec-ae-bridge.jsx, or Window > ibintec-ae-bridge.jsx) " +
  'and that "Auto-run commands" is ticked. In After Effects, Edit > Preferences > Scripting & Expressions > ' +
  '"Allow Scripts to Write Files and Access Network" must be on.';

/**
 * Writes via a temp file and rename, so the panel never reads a half-written
 * file. On Windows the rename fails while the panel has the file open, so
 * fall back to a direct write (the panel ignores JSON it cannot parse and
 * reads again 2 s later).
 */
function writeJsonAtomic(file: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, json, "utf8");
    fs.renameSync(tmp, file);
  } catch {
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
    fs.writeFileSync(file, json, "utf8");
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** Serialises bridge commands: each waits for the previous one to finish. */
function serialised<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Sends one command to the panel and waits for its result.
 * The panel polls every 2 s, so even instant commands take up to ~2 s.
 */
export function runBridgeCommand(command: string, args: Record<string, unknown> = {}, timeoutMs = 30000): Promise<BridgeResult> {
  return serialised(async () => {
    // Reset the result so an old answer to the same command can't be mistaken for this one.
    writeJsonAtomic(resultPath(), { status: "waiting", message: "Waiting for After Effects...", timestamp: new Date().toISOString() });
    writeJsonAtomic(commandPath(), { command, args, timestamp: new Date().toISOString(), status: "pending" });

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 250));
      let content: string;
      try {
        content = fs.readFileSync(resultPath(), "utf8");
      } catch {
        continue;
      }
      let data: any;
      try {
        data = JSON.parse(content);
      } catch {
        continue; // still being written
      }
      if (data && data._commandExecuted === command) {
        // Panel commands report failure in three ways: status "error", success false, or an error string.
        const failed = data.status === "error" || data.success === false ||
          (typeof data.error === "string" && data.error.length > 0);
        return { ok: !failed, timedOut: false, text: JSON.stringify(data, null, 2), data };
      }
    }

    // Tell the panel not to run it late, if it never picked it up.
    try {
      const pending = JSON.parse(fs.readFileSync(commandPath(), "utf8"));
      if (pending.status === "pending" && pending.command === command) {
        writeJsonAtomic(commandPath(), { ...pending, status: "cancelled" });
      }
    } catch {
      /* ignore */
    }

    return {
      ok: false,
      timedOut: true,
      text: `After Effects did not answer "${command}" within ${Math.round(timeoutMs / 1000)} seconds. ${PANEL_HINT} ` +
        `If the command was slow rather than lost, call get-results in a moment.`
    };
  });
}

/** Reads whatever result the panel last wrote (for slow commands). */
export function readLastResult(): string {
  const file = resultPath();
  if (!fs.existsSync(file)) return JSON.stringify({ error: "No result yet. " + PANEL_HINT });
  const stats = fs.statSync(file);
  const content = fs.readFileSync(file, "utf8");
  if (Date.now() - stats.mtimeMs > 120000) {
    return JSON.stringify({
      warning: "This result is more than 2 minutes old, so it may be from an earlier command.",
      lastModified: stats.mtime.toISOString(),
      originalContent: content
    }, null, 2);
  }
  return content;
}
