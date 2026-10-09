import assert from 'node:assert/strict';
import { platform, arch, release } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { countText } from '../src/diff.mjs';

// Local diagnostic only: no CI thresholds or paste/responsiveness claims.
// Supply the base revision's diff.mjs outside the checkout; do not fetch it here.
if (!process.env.BASE_DIFF_MODULE || !globalThis.gc) {
  throw new Error('Use node --expose-gc and BASE_DIFF_MODULE pointing to the base diff.mjs.');
}
const { inspectText } = await import(pathToFileURL(resolve(process.env.BASE_DIFF_MODULE)).href);
const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const measurements = [];
for (const newline of ['\n', '\r\n']) {
  for (const size of [100_000, 1_000_000]) {
    const text = newline.repeat(size);
    text.charCodeAt(text.length - 1); // Materialize the shared fixture before measuring.
    const implementations = [['before', inspectText], ['after', countText]];
    for (const [, fn] of implementations) fn(text);
    const samples = { before: [], after: [] };
    for (let i = 0; i < 9; i++) {
      // Alternate order to reduce a consistent warmup/order bias.
      for (const [name, fn] of i % 2 ? implementations.toReversed() : implementations) {
        globalThis.gc();
        const heapBefore = process.memoryUsage().heapUsed;
        const start = performance.now();
        const result = fn(text);
        const milliseconds = performance.now() - start;
        const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
        assert.equal(result.lineCount, size + 1);
        assert.equal(result.characterCount, size);
        samples[name].push({ milliseconds, heapDeltaBytes });
      }
    }
    measurements.push({
      newline: newline === '\n' ? 'LF' : 'CRLF', repetitions: size, inputCodeUnits: text.length,
      ...Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, {
        medianMilliseconds: median(values.map((value) => value.milliseconds)),
        medianHeapDeltaBytes: median(values.map((value) => value.heapDeltaBytes)),
      }])),
    });
  }
}
console.log(JSON.stringify({
  node: process.version, platform: platform(), arch: arch(), osRelease: release(), samplesPerCase: 9,
  scope: 'Single-input counters only. Heap delta is observed heapUsed growth while the result exists, not total allocations or peak RSS. GC/JIT noise applies; excludes DOM/paste, two-field updates and accepted diff computation.',
  measurements,
}, null, 2));
