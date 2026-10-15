# Pinned shared rules

- Upstream URL: https://github.com/m1kekad0/ai-agent-rules
- Commit: `3fb05a5a0b6a7f531535044859edc747c01173b9`
- Path: `AGENTS.md`
- Canonical retrieval: https://raw.githubusercontent.com/m1kekad0/ai-agent-rules/3fb05a5a0b6a7f531535044859edc747c01173b9/AGENTS.md
- Retrieval date: 2026-10-15 UTC
- Bytes: `5070`
- SHA256: `61c6a912db6518f5e3afd0b3e17b296540a62d2074e931dc308bb38c49b1f6a7`
- License: MIT (Copyright (c) 2026 m1kekad0), confirmed 2026-10-15
- License file: `LICENSE` from the same commit, vendored unmodified as
  `vendor/ai-agent-rules/LICENSE`
- License bytes: `1065`
- License SHA256: `e0aea83bf0d07947ffd8caa4270006d6f432a2a05fc83e75770fc070a9d705b3`

`AGENTS.md` and `LICENSE` are unmodified copies from the commit above, the
unmerged HEAD of upstream Draft PR #10. The byte counts and SHA256 values were
measured with `wc -c` and `sha256sum`. Keep the `LICENSE` notice with any
copy or redistribution of the vendored rules.

## Updating the pin

1. Select an explicit upstream commit and check its license and required
   notices.
2. Retrieve `AGENTS.md` and `LICENSE` using `raw.githubusercontent.com` URLs
   containing that full commit SHA. Preserve the bytes without formatting or
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
