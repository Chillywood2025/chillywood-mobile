import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

// Exact official ubuntu24/20261101.360 configure-apt-sources.sh output.
// Only priorities change; mirror URLs, package sources and trust remain intact.
const original = 'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\n'
  + 'https://archive.ubuntu.com/ubuntu/\tpriority:2\n'
  + 'https://security.ubuntu.com/ubuntu/\tpriority:3\n';
const preferred = 'http://azure.archive.ubuntu.com/ubuntu/\tpriority:2\n'
  + 'https://archive.ubuntu.com/ubuntu/\tpriority:1\n'
  + 'https://security.ubuntu.com/ubuntu/\tpriority:3\n';

export function preferOfficialUbuntuMirror(input) {
  if (input !== original && input !== preferred) {
    throw new Error('Unrecognized Ubuntu mirror list; refusing to replace it');
  }
  return preferred;
}

// Output only: the caller owns any installation. Validation precedes all output.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) throw new Error('Expected one mirror-list file');
  process.stdout.write(preferOfficialUbuntuMirror(readFileSync(process.argv[2], 'utf8')));
}
