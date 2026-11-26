# Local milestone handoff — 2026-11-26

Status: working local headless prototype; **not beta or vehicle-ready**.

- Source repository: this folder, no remote publication.
- Engine: Xray v26.11.9 / 676eaf66f8f05d4d558ee7a74b4736623d3feeb9.
- Local static tool kit: `dist/engineering/izum-mgu-xray@0.1.0.tgz`.
- SHA256: `3e651a7b567fd4f9db3564bfe7a00177bfedff94d3f65a04cfb5777138431b77`.
- Bytes: 13,645,967. This hash belongs to this snapshot; regenerated artifact
  truth is always `dist/engineering/SHA256SUMS`.
- Offline layout: `dist/engineering/usb/mgu-repo/izum-mgu-xray/`.
- No units, service hooks, autostart, renderer or app installed by this kit.
  Do not install on a vehicle: on-car ABI, lifecycle, rights and recovery
  remain unverified. It is an engineering payload, not a user-facing app.
- Legal audit pending. Do not redistribute; source files retain their licenses.

Tests and limitations: TEST_REPORT.md. Remaining work: TODO.md.
Before read-only target investigation, obtain separate owner permission and
verify endpoint and parked stable-power conditions. Real profiles only through
a secure local channel. No car writes or publication are currently authorized.
