# Independent review resolution — local prototype

Reviewed by separate Codex agent and Claude Code read-only review; Claude's
text report is CLAUDE_REVIEW.md. No vehicle testing performed or approved.

## Addressed

- Runtime executable verification: SHA256 required, bytes stream-copied to
  private 0700 runtime, hash checked before executable mode is applied.
- Secret config persistence: removed, Xray accepts `-format json -config stdin:`.
- Ambiguous case-folded keys: exact allowlist plus casing regression tests.
- Parser depth: explicit cap32, 64 KiB size cap remains.
- Preflight process: own process group and Linux Pdeathsig, 15s cancellation.
- Lifecycle/port-conflict/redaction/retry tests added and passed under race.
- Avoid speculative post-Wait group kill, whose PGID could be recycled.
- Signals registered at start of command, environment reduced to GC settings.
- E2E verified valid and invalid auth, outage/recovery and no direct fallback.

## Open gates, no target release

Medium/release gates: port reserve/rebind ownership race, endpoint local/private
address and DNS policy, unauthenticated loopback/browser/tailnet reachability,
hard CPU/RAM and complete descendant/cgroup containment, target noexec paths,
thread-bound Pdeathsig semantics and CGO-disabled DNS. Trusted-hash CLI is
not a signed manifest trust root. Full arbitrary client JSON remains
unsupported. Standard URI compatibility beyond tested subset is not claimed.

Other deliberate limitations: retry budget never resets (safe bounded stop),
no latency/traffic metrics or verified ready state (startup message explicitly
says connectivity unverified), no persisted secrets/UI/autostart. Production
must solve these or explicitly constrain supported behavior. No on-car release
may be inferred from passing local tests.
