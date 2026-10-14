# Conversations ordering — verified release, 14 October 2026

Commit `e3f4a8401d24bc3ec18700cecdbc92982ecb80a1` is pushed to master and verified Live on all four
existing Render services. Cloudflare build **20261014111138** matches all
eight checked source assets, including the native MLS vendor and 99-module
bundle. Backend health returns the exact SHA; Phoenix health is HTTP 200 and its
identity is verified through Render metadata.

[Source change and local limits](conversations-ordering-20261014.md).
[Exact release evidence](evidence/conversations-ordering-release-20261014.json).

Required functional, dependency and BEAM jobs passed in
[acceptance run 38553288050](https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/38553288050).
The exact-tree functional job passed encrypted browser 51/51 (4.9m), sharing 27/27
and guest/auth return 28/28, frontend core 153/153, four 1,766-key catalogs with
zero new hardcoded debt, and 99 synchronized modules.

[Production run 38554823037](https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/38554823037)
completed successfully, including the existing required-job gate, deployment and
the actual final production verifier. An earlier automatic Workers build
`20261014105909` also matched the same source; it is superseded by the final
pipeline build above.

**Overall acceptance workflow remains failure:** static analysis reports
`CODEQL_REVIEW_STALE`, 54 findings (21 error / 33 warning), zero reviewed.
Source-tree fingerprint:
`7e7ccbe7be64d5c6e283a803f45081f21b56dc0872cac147485d1678ce5cd8bf`.

The retained SARIF artifact is `conversation-codeql-e3f4a8401d24bc3ec18700cecdbc92982ecb80a1`
(ID 11888080498), digest `sha256:01e5f5d4b551dbb4dd91c84ce8e5d380d3c534fac8c2045f79d39b3906e2af31`, expiring
2027-01-12T10:58:24Z. Full SARIF was not downloaded or independently reviewed.
No review was forged/rebound and no production/security policy was weakened.
Existing deployment policy gates the three required jobs separately; it does
not constitute crypto/security approval or make all CI green.

This is read-only deployment/asset evidence, not an authenticated live
conversation, trusted-device approval, real R2/media/recovery, physical PWA,
capacity or independent cryptographic acceptance. Shopping Rooms §0 remains
unaccepted. No new Room feature, schema, crypto protocol/library, flag, CA/CSP
permission or Phoenix instance change occurred. Video failure work stays deferred.

Next source work is privacy-aware ephemeral presence/typing on the existing
Phoenix plane, then durable device security notices. TLS/retention, reviewed
crypto and real-device/operational gates remain open. Missing new Conversations
§54+ and Shopping Rooms §61+ text is not reconstructed.

This evidence-only branch adds no runtime source and is not a second application
release. The master application remains the verified commit above.
