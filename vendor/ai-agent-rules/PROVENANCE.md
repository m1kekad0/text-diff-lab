# Pinned shared rules

- Upstream URL: https://github.com/m1kekad0/ai-agent-rules
- Commit: `88e083736f180a7bf267175b25a831af1ef26d76`
- Path: `AGENTS.md`
- Canonical retrieval: https://raw.githubusercontent.com/m1kekad0/ai-agent-rules/88e083736f180a7bf267175b25a831af1ef26d76/AGENTS.md
- Retrieval date: 2026-10-16 UTC
- Bytes: `8270`
- SHA256: `5814acfcaf73fcf28337cf75cc17e7b8316957c3453476b10f50a320aaec9590`
- License: MIT (Copyright (c) 2026 m1kekad0), confirmed 2026-10-16
- License file: `LICENSE` from the same commit, vendored unmodified as
  `vendor/ai-agent-rules/LICENSE`
- License bytes: `1065`
- License SHA256: `e0aea83bf0d07947ffd8caa4270006d6f432a2a05fc83e75770fc070a9d705b3`

`AGENTS.md` and `LICENSE` are unmodified copies from the commit above, the
initial commit of the public upstream repository (published 2026-10-16). They
were retrieved from `raw.githubusercontent.com` at that full commit SHA and
compared byte-for-byte with the same commit in a local clone. The byte counts and SHA256 values were
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

`scripts/check-pin.mjs` is an unmodified copy of `scripts/check-pin.mjs` from the same upstream commit (SHA256 `3e74c83f9b13c799aa5dcec51fbdc59c5ee03dd08607a08ce3c00220d360644f`). CI runs `node scripts/check-pin.mjs --upstream .`: the local pin check fails the build on mismatch, while the upstream drift report is informational only.
