# MGU-Xray 0.2.4

Launch compatibility update: support named/direct OnlineApp SDK exports, acknowledge initialization before lifecycle RPCs, prime RHMI resources before opening, enable reference-observed RHMI/entry-point loading flags. Add bounded stage/code-only diagnostics and startup/RHMI timeouts. The UI opens locally without a profile or engine; engine starts only on explicit action.

UI and Engine package versions are both 0.2.4. Supervisor and Xray executable digests are unchanged. Persistent data path and application identity are retained. The diagnostic-only app is in source, not in the installation catalog.

Previously completed checks: 35 native/controller cases, 18 linked-launch cases, 6 packaging checks, actual Node8.9.4 source load, Go race/vet, synthetic REALITY e2e, upstream Store link/validation and byte-identical repack. No full BMW SDK or Linux AMD64 VM runtime was available. Vehicle-specific root cause remains unconfirmed; this is an experimental update, not a claim of a verified BMW fix.
