> Historical local-research snapshot. Subsequent owner authorization permits publication of 0.2.4; see RELEASE-0.2.4.md. Vehicle access remains unauthorized.

# Local launch candidate 0.2.4 (not published)

Baseline: public source 2db5194df5e6b6ded96bf647eae9d4be61b3f194 (0.2.2). The owner's installed bundle/version is unavailable. Public 0.2.3 was published under the earlier request before the local-only task was delivered; no publication is performed for this task.

Changes: both SDK export shapes; lifecycle handshake/readiness ordering; bounded stage/code-only stderr diagnostics (128 records, max 4 per stage/code); finite SDK/RHMI steps (5 s), initialization-event watchdog (15 s); RHMI updateResources before open; explicit loading flags observed in Sysmon/RideTube; off-state setup hint. UI has no dependency on loading a profile or starting an engine. Candidate metadata is synchronized to 0.2.4; supervisor and Xray executable hashes are unchanged.

A separate izum_mgu_xray_diag source package is UI-only, with its own UUIDs, one state/title/status and no controller or network. Its purpose is local diagnosis, not vehicle installation.

ROOT_CAUSE_UNCONFIRMED for the owner's BMW. Named-export import failure and missing bounded failure handling are demonstrated locally; resource priming/loading flags are reference-observed compatibility changes, not a proven diagnosis of that vehicle. No BMW SDK is included. See the accompanying lab reports for evidence, reference versions and skipped Linux/vehicle checks.
