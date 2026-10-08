# Conversations Acceptance Follow-Up: 2026-10-09

This checkpoint follows sections 222-225. Implementation and isolated acceptance
are separate from authenticated production load, physical-device acceptance and
external cryptographic approval. The operator confirmed production accounts
`rey` and `wizad` remain Pending; their approvals are not bypassed or changed.

## Room Order References

The encrypted Room protocol now accepts an ID-only `order-reference`. Projection
converges duplicate and reordered references. Room membership never grants
access to the canonical order: only its current buyer/seller can read details
from the existing authorized reference endpoint. There is no wallet, automatic
checkout, payment authority or group-order state derived from chat snapshots.

The Orders tab includes explicit sharing consent, searchable canonical order
selection and fresh authorization before opening an order. An uncertain share
recovers the existing native journal ID after closing/reopening its dialog;
retry retains ciphertext and logical identity. Canonical metadata is bound to
the current UI session, cleared across session replacement, and discarded on
authorization failure in both interactive and background refresh paths.

Local evidence: nine UI regressions and seven native transport unit tests pass;
the real encrypted Room browser case passes on mobile/desktop layouts. It checks
unchanged committed ciphertext after a lost response, no private canonical data
for nonparticipants, and denial after removal of an existing order participant.
A separate reviewer found no remaining actionable finding in the scoped Room
runtime/privacy re-review. These checks use synthetic accounts only.

## Native Phoenix Transport

The candidate negotiates optional signed native operations over Phoenix while
retaining the existing canonical encrypted operation authority. Tickets bind
the authenticated session; the canonical handler still verifies native actor,
signature, device, membership, operation limits and revocation. Socket failures
recover over HTTP with the same signed envelope, never legacy plaintext send.
Older Phoenix deployments that do not negotiate this capability retain HTTP.

The native BEAM acceptance fixture must independently prove live delivery
between two nodes and ciphertext replay following real process termination.
The independent reviewer identified the earlier fixture's same-node setup as
insufficient evidence for live cross-node delivery; that finding is addressed
in the revised candidate, not waived. Final CI results are recorded below only
after execution. Local unit tests cannot replace genuine BEAM execution.

## Actual Static-Analysis Gate

CodeQL security-extended output is now checked with a fail-closed SARIF gate.
All emitted security findings, including suppressed/baseline findings, block
the candidate. Missing, incomplete, unsuccessful or malformed scans do not pass.
Triage output contains only safe rule/path/line metadata, never source snippets.
The gate has dedicated regressions and uses the actual analyze output in CI.

The candidate is first published to `codex/conversations-final-acceptance` so
the backend's On Commit deploy does not publish unverified native runtime code.
No production flags, credentials, CSP, recovery keys or pending approvals are
changed. Promotion to master requires passing candidate verification.

## Remaining External Acceptance

- Authenticated production messaging/load with approved user devices.
- Physical-device media, recovery and replacement acceptance.
- Sustained production capacity/SLO acceptance; bounded public read-only soak is
  not proof of encrypted messaging throughput or saturation capacity.
- Independent external cryptographic/security approval.

Until these gates pass, sections 228-229 and 237-238 are not certified as
PRODUCTION ACCEPTED. Separate coding agents and scanner results are useful
review evidence, not external cryptographic certification.
