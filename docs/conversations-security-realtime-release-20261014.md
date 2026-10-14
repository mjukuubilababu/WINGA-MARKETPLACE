# Conversations Security & Realtime — verified ACK hardening release

Observed 14 October 2026. Source release `633c6b7d786d33e654d4820c26083a930a183da1`.
This documentation-only evidence branch preserves the verified release without
another runtime deployment. It introduces no PR, independent approval or
production-ready declaration.

## Released source / actual evidence

The direct MLS client now requires the canonical committed ISO timestamp and
decimal sequence before SENT/outbox retirement, matching existing Room behavior.
Incomplete replies keep the exact logical UUID and ciphertext for reconciliation.
No crypto primitive, provider, wire format, migration, device approval or
production feature switch changes. Marketplace domains stay outside BEAM.

- Cloudflare final build **20261014090802**; all **eight** deployed assets match,
  including `vendor/winga-mls-candidate.js` SHA-256
  `d68636a61ba7604524bbcd40a9a2e414f409e5a41f57eb89c45a9557828dcfd1`.
- All four Render services are live at the exact source. Backend and Phoenix
  health return HTTP200; backend identifies the commit, Phoenix identity is
  supplied by Render deployment metadata, not a nonexistent health SHA header.
- [Acceptance run 38538559667](https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/38538559667):
  functional `115767382199`, dependencies `115767381717`, beam `115767382113`
  pass. Actual CI confirms 153 frontend, 51 encrypted browser, 27 sharing/export
  browser and 28 guest/auth browser scenarios; 1,766 keys in four catalogs,
  98 synchronized modules. These are isolated fixtures, not human activation.
- Local direct runtime proof passes **57 cases**, including eight invalid-ACK
  variants with reload/exact-ciphertext retry. The new authenticated cookie/HTTP/
  canonical store browser case uses **PGlite**, proves one committed ciphertext
  row and zero new plaintext rows; it does not claim independent PG connections.
- [Production deployment run 38540080662](https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/38540080662),
  job `115772379156`, passes required checks, deployment and production verifier.

## Security / incomplete contract gates

Static-analysis job `115767381975` remains failed with `CODEQL_REVIEW_STALE`:
**54 findings, 21 error / 33 warning, zero reviewed**. Levels alone are not proof
of exploitability. Tree fingerprint:
`ade92321cf6e4d710f42b4bdb58dc1f16e238b8dd77a1313d58ba317e53f336a`.
No stale tree binding, finding suppression, reviewer impersonation or waiver is
introduced. Required deployment checks pass; the acceptance workflow is not all green.

[SARIF artifact 11881650629](https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/38538559667/artifacts/11881650629)
expires **12 January 2027 at 08:55:13 UTC**. ZIP metadata SHA-256:
`2e9ee709146bccdd5b64b32b1166ae245ac0298a1fd83e8a53ce0b7119a7ef77`.
This packet retains metadata and emitted gate totals; the full SARIF was not
downloaded or independently reviewed. Retrieve the exact archive for real review.
The integrated ts-mls candidate still needs actual independent crypto/library approval.

The new supplied contract is complete only for **0–53** and stops mid-**54**.
The user replied “naangalia” while looking for the continuation. No later
requirements are invented or taken from differently numbered historical specs.
[Current partial-contract audit](conversations-security-realtime-audit-20261014.md)
and [mapping](conversations-security-realtime-readiness-20261014.json) preserve
all received requirements and source/gate distinctions.

Real source work remains: privacy-aware ephemeral presence/typing/device
aggregation; always-available device security notices; compatible ordering scopes
and legacy migration; provider-CA/DB certificate verification and infrastructure
assurance; retention/erasure policies. Physical devices, actual Messages/Room
acceptance, staged capacity/recovery and independent review also remain open.
Video failure work stays explicitly deferred. **Production readiness remains false.**

[Machine-readable release observations](evidence/conversations-security-realtime-release-20261014.json).
