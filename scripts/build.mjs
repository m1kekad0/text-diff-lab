import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export const sourceDirectory = fileURLToPath(new URL('../src/', import.meta.url));
export const outputDirectory = fileURLToPath(new URL('../dist/', import.meta.url));
export const assets = Object.freeze(['index.html', 'styles.css', 'app.mjs', 'diff.mjs']);

function contains(directory, candidate) {
  const path = relative(directory, candidate);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

async function prepareDestination(destination, complete = false) {
  const requested = resolve(destination);
  // Resolve parent aliases before checking boundaries; never remove a destination.
  const directory = resolve(await realpath(dirname(requested)), basename(requested));
  const project = await realpath(fileURLToPath(new URL('../', import.meta.url)));
  if (contains(directory, project) || (contains(project, directory) && directory !== resolve(project, 'dist'))) {
    throw new Error('Build destination must be dist/ or a dedicated directory outside the project.');
  }

  const status = await lstat(directory).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (status && !status.isDirectory()) {
    throw new Error('Build destination must be a directory, not a file or symlink.');
  }
  if (!status) await mkdir(directory);

  const entries = await readdir(directory);
  for (const entry of entries) {
    if (!assets.includes(entry)) {
      throw new Error('Build destination contains unlisted entries; use a separate empty directory.');
    }
    const asset = await lstat(resolve(directory, entry));
    if (!asset.isFile() || asset.nlink !== 1) {
      throw new Error('Existing build assets must be regular files without symlinks or hard links.');
    }
  }
  if (complete && entries.length !== assets.length) {
    throw new Error('Build output is missing static assets.');
  }
  return directory;
}

export async function build(destination = outputDirectory) {
  const directory = await prepareDestination(destination);
  const contents = await Promise.all(assets.map((asset) => readFile(resolve(sourceDirectory, asset))));
  for (const [index, asset] of assets.entries()) {
    // Check the opened file before truncating so a link cannot redirect an overwrite.
    const file = await open(resolve(directory, asset), constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW);
    try {
      const status = await file.stat();
      if (!status.isFile() || status.nlink !== 1) {
        throw new Error('Build assets must be regular files without hard links.');
      }
      await file.truncate(0);
      await file.writeFile(contents[index]);
    } finally {
      await file.close();
    }
  }
  await prepareDestination(directory, true);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build();
  console.log(`Built ${assets.length} static assets in dist/.`);
}
