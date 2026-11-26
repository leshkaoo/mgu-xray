# MGU-Xray 0.1.0 — local engineering kit, NOT beta

This artifact is for local inspection only. No vehicle install, connection,
reboot, networking change, service start or publication is authorized by its
existence. It is not target-ready, recovery-ready or approved for redistribution.

The tool-kit/catalog/USB layout follows researched Store documentation. It
contains linux/amd64 static engine and supervisor binaries, documentation and a
license inventory. It has NO systemd units, hooks, enable entries, restart
entries, credentials, BMW SDK, CAN code or OAP UI. It does not run after install.
No installer has been executed on a vehicle. The installed Store/updater parser
and real USB behavior remain unverified.

The engine dependency license inventory is an automated collection, not a legal
audit of nested third-party code. Review every dependency, linked runtime and
license/source requirement before any distribution. Binary SHA256 and per-file
checksums provide integrity relative to this local build, not source trust.

Do not manually stop/start services on an MGU: recmgr integration must be
verified first. Consult RESEARCH.md and RISKS.md for blocking uncertainties.

No car installation instructions are supplied for this unapproved prototype.
