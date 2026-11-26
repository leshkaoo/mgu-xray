# MGU-Xray — local engineering engine kit, NOT beta

The optional 0.2.0 native app is a SEPARATE source package. It can explicitly
spawn this kit's supervisor after external secure profile provisioning; this
tool kit itself still installs no service and starts nothing. See the current
`CANDIDATE.md` and `CANDIDATE_TEST_REPORT.md` for candidate status and gates.

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
