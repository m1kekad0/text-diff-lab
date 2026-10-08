import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outputDirectory, sourceDirectory } from './build.mjs';

const routes = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);

export function createStaticServer(directory = sourceDirectory) {
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }

    const route = routes.get((request.url ?? '').split('?')[0]);
    if (!route) {
      response.writeHead(404);
      response.end();
      return;
    }

    try {
      const content = await readFile(resolve(directory, route[0]));
      response.writeHead(200, { 'Content-Type': route[1], 'Content-Length': content.length });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch {
      response.writeHead(500);
      response.end();
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createStaticServer(process.argv.includes('--dist') ? outputDirectory : sourceDirectory);
  server.on('error', () => {
    console.error('Local server failed to start. Check whether port 4173 is already in use.');
    process.exitCode = 1;
  });
  server.listen(4173, '127.0.0.1', () => console.log('Open http://127.0.0.1:4173 (Ctrl+C to stop).'));
}
