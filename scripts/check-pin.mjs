#!/usr/bin/env node
// ai-agent-rules の vendored pin（PROVENANCE.md の bytes / SHA256）を検査する。読み取り専用・依存なし。
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const FIELDS = {
  upstream: /^- Upstream(?: URL)?:[ \t]*(?:`([^\s`]+)`|<([^\s<>`]+)>|([^\s`<>（(]+))/m,
  commit: /^- Commit:\s*`([0-9a-f]{40})`/m,
  path: /^- Path:\s*`([^`]+)`/m,
  bytes: /^- Bytes:\s*`(\d+)`/m,
  sha256: /^- SHA256:\s*`([0-9a-f]{64})`/m,
  licenseBytes: /^- License bytes:\s*`(\d+)`/m,
  licenseSha256: /^- License SHA256:\s*`([0-9a-f]{64})`/m,
};

export function parseProvenance(text) {
  const out = {};
  const missing = [];
  for (const [key, re] of Object.entries(FIELDS)) {
    const m = text.match(re);
    if (!m) { missing.push(key); continue; }
    const value = m[1] ?? m[2] ?? m[3];
    out[key] = key.endsWith('ytes') ? Number(value) : value;
  }
  return { fields: out, missing };
}

const unverifiable = (reason) => ({ status: 'unverifiable', reason });

// Restrict credentials and requests to GitHub's API, regardless of provenance input.
function githubRepo(upstream) {
  try {
    const url = new URL(upstream);
    if (url.protocol !== 'https:' || url.host !== 'github.com' ||
        url.username || url.password || url.search || url.hash) return null;
    const match = url.pathname.match(/^\/([a-z0-9-]+)\/([a-z0-9_.-]+)\/?$/i);
    if (!match) return null;
    const repo = match[2].replace(/\.git$/, '');
    if (!repo || repo === '.' || repo === '..') return null;
    return `${match[1]}/${repo}`;
  } catch { return null; }
}

/** Compare a pin to upstream main using only a read-only GitHub REST request. */
export async function checkUpstream({ upstream, commit }, {
  fetch = globalThis.fetch, token = process.env.GITHUB_TOKEN,
} = {}) {
  const repo = githubRepo(upstream);
  if (!repo || !/^[0-9a-f]{40}$/.test(commit ?? '')) return unverifiable('invalid metadata');
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(`https://api.github.com/repos/${repo}/compare/${commit}...main`, {
      method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(10000),
    });
  } catch { return unverifiable('network'); }
  if (!response.ok) {
    // Private upstreams answer 404 (not 403) without a token that can read them.
    if ([401, 403, 404].includes(response.status)) {
      return unverifiable(`${response.status} (${token ? 'token cannot read upstream' : 'no token; private upstream needs GITHUB_TOKEN with read access'})`);
    }
    return unverifiable(Number.isInteger(response.status) ? String(response.status) : 'request failed');
  }
  try {
    const data = await response.json();
    if (!Number.isSafeInteger(data.ahead_by) || data.ahead_by < 0 || !Array.isArray(data.files) ||
        !data.files.every((f) => f && typeof f.filename === 'string' &&
          (f.previous_filename === undefined || typeof f.previous_filename === 'string'))) {
      return unverifiable('invalid response');
    }
    // Three-dot comparisons use the merge base, so only forward history is conclusive.
    if ((data.status !== 'identical' && data.status !== 'ahead') || data.behind_by > 0) {
      return unverifiable('diverged');
    }
    // GitHub caps this list at 300; absence of a file at the cap is inconclusive.
    if (data.files.length >= 300) return unverifiable('file list limit');
    const changed = (name) => data.files.some((f) => f.filename === name || f.previous_filename === name);
    const agentsChanged = changed('AGENTS.md');
    const licenseChanged = changed('LICENSE');
    return {
      status: 'verified', ahead_by: data.ahead_by, agentsChanged, licenseChanged,
      drift: data.ahead_by > 0 && (agentsChanged || licenseChanged),
    };
  } catch { return unverifiable('invalid response'); }
}


export const DEFAULT_VENDOR_DIR = 'vendor/ai-agent-rules';

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function measure(file) {
  const buf = await readFile(file);
  return { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
}

/**
 * Check one repository directory. Read-only.
 * Returns { dir, ok, commit, problems: string[], upstream? }.
 */
export async function checkRepo(dir, {
  vendorDir = DEFAULT_VENDOR_DIR, upstream = false, failOnDrift = false, fetch, token,
} = {}) {
  async function finish(result, fields = {}) {
    if (upstream) {
      result.upstream = await checkUpstream(fields, { fetch, token });
      if (failOnDrift && (result.upstream.status === 'unverifiable' || result.upstream.drift)) {
        result.ok = false;
      }
    }
    return result;
  }
  const base = join(dir, vendorDir);
  const problems = [];
  const provPath = join(base, 'PROVENANCE.md');
  if (!(await exists(provPath))) {
    return finish({ dir, ok: false, commit: null, problems: [`missing ${vendorDir}/PROVENANCE.md`] });
  }
  const { fields, missing } = parseProvenance(await readFile(provPath, 'utf8'));
  for (const k of missing) problems.push(`PROVENANCE.md: field "${k}" missing or malformed`);

  const targets = [
    ['AGENTS.md', fields.bytes, fields.sha256],
    ['LICENSE', fields.licenseBytes, fields.licenseSha256],
  ];
  for (const [name, wantBytes, wantSha] of targets) {
    const file = join(base, name);
    if (!(await exists(file))) { problems.push(`missing ${vendorDir}/${name}`); continue; }
    const got = await measure(file);
    if (wantBytes !== undefined && got.bytes !== wantBytes) {
      problems.push(`${name}: bytes ${got.bytes} != recorded ${wantBytes}`);
    }
    if (wantSha !== undefined && got.sha256 !== wantSha) {
      problems.push(`${name}: sha256 ${got.sha256} != recorded ${wantSha}`);
    }
  }
  return finish({ dir, ok: problems.length === 0, commit: fields.commit ?? null, problems }, fields);
}


const HELP = `Usage: node scripts/check-pin.mjs [--json] [--vendor-dir <path>] [--upstream [--fail-on-drift]] [dir ...]

Verify that vendored ai-agent-rules files match the bytes and SHA256 recorded
in <dir>/<vendor-dir>/PROVENANCE.md. Read-only. Default dir: "."
Default vendor dir: ${DEFAULT_VENDOR_DIR}
--upstream: compare the pin to GitHub main (optional GITHUB_TOKEN).
--fail-on-drift: require --upstream; fail on relevant drift or unverifiable upstream.
Exit codes: 0 pins match (upstream informational by default), 1 check failed, 2 usage error.`;

export async function main(argv, out = process.stdout, { fetch, token } = {}) {
  const dirs = [];
  let json = false;
  let upstream = false;
  let failOnDrift = false;
  let vendorDir;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out.write(HELP + '\n'); return 0; }
    else if (a === '--json') json = true;
    else if (a === '--upstream') upstream = true;
    else if (a === '--fail-on-drift') failOnDrift = true;
    else if (a === '--vendor-dir') {
      vendorDir = argv[++i];
      if (!vendorDir) { out.write('error: --vendor-dir needs a value\n'); return 2; }
    } else if (a.startsWith('-')) { out.write(`error: unknown option ${a}\n`); return 2; }
    else dirs.push(a);
  }
  if (failOnDrift && !upstream) {
    out.write('error: --fail-on-drift requires --upstream\n'); return 2;
  }
  if (dirs.length === 0) dirs.push('.');
  const results = [];
  for (const d of dirs) results.push(await checkRepo(d, { vendorDir, upstream, failOnDrift, fetch, token }));
  if (json) out.write(JSON.stringify(results, null, 2) + '\n');
  else for (const r of results) {
    out.write(`${r.ok ? 'OK  ' : 'FAIL'} ${r.dir}${r.commit ? ` @ ${r.commit.slice(0, 12)}` : ''}\n`);
    for (const p of r.problems) out.write(`     - ${p}\n`);
    if (r.upstream?.status === 'unverifiable') {
      out.write(`     upstream: unverifiable (${r.upstream.reason})\n`);
    } else if (r.upstream) {
      out.write(`     upstream: ahead_by=${r.upstream.ahead_by}, AGENTS.md changed=${r.upstream.agentsChanged}, LICENSE changed=${r.upstream.licenseChanged}\n`);
    }
  }
  return results.every((r) => r.ok) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
