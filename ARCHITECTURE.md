# MGU-Xray — architecture, local prototype 0.1.0-dev

## Candidate 0.2.1 extension

Experimental original OAP/RHMI app + Node controller now exist separately from
the browser simulator. Controller spawns the pinned supervisor under the OAP
app UID, feeds a restricted local profile over stdin, and has no listening
control API. UI hide releases HMI visibility but retains ACTIVE while a supervisor exists.
Explicit Stop or manager shutdown stops the proxy; supervisor monitors the parent
PID so abrupt UI death also cancels it. No tool services, recmgr hooks or
autostart are introduced. Native SDK/ABI and all installation lifecycle remain
unverified. The following 0.1.0 design/limitations are historical; current
candidate boundaries and remaining gates are in `packaging/CANDIDATE.md`.

## Boundaries

Untrusted import → strict allowlist parser → canonical Xray JSON → pinned Xray process. The supervisor owns only its child; no shell, systemctl, firewall, resolver, route, OEM file or app setting changes. Secrets arrive through stdin, not CLI arguments or temporary config files. Child output is discarded to prevent credential-bearing diagnostics. The private temporary directory contains only the hash-verified executable copy. No analytics, subscription fetch, pairing or permanent control listener.

Generated proxies: TCP SOCKS5 127.0.0.1:10808 (UDP off), HTTP 127.0.0.1:10809. Exactly one VLESS TCP REALITY outbound; no direct fallback. URI and a strict subset of JSON accepted; unknown fields, duplicate JSON/query keys and inputs over 64 KiB rejected. XHTTP deferred until tested against pinned engine. All profiles are reconstructed, not passed through.

Four child starts maximum with exponential backoff. SIGINT/SIGTERM stops child gracefully (five-second hard deadline). 15-second config validation deadline. Each child has its own process group; Linux also sets Pdeathsig, whose thread-binding caveat still needs testing. GOMEMLIMIT is a soft GC target, **not an enforced memory cap**; hard OS CPU/RAM limits and full descendant/forced-parent-death containment remain release gates. No daemon or autostart installation in MVP.

## Platform layers

Engine: Xray v26.11.9, source 676eaf66f8f05d4d558ee7a74b4736623d3feeb9, Go 1.27.3, CGO off, linux/amd64 baseline v1 target candidate. Build host: Mac M4 arm64. Target ABI/kernel/syscalls remain unverified on owner's G20; upstream reference evidence cannot substitute for target evidence. No Linux VM/container runtime found at startup; do not describe Mac execution as Linux execution.

UI: separate future OAP/renderer client, RU/EN, rotary/touch. Use already installed compatible renderer only; no HMI/renderer edits. Setup is off-driving-display until motion information can be safely verified. No CAN access. A browser mockup is not an iDrive app.

Integration: reuse Store's existing explicit proxy setting after separate approval. No claim of universal proxy inheritance. Recmgr/deploy changes needed for standard packaging are in conflict with strict no-OEM-edits scope and must be resolved before car installation.

## Current limitations

Local users and tailnet forwarding may reach a loopback proxy; loopback does not imply authenticated access. Do not run on a head unit until tailnet ACL/forwarding and per-app access controls have been reviewed. No persisted credential store, UI, authenticated API, OS resource ceiling or on-car install yet. A started child is not evidence of working REALITY; health and endpoint latency must be separately tested and labeled.
