// install-bridge.js
// Installs the Ibintec AE Bridge panel into After Effects and prints the
// Claude Desktop settings to add.
//
// Based on install-bridge.js from after-effects-mcp by Dakkshin (MIT).
// Modifications copyright (c) 2026 Ibintec Limited. MIT License.

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
const PANEL = 'ibintec-ae-bridge.jsx';

if (!isMac && !isWindows) {
  console.error('After Effects runs on Windows and macOS only.');
  process.exit(1);
}

const sourceScript = path.join(__dirname, 'build', 'scripts', PANEL);
const serverEntry = path.join(__dirname, 'build', 'index.js');
if (!fs.existsSync(sourceScript) || !fs.existsSync(serverEntry)) {
  console.error('The project is not built yet. Run "npm install" (which builds it) and try again.');
  process.exit(1);
}

// Newest After Effects first.
const versions = ['2026', '2025', '2024', '2023', '2022'];
const installs = versions
  .map((v) => (isMac ? `/Applications/Adobe After Effects ${v}` : `C:\\Program Files\\Adobe\\Adobe After Effects ${v}`))
  .filter((p) => fs.existsSync(p));

if (installs.length === 0) {
  console.error('Could not find After Effects 2022-2026 in the usual folder.');
  console.error(`Copy ${sourceScript}`);
  console.error(isMac
    ? 'to /Applications/Adobe After Effects <version>/Scripts/ScriptUI Panels/'
    : 'to C:\\Program Files\\Adobe\\Adobe After Effects <version>\\Support Files\\Scripts\\ScriptUI Panels\\');
  process.exit(1);
}

const aePath = installs[0];
const destFolder = isMac
  ? path.join(aePath, 'Scripts', 'ScriptUI Panels')
  : path.join(aePath, 'Support Files', 'Scripts', 'ScriptUI Panels');
const destScript = path.join(destFolder, PANEL);

console.log(`Found ${path.basename(aePath)}.`);
console.log(`Installing the panel to ${destScript}`);

try {
  if (isWindows) {
    // Program Files needs administrator rights: ask once (UAC prompt) and wait for the copy.
    // Paths go inside PowerShell single quotes, where a quote is escaped by doubling it.
    const q = (s) => `'${s.replace(/'/g, "''")}'`;
    const inner = `New-Item -ItemType Directory -Force -Path ${q(destFolder)} | Out-Null; Copy-Item -LiteralPath ${q(sourceScript)} -Destination ${q(destScript)} -Force`;
    const encoded = Buffer.from(inner, 'utf16le').toString('base64');
    console.log('Windows will ask for administrator permission. Click Yes.');
    execFileSync('powershell.exe', ['-NoProfile', '-Command',
      `Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile','-EncodedCommand','${encoded}'`],
      { stdio: 'inherit' });
  } else {
    fs.mkdirSync(destFolder, { recursive: true });
    try {
      fs.copyFileSync(sourceScript, destScript);
    } catch {
      execFileSync('sudo', ['cp', sourceScript, destScript], { stdio: 'inherit' });
    }
  }
} catch (error) {
  console.error(`Copy failed: ${error.message}`);
}

// Check it really arrived (a declined permission prompt otherwise looks like success).
const installed = fs.existsSync(destScript) &&
  fs.readFileSync(destScript).equals(fs.readFileSync(sourceScript));
if (!installed) {
  console.error('\nThe panel was NOT installed (permission declined or copy failed).');
  console.error('Run this again and click Yes, or copy the file by hand:');
  console.error(`  from: ${sourceScript}`);
  console.error(`  to:   ${destFolder}`);
  process.exit(1);
}
console.log('Panel installed.');

// The bridge folder the server and panel share. Created now, outside any app sandbox.
const bridgeDir = path.join(os.homedir(), 'ibintec-ae-bridge');
fs.mkdirSync(bridgeDir, { recursive: true });
console.log(`Bridge folder: ${bridgeDir}`);

const config = {
  aftereffects: {
    command: process.execPath,
    args: [serverEntry]
  }
};

console.log(`
Next steps
1. Claude Desktop: Settings > Developer > Edit config. Add this inside "mcpServers"
   (next to "premiere-pro" if you have it; separate the two with a comma):

${JSON.stringify(config, null, 2).split('\n').slice(1, -1).join('\n')}

   Save, then quit Claude Desktop from the system tray and reopen it.
2. After Effects: Edit > Preferences > Scripting & Expressions >
   tick "Allow Scripts to Write Files and Access Network". Restart After Effects.
3. Open the panel: Window > ${PANEL}. Keep its window open with "Auto-run commands" ticked.
4. In Claude, ask: "Use run-script with listCompositions."
`);
