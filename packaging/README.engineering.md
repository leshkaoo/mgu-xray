# MGU-Xray — local engineering engine kit, NOT beta

The optional 0.2.2 native app is a SEPARATE source package. It can explicitly
spawn this kit's supervisor after external secure profile provisioning; this
tool kit itself still installs no service and starts nothing. See the current
`CANDIDATE.md` and `CANDIDATE_TEST_REPORT.md` for candidate status and gates.

The owner authorized public experimental packages. This toolkit is NOT beta,
target-validated or a recovery image. Publishing does not connect to a vehicle,
install it, change networking or start services. See INSTALL-RU.md for prerequisites.

The tool-kit/catalog/USB layout follows researched Store documentation. It
contains linux/amd64 static engine and supervisor binaries, documentation and a
license inventory. It has NO systemd units, hooks, enable entries, restart
entries, credentials, BMW SDK, CAN code or OAP UI. It does not run after install.
No installer has been executed on a vehicle. The installed Store/updater parser
and real USB behavior remain unverified.

The engine dependency license inventory is an automated collection, not a legal
audit of nested third-party code. Review every dependency, linked runtime and
license/source requirement when reviewing any distribution. Notices and public source locations are included; nested-code legal audit remains pending. Binary SHA256 and per-file
checksums provide integrity relative to this local build, not source trust.

Do not manually stop/start services on an MGU: recmgr integration must be
verified first. Consult RESEARCH.md and RISKS.md for blocking uncertainties.

Experimental Store installation instructions are in INSTALL-RU.md. They do not establish on-car compatibility or authorize the agent to change the vehicle.
