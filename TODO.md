# TODO / release gates

## Local prototype

- [x] Existing-solution preflight and pinned source research.
- [x] Strict TCP REALITY importer and canonical proxies.
- [x] Cross-build pinned engine and supervisor for linux/amd64.
- [x] Parser/race/lifecycle tests and independent source review.
- [x] Passing synthetic REALITY transfers through both proxies.
- [ ] Linux VM/container execution (none installed at startup).
- [x] Reproducibility evidence and local engineering artifact validation.

## Before beta

- Resolve port ownership, unauthenticated loopback/browser access and endpoint
  SSRF/DNS-rebinding policy; enforce OS resource/process containment limits.
- Robust crash-safe state and secret storage; secure import errors/diagnostics.
- XHTTP TLS verification; compatible Happ export import (no bypass).
- Server list/select, connect/disconnect, health, separately labeled latency,
  uptime, traffic and reconnect policy; authenticated IPC; no permanent LAN API.
- Actual iDrive SDK/renderer integration RU/EN, rotary/touch, parked setup.
- Head-unit lifecycle/install/update/remove/rollback tests, UID and port
  allocation, recmgr ownership conflict resolved; no renderer/OEM edits.
- Dependency license audit, notices, CI and history/artifact secret scans.
- Review corrections and independent re-review; unreviewed findings block beta.

## Requires explicit owner input or approval

- Permission for read-only connection to verified car endpoint, parked.
- Confirm target ABI, kernel/libc, systemd, writable/noexec paths, limits,
  installed versions and per-app network/proxy behavior (not inferred).
- Secure local access to authorized REALITY/XHTTP profiles/server, not chat.
- Separate permission for every vehicle write/install/reboot/network edit.
- Private/public publication decision and publication approval. No expenses.

OEM ConnectedDrive/MyBMW/RTTI/weather/VIN-delivery research remains separate;
proxy support does not promise restoration of OEM backend services.
