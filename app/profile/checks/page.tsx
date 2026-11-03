import Link from "next/link";
import { access } from "../../../lib/access";
import { SetupChecks } from "../../../components/setup-checks";
export const dynamic = "force-dynamic";
export default async function Checks() {
  await access();
  return (
    <>
      <Link className="muted" href="/profile">
        ← Your account
      </Link>
      <span className="eyebrow">App setup</span>
      <h1>A clear next step.</h1>
      <p>
        Check the deployed app from your signed-in account, then review the
        optional integrations you want to enable.
      </p>
      <SetupChecks />
      <section className="card">
        <h2>Finish the launch checks</h2>
        <ol>
          <li>Run the read checks above and review any setup issues.</li>
          <li>
            Create a small trip, save a plan, then reload it to check
            persistence.
          </li>
          <li>
            Invite a second Google account. Check Editor and Viewer access and
            each uploader’s document privacy.
          </li>
          <li>
            Download an encrypted offline copy and unlock it after
            disconnecting.
          </li>
          <li>
            Enable the optional Maps or AI services you want, then test them
            with one deliberate request.
          </li>
        </ol>
        <p>
          The copyable report contains check results and public deployment
          details, with no account email, trip names, keys or document links.
        </p>
      </section>
      <details>
        <summary>Optional Google Maps and Places setup</summary>
        <section className="card">
          <p>
            Your Google sign-in setup can stay as it is. Map display and place
            search use Google Maps Platform keys.
          </p>
          <ol>
            <li>
              In{" "}
              <a
                href="https://console.cloud.google.com/google/maps-apis/overview"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Cloud Console
              </a>
              , choose the project and configure its Maps billing/quota
              settings.
            </li>
            <li>
              Enable <strong>Maps JavaScript API</strong> for the interactive
              map and <strong>Places API (New)</strong> for search.
            </li>
            <li>
              Create a browser key restricted to Maps JavaScript API and your
              website referrer, such as <code>https://pfew.vercel.app/*</code>.
            </li>
            <li>
              Create a separate server key restricted to Places API (New).
              Browser website-referrer restrictions do not apply to the server
              request.
            </li>
            <li>
              In Vercel → your project → Settings → Environment Variables, set{" "}
              <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to the browser key
              and <code>GOOGLE_PLACES_API_KEY</code> to the server key for
              Production.
            </li>
            <li>
              Redeploy in Vercel, then open a trip’s Map and make an explicit
              search. Provider billing limits are configured in Google Cloud.
            </li>
          </ol>
        </section>
      </details>
      <details>
        <summary>Optional AI setup</summary>
        <section className="card">
          <ol>
            <li>
              Create an API key in your{" "}
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                OpenAI API account
              </a>{" "}
              and configure its API billing and usage limits.
            </li>
            <li>
              In Vercel’s Production Environment Variables, set{" "}
              <code>AI_MODE</code> to <code>live</code> and{" "}
              <code>AI_API_KEY</code> to that API key. Optionally set{" "}
              <code>AI_MODEL</code>; the app defaults to{" "}
              <code>gpt-4.1-mini</code>.
            </li>
            <li>
              Redeploy, then request one suggestion in Ideas or Packing.
              Document extraction asks separately before sending a source.
            </li>
          </ol>
          <p>
            Manual planning, checklist starters, labeled-text imports and budget
            arithmetic work without this configuration. The app’s estimated
            request budget is separate from provider billing controls.
          </p>
        </section>
      </details>
      <details>
        <summary>If a database read check needs setup</summary>
        <section className="card">
          <p>
            Review the{" "}
            <a
              href="https://github.com/ankinatorul/pfew#database-setup--upgrade"
              target="_blank"
              rel="noopener noreferrer"
            >
              database setup instructions
            </a>
            . Existing Phase 2 projects use the combined upgrade through
            migration 009. Newly created projects need the earlier foundation
            migrations first.
          </p>
          <p>
            Read probes can detect missing fields, but they do not inspect every
            trigger, policy or administrator setting. Use the functional checks
            above after upgrading.
          </p>
        </section>
      </details>
    </>
  );
}
