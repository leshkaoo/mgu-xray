# Local packaging validation — 2026-11-26

Environment: macOS arm64. No installer, service, vehicle connection or publication.

- `python3 scripts/collect-notices.py`: PASS; 45 linked linux/amd64 engine Go modules, 51 license/notice files, no missing direct module notices. Legal/nested-code audit pending.
- `python3 scripts/test-package.py`: PASS, 6/6. Missing notices, modified engine, modified notice, notice traversal and PT_INTERP dynamic ELF reject; deterministic synthetic artifact, file/catalog SHA256 and USB byte identity pass. Synthetic ELF fixtures are deliberately not executable and do not test engine behavior.
- `python3 scripts/package.py` twice against built static binaries: PASS; byte-identical 14,988,161-byte tgz. This validation snapshot SHA256: `ab1bfa81c2c559639e85a5d2b6aa596072080ade13c5315801afab3abaf6423d`. **Any binary/document change requires regeneration; final handoff SHA256 is dist/engineering/SHA256SUMS, not this historical snapshot.**
- Actual upstream `validateTool` from mgu-store commit `37702a880f1ed5fd346f4c944127fb276920be9c`: PASS for 61 files, ID `izum-mgu-xray`, HMI `ID7`. A modified extracted engine payload was correctly rejected with SHA256 mismatch.

The upstream validation ran **only extracted pure validation functions**, not
`mgu-deploy.js` top-level/main. Test harness used a temporary extraction directory,
Node VM with read-only fs methods (`existsSync`, `lstatSync`, `readFileSync`), path
and crypto, plus upstream helper functions (`refuse`, `lstatOrNull`, `sha256File`,
`octalMode`, `semverParts`, `safeRel`, `hmiList`, `hookOk`) and required regex
constants. All extracted archive entries were regular files with relative paths.
The harness then deliberately altered only its temporary engine copy and checked
the same upstream validator rejected it. Temporary fixtures were cleaned up.

Not tested: full installed updater/catalog parser, real USB discovery/import,
install/update/remove/rollback, recmgr interaction, reboot, Linux runtime,
on-car ABI, memory/CPU, native UI or real client integration. The catalog and USB
layout are source-documented, not target-validated. This is a non-running local
engineering kit, **not beta or target-ready**.
