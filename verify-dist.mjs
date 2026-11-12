import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Verify the current runtime payload. The original v5 manifest lives in docs/.
const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'MANIFEST.sha256.json'), 'utf8'));
const runtime = manifest.files.filter(file => file.path.startsWith('dist/') || file.path === 'serve.mjs');
const failed = [];

for (const file of runtime) {
  const target = path.resolve(root, file.path);
  if (!target.startsWith(root + path.sep)) {
    failed.push(`${file.path}: invalid path`);
    continue;
  }
  try {
    const bytes = await fs.readFile(target);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== file.bytes || hash !== file.sha256) failed.push(`${file.path}: checksum mismatch`);
  } catch {
    failed.push(`${file.path}: missing/unreadable`);
  }
}

if (failed.length) {
  console.error(failed.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Verified ${runtime.length} runtime files (dist/ + serve.mjs).`);
  console.log(`Repository: ${manifest.repository || 'historical v5 snapshot'}.`);
}
