# Test report — 2026-11-26

## Actual environment

Mac mini M4, macOS Darwin 25.5.0, arm64. Wrapper Go 1.26.5; engine Go
1.27.3. TLS fixture uses Homebrew Python 3/OpenSSL 3.6.3; system Python's
LibreSSL does not support TLS 1.3 and cannot run this fixture. No Linux
VM/container runtime found. **Linux execution and BMW execution NOT tested.**

## Passed

| Command/check | Actual result |
|---|---|
| `go test -race ./...` | Parser and 5 supervisor lifecycle tests passed |
| `go vet ./...` | Passed |
| `go test ./internal/profile -run=^$ -fuzz=FuzzParse -fuzztime=5s` | Passed; 770,632 executions, no panic (before final casing regressions added) |
| `/opt/homebrew/bin/python3 scripts/test-package.py` | 6/6 packaging safety tests passed |
| `/opt/homebrew/bin/python3 scripts/e2e-local.py` | Six synthetic REALITY checks below passed |
| `sh scripts/build.sh` twice + `cmp build/SHA256SUMS.first build/SHA256SUMS` | Four artifacts byte-identical on this host/toolchain/cache |
| `file build/*linux-amd64` | Both executable artifacts static x86-64 ELF |
| Upstream pure `validateTool` | Accepted engineering tool kit; tampered payload rejected (historical snapshot in packaging/VALIDATION.md) |

Synthetic E2E uses only loopback: own transient TLS cover service, own Xray
REALITY server and HTTP marker endpoint, generated ephemeral keys and dummy
UUIDs. No real profile, subscription, internet endpoint or car involved.

1. SOCKS5 transferred marker through REALITY.
2. HTTP transferred marker through REALITY.
3. Upstream loss failed closed; no direct transfer.
4. Restored upstream recovered transfer.
5. SIGTERM removed both test proxy listeners.
6. Different well-formed VLESS UUID was denied; no direct transfer.

Supervisor fixtures also verified SHA256 mismatch prevents execution, occupied
ports are preserved, child secret-bearing diagnostics are suppressed, exactly
four crash starts exhaust the retry budget, runtime is 0700 with only an
executable and normal SIGTERM removes runtime and direct child.

## Failures investigated

- Default 10808 occupied by Tunnel. Existing process unchanged; synthetic
  tests allocate separate loopback ports.
- System Python TLS 1.3 unavailable; switched fixture to installed Homebrew
  Python/OpenSSL, no system configuration changed.
- Serial TLS-cover server stalled REALITY's concurrent probes. Replaced with
  concurrent TLS workers. Pinned Xray also denies private server egress by
  default. Synthetic server has one explicit allow rule for the test HTTP
  marker's loopback IP/port. Product client/importer has no freedom outbound
  and does not accept this server-side exception.
- Review reproduced mixed-case duplicate JSON ambiguity. Fixed with exact
  key allowlist, regression cases and depth32 cap.
- An exploratory descendant mock could survive direct-child cleanup; cleaned
  up by test author. Full descendant/cgroup containment remains **not passed**.

## Not tested / not implemented

Actual authorized external server, real Happ export, XHTTP, DNS/TLS failure
matrix, sustained CPU/RAM/throughput, forced parent death on target, resource
caps, endpoint SSRF policy, socket ownership race, browser access/rebinding,
Linux runtime, target ABI/kernel/syscalls, Store real proxy integration,
native iDrive UI, install/update/remove/rollback/reboot, stock preservation,
real USB discovery and vehicle networking. CI workflow is authored locally,
not remotely executed. License inventory is automated, not a legal audit.

No beta/target-ready or OEM-service-restoration claim is made.
