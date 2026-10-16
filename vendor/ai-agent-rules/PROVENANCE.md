# Pinned shared rules

- Upstream URL: https://github.com/m1kekad0/ai-agent-rules
- Commit: `2c9adf1966ee71221fdd5fa19886314822558d87`
- Path: `AGENTS.md`
- Canonical retrieval: https://raw.githubusercontent.com/m1kekad0/ai-agent-rules/2c9adf1966ee71221fdd5fa19886314822558d87/AGENTS.md
- Retrieval date: 2026-10-15 UTC
- Bytes: `5914`
- SHA256: `65305a1834ce55d602e900384980f65beb180ac9ce2df515486a5b06882ae8ea`
- License: MIT (Copyright (c) 2026 m1kekad0), confirmed 2026-10-15
- License file: `LICENSE` from the same commit, vendored unmodified as
  `vendor/ai-agent-rules/LICENSE`
- License bytes: `1065`
- License SHA256: `e0aea83bf0d07947ffd8caa4270006d6f432a2a05fc83e75770fc070a9d705b3`

`AGENTS.md` and `LICENSE` are unmodified copies from the commit above, the
upstream `main` merge commit of PR #12 (merged 2026-10-15). The upstream
repository is private, so they were retrieved with the GitHub contents API at
that full commit SHA and compared byte-for-byte with the same commit in a local
clone. The byte counts and SHA256 values were
measured with `wc -c` and `sha256sum`. Keep the `LICENSE` notice with any
copy or redistribution of the vendored rules.

## Updating the pin

1. Select an explicit upstream commit and check its license and required
   notices.
2. Retrieve `AGENTS.md` and `LICENSE` using `raw.githubusercontent.com` URLs
   containing that full commit SHA. If the upstream repository is private,
   retrieve them with the GitHub contents API (raw media type) using
   `ref=<full commit SHA>` instead. Preserve the bytes without formatting or
   other edits.
3. Recheck the fixed commit, compare the retrieved and vendored bytes, and run
   `wc -c` and `sha256sum` on `vendor/ai-agent-rules/AGENTS.md` and
   `vendor/ai-agent-rules/LICENSE`. Update all metadata above, including the
   UTC retrieval date.
4. Run the project checks and obtain independent review of the fixed candidate
   commit, including the source, bytes, SHA256, notices, and project rule
   precedence. After changes, verify and review the updated commit again.

Never present content retrieved from mutable `main` as this fixed version.
If the pinned source cannot be retrieved or verified, report that limitation
instead of substituting `main` or claiming verification succeeded.

## Pin check script

`scripts/check-pin.mjs` is an unmodified copy of `scripts/check-pin.mjs` from ai-agent-rules commit `92bfe7f73bcde392ee2c1d66d391d9ace4ac725d` (SHA256 `36e61c41bd1d6cfaf3b39bde945432c75a6d40600c0c6984d421660e3e3583ef`). CI runs `node scripts/check-pin.mjs .` offline; the upstream drift check is not run because no token is configured.
