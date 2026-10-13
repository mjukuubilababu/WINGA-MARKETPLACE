# Winga implementation status

Start here when resuming the Growth Loops specification:

- [Current status, Messages blocker and next actions](winga-growth-status.md)
- [All 106 sections and durable work IDs](winga-growth-readiness.json)
- [Phase 3 implementation, metrics and pending live acceptance](growth-phase3-status-20261013.md)
- [Operations, security review and deferred validation handoff](growth-operations-handoff.md)
- [Exact-scan security input index, 13 October](evidence/growth-security-review-input-20261013.json)
- [Historical source/evidence map](growth-loops-spec-evidence-20261012.md)
- [Canonical Conversations handoff](conversations-spec-handoff.md)
- [Canonical rollout and rollback](growth-loops-rollout.md)

`npm run growth:readiness` prints the current repository backlog.
`npm run verify:growth-readiness` validates coverage and references without network
access, messages, notifications, memberships, a canary or a replay.

Source/design preparation, deployed assets and synthetic tests are separate from
live acceptance. Read the current Messages/security blockers before treating a
historical report as a completed production feature.
