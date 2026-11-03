# Setup checks and launch acceptance

No SQL changes are required beyond schema 9. Local tests are evidence for the shipped code/schema, not for the production Google/Supabase/Vercel configuration.

## Automated coverage

- Ordinary authenticated grants accept every static probe against migrations 001–009 in local PostgreSQL. All regular probes request zero rows; only the explicit owned-document sample requests a record. No admin-only budget table is probed.
- The endpoint refuses signed-out requests before database inspection, uses private/no-store responses, passes the verified identity rather than user query parameters, and keeps raw errors/private key values out of diagnostics.
- Missing fields are setup issues; denied/failed checks are unknown. Keys being present never counts as a successful live provider call. No paid call or request reservation occurs.
- Optional document tests scope to one owned ready record, reject malformed paths/unexpected signed URL origins, omit credentials on public reads, and withhold a privacy pass if signed reads failed. Public success indicates a setup issue. Reports omit paths, IDs and signed tokens.
- UI makes no request on mount, defaults to no file test, disables checks offline, distinguishes untested states and supports sanitized clipboard/manual report copying. Signed-out browser checks cover the protected page and API at mobile/desktop sizes.

## Production steps

1. After Vercel deploys, sign in and open `/profile/checks`. Run the read checks. Confirm the deployment commit, expected project hostname/site origin, and 23 database field-read results. Copy the report for diagnosis if any read needs setup or remains unknown. Do not paste credentials.
2. Optionally upload your own small booking document using the normal wallet flow, select the document checkbox and rerun. A signed read should succeed and its public URL should be denied. Also use the normal download control; this test covers one sample only.
3. Create a real test trip, add/edit a plan, booking, Prep/Packing item and allocation, then reload. Confirm data persists and budget totals remain distinct. A zero-row schema read does not establish these writes work.
4. Invite a second verified Google account. Exercise Viewer/Editor roles and revocation, owner-only settings, and each uploader's private documents. A one-account report cannot establish cross-account authorization. Follow `PHASE34_ACCEPTANCE.md` for the full role/storage checks.
5. Save and unlock an encrypted offline copy with the network disconnected, then lock and remove it.
6. Configure only the optional integrations wanted, following the page's Vercel/Google/OpenAI instructions. Redeploy after changing variables. Test one deliberate Maps/Places request and one AI request. Configuration presence alone does not verify keys, billing, referrer restrictions or provider responses.
7. Sign out and complete a fresh Google sign-in. Check `/auth/callback` returns to the production origin and the account avatar/menu are correct.

Direct live checks remain pending when the execution environment blocks the production hosts or has no private Google session. Do not report those checks as passed based on local tests or public health configuration flags.
