# Pinned shared rules

- Upstream URL: https://github.com/m1kekad0/ai-agent-rules
- Commit: `e70ea343b9a9e3d3f34b143fdbcc4583a69a92c8`
- Path: `AGENTS.md`
- Canonical retrieval: https://raw.githubusercontent.com/m1kekad0/ai-agent-rules/e70ea343b9a9e3d3f34b143fdbcc4583a69a92c8/AGENTS.md
- Retrieval date: 2026-10-15 UTC
- Bytes: `5070`
- SHA256: `61c6a912db6518f5e3afd0b3e17b296540a62d2074e931dc308bb38c49b1f6a7`

`AGENTS.md` is an unmodified copy supplied for this pin from the commit above,
the unmerged HEAD of upstream Draft PR #10. The retrieval date and upstream
identity describe the supplied copy; the local byte count and SHA256 were
measured with `wc -c` and `sha256sum`. No fresh upstream byte comparison was
performed when documenting this pin.

## Updating the pin

1. Select an explicit upstream commit and check its redistribution terms,
   license, and required notices. Upstream license verification remains pending
   for this supplied copy; this document does not establish redistribution rights.
2. Retrieve `AGENTS.md` using a `raw.githubusercontent.com` URL containing that
   full commit SHA. Preserve the bytes without formatting or other edits.
3. Recheck the fixed commit, compare the retrieved and vendored bytes, and run
   `wc -c vendor/ai-agent-rules/AGENTS.md` and
   `sha256sum vendor/ai-agent-rules/AGENTS.md`. Update all metadata above,
   including the UTC retrieval date.
4. Run the project checks and obtain independent review of the fixed candidate
   commit, including the source, bytes, SHA256, notices, and project rule
   precedence. After changes, verify and review the updated commit again.

Never present content retrieved from mutable `main` as this fixed version.
If the pinned source cannot be retrieved or verified, report that limitation
instead of substituting `main` or claiming verification succeeded.
