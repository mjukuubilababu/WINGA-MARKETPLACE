# Device Pending Display Fix: 2026-10-08

## Reproduction And Scope

A genuine independent-browser fixture reproduced an approved native remaining
`Pending approval` in an already-open device dialog. The original implementation
checked session identity but never refreshed the directory. The baseline test
failed after the trusted browser's signed approval was accepted by the store.

The dialog now reads verified device metadata every five seconds while open,
with one refresh in flight. Close or session change stops polling. A mutation
generation discards an older read after a manual action starts. Partial manual
confirmation is retained only for the identical fingerprint and allowed action.
Successful approval keeps that native selected even when others remain pending;
confirmation is cleared before the newly available revoke action.

There is no automatic approval, contact-pin acceptance, key transfer, history
reset, server trust relaxation, feature-flag change or CSP change.

## Verification And Publication

- Eight isolated browser checks passed, including independent approval/revocation,
  delayed refresh after approval, target/confirmation preservation, close cleanup,
  lost-response retries and directory/session substitution rejection.
- Nineteen backend-device and private-login-helper checks passed.
- Frontend core and all 80 frontend behavior checks passed.
- All 93 bundled modules synchronized; four localization catalogs passed with
  1,616 matching keys and no new hard-coded UI debt.
- Frontend build `20261008160000` deployed to the existing `mkubwa` Worker with
  dashboard variables preserved. Version: `d712d635-381f-4027-9c37-62addff6d5a3`.
- Public build-version returned the exact release; the live bundle SHA-256
  matched the generated local bundle. All three UI guards were present.

This is a verified UI fix, not proof that the operator's pending production
natives have been approved. The attempted aggregate profile recheck could not
open those profiles, so no new production device-state confirmation is claimed.
No production test message or device approval/revocation was performed.
Authenticated encrypted production load remains open until the designated
natives are active and the real workload is measured.
