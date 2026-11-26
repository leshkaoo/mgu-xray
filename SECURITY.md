# Security scope

This is not a vehicle-ready application. No public vulnerability intake or
telemetry endpoint exists; keep any reports local until publication is agreed.

- Never send real UUIDs, private keys or subscription URLs through chat/git.
- Only original project code is MIT. Xray is MPL-2.0; dependency notices and
  legal review are separate gates before redistribution.
- Imported config cannot install services, execute scripts, add routes,
  configure DNS/API, listen on LAN or add a direct outbound.
- Import max 64 KiB, JSON depth 32, exact key casing, duplicate/unknown keys
  rejected. Unknown URI fields rejected; generic client JSON not supported.
- Runtime engine copy is streamed and hashed against an explicitly supplied
  trusted SHA256. The CLI is not a signed supply-chain trust root.
- Profile goes to child stdin; executable-only temporary runtime is 0700.
  Child stdout/stderr are discarded. Residual in-memory secrets are not
  guaranteed to be zeroized. SIGKILL may leave an executable copy, not config.
- Loopback proxies are unauthenticated: local processes, tailnet forwards and
  browser rebinding/access behavior require review before MGU use.
- Server endpoints are not currently sandboxed against local/private/loopback
  destinations or DNS rebinding. Use only deliberately authorized profiles;
  a production policy/explicit synthetic-test mode is a release gate.
- Port reservation/rebind has a race; no socket ownership verification yet.
  Never configure apps to use an unverified listener.
- GOMEMLIMIT is a soft target, not hard RAM enforcement. CPU/RAM/cgroup caps,
  forced parent death and descendant containment require Linux testing.
  Linux Pdeathsig is thread-bound; macOS has no equivalent here.
- Graceful SIGTERM/INT handles the direct pinned engine. Do not claim full
  descendant cleanup or protection from forced parent death on Mac.

No CAN writes, ATM/BDC/DSC/DME/DDE/EGS changes, OEM auth bypass, VIN/eSIM/
certificate/license/firmware edits or resets are in scope. No probing the
reported historical vehicle IP without owner authorization and verification.
Any car write, install, reboot or network change requires its own permission,
parked stable power and a reviewed recovery path. The standard Store installer
edits recmgr/crashhandler/systemd state; that conflicts with the current
no-OEM-edits requirement and must be resolved before proposing installation.
