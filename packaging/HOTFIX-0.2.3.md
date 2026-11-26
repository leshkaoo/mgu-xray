# MGU-Xray 0.2.3 — исправление запуска

UI-only update; Engine stays at 0.2.2. No changes to supervisor, engine, network settings or autostart.

## Fixes

- Accept both named `OnlineApp` SDK exports and direct constructor exports. The former import caused a synchronous TypeError before any screen could open. The new linked-launch regression reproduces that failure using the upstream Store linker and a synthetic named-export donor.
- Complete the SDK initialization handshake before lifecycle RPCs; wait for AppStatus proxy readiness independently, so a late proxy does not prevent the UI from opening. Do not start the engine before the lifecycle channel is ready.
- Keep Store update identity, persistent data path and engine dependency unchanged.

## Verification

- 35 filesystem/controller/mock-RHMI checks passed.
- Upstream-linked launch regression: old import fails; patched named/direct exports with early/late proxy readiness all open and shut down successfully (5 cases).
- Native-controller REALITY loopback e2e passed: SOCKS5, HTTP, hidden UI retention, uplink loss/recovery, parent-loss cleanup, invalid identity rejection.
- 6 packaging checks and upstream tool/source-link validation passed; linked bytes are deterministic.
- Real BMW SDK/donor, installation and on-car operation are not validated by these local tests. Owner-reported failure still needs a target retest after updating.
