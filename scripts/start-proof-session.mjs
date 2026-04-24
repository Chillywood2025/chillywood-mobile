import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const labelInput = process.argv.slice(2).join(' ').trim() || 'proof-session';
const slug =
  labelInput
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'proof-session';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = join('/tmp', `chillywood-proof-${timestamp}-${slug}`);
const latestPointer = '/tmp/chillywood-proof-latest.txt';

mkdirSync(artifactDir, { recursive: true });

const manifest = `# Chi'llywood Proof Session

Label: ${labelInput}
Started: ${new Date().toISOString()}

## Artifact Contract
Keep raw proof output here instead of pasting long logs into Codex chat.

- device-a.logcat.txt
- device-b.logcat.txt
- screenshots/
- notes.md
- typecheck.txt

## Recovery Contract
If Codex reports \`Error running remote compact task: stream disconnected before completion\`, start the next session by reading:

1. \`CURRENT_STATE.md\`
2. \`NEXT_TASK.md\`
3. this manifest
4. \`${latestPointer}\`

Then summarize only the facts needed to continue the proof.

## Suggested Commands
\`\`\`sh
mkdir -p "${artifactDir}/screenshots"
adb devices -l | tee "${artifactDir}/adb-devices.txt"
npm run typecheck 2>&1 | tee "${artifactDir}/typecheck.txt"
\`\`\`

For logcat, prefer device-specific serials once known:

\`\`\`sh
adb -s <DEVICE_A_SERIAL> logcat -c
adb -s <DEVICE_B_SERIAL> logcat -c
adb -s <DEVICE_A_SERIAL> logcat -v time > "${artifactDir}/device-a.logcat.txt"
adb -s <DEVICE_B_SERIAL> logcat -v time > "${artifactDir}/device-b.logcat.txt"
\`\`\`
`;

writeFileSync(join(artifactDir, 'manifest.md'), manifest);
writeFileSync(join(artifactDir, 'notes.md'), '# Proof Notes\n\n');
writeFileSync(latestPointer, `${artifactDir}\n`);

console.log(`Proof artifact directory: ${artifactDir}`);
console.log(`Latest pointer: ${latestPointer}`);
