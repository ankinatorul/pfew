# Connected Supabase follow-up review

Reviewed the user-supplied `pfew-010-targeted-followup-v1` report. Its read-only flag is on. No function was invoked against Supabase and no database data/settings were changed.

## Resolved catalog questions

- `valid_time_zone` and `validate_destination_link` match the repository after removing whitespace and keyword-case differences. Their checks and behavior are equivalent.
- `trip_onboarding` has **zero rows**, zero broken trip links and zero mismatched owners. There are no saved onboarding preferences to reconcile in this snapshot.
- The three legacy onboarding functions were reviewed in full. `create_onboarding_trip` authenticates, locks per user/request for retries, uses the existing trip creation function and owner-scoped onboarding metadata. `complete_onboarding_draft` requires an owned onboarding record before saving a pending booking. `reserve_onboarding_ai` checks authentication and shared service limits before recording a reservation. They are not automatically called by migration 010. No direct conflict with 010 was identified in the supplied code. They remain outside the current repository and should be retained/documented, not deleted merely because the current UI does not call them.
- The missing migration ledger is not itself a blocker: exported object definitions/fingerprints now establish compatibility with the expected core 001–009 schema. This still cannot establish every other environment's migration history or identify whether this project serves a live client.

## Narrow permission correction prepared locally

The target's reported default grants explicitly grant anonymous EXECUTE on new public functions. `REVOKE ... FROM PUBLIC` alone does not remove this separate grant. The authentication guard still rejects anonymous draft creation, but the intended authenticated-only RPC permissions need to be explicit.

Kept 010 unchanged and added **`supabase/migrations/011_explicit_draft_rpc_permissions.sql`**, a forward-only companion to run after 010 only with approval. It revokes PUBLIC/anon execution on `save_trip_draft(uuid,integer,jsonb)` and `accept_ai_idea(uuid)`, and grants execution to authenticated. It does not change project-wide defaults, other functions, data, RLS or service/admin grants. This avoids rewriting 010's reviewed hash/history.

The isolated regression reproduces the reported Supabase default function grants, confirms the problem before 011, applies 011 twice, and verifies anonymous denial, authenticated draft creation/retry, dated idea acceptance and stranger RLS denial. Existing draft/migration and intelligence database tests also pass. A read-only post-application permission check is prepared at `supabase/CHECK_AFTER_010_011_READ_ONLY.sql`; the four expected values are false, true, false, true. Do not run it before the separately approved migrations exist.

## Current recommendation and next action

**Schema/function review: compatible with the reviewed 010 plus prepared 011. Application recommendation: NO-GO until project use and a suitable recovery option are confirmed.** A compatible schema is not permission to apply migrations automatically.

No more general schema inspection queries are required from the user at this stage. The user only needs to confirm whether this is development-only or also used by a live website, and whether a current restorable backup/recovery option is available. If backup availability is unknown, open the project's **Database → Backups** page and report what is listed. No upgrade, restore, key sharing or database change is requested. Supabase's official backup documentation is https://supabase.com/docs/guides/platform/backups.

After those facts are reviewed and explicit approval is given, the intended sequence on the inspected pre-010 target is 010, then 011, then read-only permission/catalog/baseline verification before fixture writes. Keep the existing five trips intact. If a different target already has an older 010, review its actual state before choosing a forward-only plan. Use a quiet write window and verified backup; do not replay old 006/007 helper definitions after the draft migrations.

Changed locally for this follow-up: new migration 011, the post-application read-only checker, `tests/rpc-grants-database.test.ts`, this report and cross-references in existing handoff/review documents. Application code and migration 010 remain unchanged. No deployment, push, merge, Phase 7C work or connected migration application occurred.
