import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['README.md', 'AGENTS.md', 'LICENSE', '.gitignore', 'package.json', 'package-lock.json', '.github/workflows/ci.yml', '.github/workflows/pages.yml', 'docs/pages-hosting.md'];
for (const directory of ['scripts', 'test', 'src']) {
  for (const file of await readdir(resolve(root, directory))) files.push(`${directory}/${file}`);
}

let failed = false;
for (const file of files) {
  const content = await readFile(resolve(root, file), 'utf8');
  if (!content.endsWith('\n') || /\r|[\t ]+$/m.test(content)) {
    console.error(`${file}: use a final newline, LF, and no trailing whitespace.`);
    failed = true;
  }
  if (file.endsWith('.mjs')) {
    const result = spawnSync(process.execPath, ['--check', resolve(root, file)], { encoding: 'utf8' });
    if (result.status !== 0) {
      console.error(`${file}: JavaScript syntax check failed.`);
      failed = true;
    }
  }
}
if (failed) process.exitCode = 1;
else console.log(`Lint passed: syntax and whitespace (${files.length} files).`);
