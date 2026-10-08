import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const sourceDirectory = fileURLToPath(new URL('../src/', import.meta.url));
export const outputDirectory = fileURLToPath(new URL('../dist/', import.meta.url));
export const assets = ['index.html', 'styles.css'];

export async function build(destination = outputDirectory) {
  await mkdir(destination, { recursive: true });
  for (const asset of assets) {
    await copyFile(resolve(sourceDirectory, asset), resolve(destination, asset));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build();
  console.log('Built 2 static assets in dist/.');
}
