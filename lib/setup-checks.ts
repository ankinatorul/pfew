import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { SetupCheck, SetupReport } from "./setup-check-types";
export const schemaProbes = [
  {
    table: "trip_onboarding",
    columns: "trip_id,owner_id,request_id,preferences",
    title: "Private onboarding and review drafts",
  },
  { table: "profiles", columns: "id,display_name", title: "Account profile" },
  {
    table: "trips",
    columns:
      "id,owner_id,start_date,end_date,timezone,style,currency,budget,updated_at",
    title: "Trips",
  },
  {
    table: "trip_segments",
    columns:
      "id,trip_id,destination_id,location_id,arrival_location_id,latitude,longitude,google_place_id,duration_minutes,updated_at",
    title: "Itinerary and automatic locations",
  },
  {
    table: "trip_hub_preferences",
    columns: "trip_id,layout",
    title: "Trip layout",
  },
  {
    table: "bookings",
    columns:
      "id,trip_id,location_id,end_location_id,import_key,import_method,paid_amount",
    title: "Bookings and reviewed imports",
  },
  {
    table: "booking_attachments",
    columns: "id,trip_id,booking_id,owner_id,state,path",
    title: "Private document records",
  },
  {
    table: "prep_tasks",
    columns: "id,trip_id,research_note_id,done",
    title: "Preparation tasks",
  },
  {
    table: "packing_lists",
    columns: "id,trip_id,traveler",
    title: "Packing lists",
  },
  {
    table: "packing_items",
    columns: "id,trip_id,list_id,packed",
    title: "Packing items",
  },
  {
    table: "packing_templates",
    columns: "id,owner_id,items",
    title: "Private packing templates",
  },
  {
    table: "budget_settings",
    columns: "trip_id,include_prepaid",
    title: "Budget rules",
  },
  {
    table: "budget_allocations",
    columns: "id,trip_id,currency,planned,estimate_low,estimate_high",
    title: "Planned budget allocations",
  },
  {
    table: "expenses",
    columns: "id,trip_id,amount,currency,day",
    title: "Recorded expenses",
  },
  {
    table: "saved_places",
    columns: "id,trip_id,google_place_id,source",
    title: "Saved places",
  },
  {
    table: "trip_check_findings",
    columns: "id,trip_id,fingerprint,active",
    title: "Trip Check findings",
  },
  {
    table: "finding_decisions",
    columns: "finding_id,trip_id,decision,remind_after",
    title: "Trip Check decisions",
  },
  {
    table: "trip_check_runs",
    columns: "trip_id,checked_at,finding_count",
    title: "Trip Check run history",
  },
  {
    table: "ai_suggestions",
    columns: "id,trip_id,source,accepted_segment_id",
    title: "Reviewed ideas",
  },
  {
    table: "service_usage",
    columns: "id,actor_id,service,estimated_cents",
    title: "Request accounting",
  },
  {
    table: "trip_members",
    columns: "id,trip_id,user_id,role",
    title: "Shared-trip membership",
  },
  {
    table: "trip_invitations",
    columns: "id,trip_id,email,token_hash,accepted_at",
    title: "Invitation records",
  },
  {
    table: "audit_events",
    columns: "id,trip_id,actor_id,entity_table,action",
    title: "Shared-trip activity",
  },
  {
    table: "research_notes",
    columns: "id,trip_id,source_id,source_url,context,retrieved_at,reviewed_at",
    title: "Official-source research",
  },
] as const;
const missingCodes = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);
const knownCodes = new Set([
  ...missingCodes,
  "42501",
  "PGRST301",
  "PGRST302",
  "PGRST303",
  "PGRST202",
]);
const codeOf = (error: unknown) => {
  const code = z.object({ code: z.string() }).safeParse(error);
  return code.success && knownCodes.has(code.data.code)
    ? code.data.code
    : "REQUEST_FAILED";
};
export type SetupConfiguration = {
  siteUrl: string;
  projectUrl: string;
  ai: boolean;
  places: boolean;
  maps: boolean;
  commit: string | null;
};
function publicLocation(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return { origin: url.origin, host: url.hostname, protocol: url.protocol };
  } catch {
    return null;
  }
}
function failedProbe(
  probe: (typeof schemaProbes)[number],
  error: unknown,
): SetupCheck {
  const code = codeOf(error),
    missing = missingCodes.has(code);
  return {
    id: "schema-" + probe.table,
    group: "database",
    title: probe.title,
    state: missing ? "needs_setup" : "unknown",
    detail: missing
      ? "An expected table or field is unavailable. Review the database setup instructions."
      : "This account could not complete the read check. Check your connection and database access.",
    code,
  };
}
async function probeSchema(db: SupabaseClient, signal: AbortSignal) {
  const results: SetupCheck[] = [];
  for (let offset = 0; offset < schemaProbes.length; offset += 6) {
    const batch = schemaProbes.slice(offset, offset + 6);
    const settled = await Promise.allSettled(
      batch.map(async (probe) => {
        const result = await db
          .from(probe.table)
          .select(probe.columns)
          .limit(0)
          .abortSignal(signal);
        return result.error
          ? failedProbe(probe, result.error)
          : {
              id: "schema-" + probe.table,
              group: "database" as const,
              title: probe.title,
              state: "passed" as const,
              detail:
                "Expected fields accepted a zero-row read using this signed-in account.",
            };
      }),
    );
    settled.forEach((result, index) =>
      results.push(
        result.status === "fulfilled"
          ? result.value
          : failedProbe(batch[index], null),
      ),
    );
  }
  return results;
}
const documentChecks = (
  state: SetupCheck["state"],
  detail: string,
): SetupCheck[] => [
  {
    id: "document-read",
    group: "verification",
    title: "One uploaded document · signed read",
    state,
    detail,
  },
  {
    id: "document-public",
    group: "verification",
    title: "One uploaded document · public URL test",
    state,
    detail,
  },
];
async function cancelBody(response: Response) {
  try {
    await response.body?.cancel();
  } catch {}
}
async function beforeDeadline<T>(request: PromiseLike<T>, signal: AbortSignal) {
  signal.throwIfAborted();
  let abort: () => void = () => {};
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
async function checkDocument(
  db: SupabaseClient,
  userId: string,
  projectUrl: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<SetupCheck[]> {
  try {
    const record = await db
      .from("booking_attachments")
      .select("path")
      .eq("owner_id", userId)
      .eq("state", "ready")
      .limit(1)
      .abortSignal(signal)
      .maybeSingle();
    if (record.error)
      return documentChecks(
        "unknown",
        "An owned document record could not be checked.",
      );
    if (!record.data)
      return documentChecks(
        "not_tested",
        "No completed upload owned by this account is available. Upload a document to a booking, then retry this optional check.",
      );
    const path = record.data.path as unknown;
    if (typeof path !== "string")
      return documentChecks(
        "unknown",
        "The document record could not be used safely.",
      );
    const pieces = path.split("/");
    if (
      pieces.length !== 4 ||
      pieces[0] !== userId ||
      !pieces.every((piece) => z.uuid().safeParse(piece).success)
    )
      return documentChecks(
        "unknown",
        "The document record could not be used safely.",
      );
    const project = publicLocation(projectUrl);
    if (!project)
      return documentChecks(
        "unknown",
        "The storage project URL is unavailable.",
      );
    const checks = documentChecks(
      "unknown",
      "The request could not be completed. Retry when the connection is available.",
    );
    let signedReadSucceeded = false;
    try {
      const signed = await beforeDeadline(
        db.storage.from("booking-files").createSignedUrl(path, 30),
        signal,
      );
      if (!signed.error && signed.data) {
        const url = new URL(signed.data.signedUrl);
        if (
          url.origin === project.origin &&
          url.pathname ===
            "/storage/v1/object/sign/booking-files/" + pieces.join("/")
        ) {
          const response = await fetcher(url, {
            headers: { Range: "bytes=0-0" },
            credentials: "omit",
            redirect: "error",
            cache: "no-store",
            signal,
          });
          await cancelBody(response);
          signedReadSucceeded = response.ok;
          checks[0] = {
            ...checks[0],
            state: response.ok ? "passed" : "unknown",
            detail: response.ok
              ? "A short signed read request for one of your completed uploads succeeded. File contents and names are excluded from this report."
              : "The signed document request did not succeed. This does not identify the cause; retry the normal download from Your account.",
          };
        }
      }
    } catch {}
    // No cookies, API key, authorization header or signed token is sent here.
    const publicUrl = new URL(
      "/storage/v1/object/public/booking-files/" +
        pieces.map(encodeURIComponent).join("/"),
      project.origin,
    );
    try {
      const response = await fetcher(publicUrl, {
        headers: { Range: "bytes=0-0" },
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal,
      });
      await cancelBody(response);
      const served = response.ok,
        denied = [400, 401, 403, 404].includes(response.status);
      checks[1] = {
        ...checks[1],
        state: served
          ? "needs_setup"
          : denied && signedReadSucceeded
            ? "passed"
            : "unknown",
        detail: served
          ? "This owned document was served through an unsigned public URL. Set the booking-files bucket to private and review its access settings."
          : denied && signedReadSucceeded
            ? "The unsigned public URL did not serve this one known document. Cross-account access and bucket policies still need separate checks."
            : "The unsigned public request could not establish an access result.",
      };
    } catch {}
    return checks;
  } catch {
    return documentChecks(
      "unknown",
      "The document check could not finish. No upload or deletion was performed.",
    );
  }
}
export async function runSetupChecks(options: {
  db: SupabaseClient;
  userId: string;
  configuration: SetupConfiguration;
  inspectGoogle: () => Promise<{ google: "enabled" | "disabled" | "unknown" }>;
  includeDocument?: boolean;
  fetcher?: typeof fetch;
}): Promise<SetupReport> {
  const { db, userId, configuration, inspectGoogle } = options,
    checkedAt = new Date().toISOString(),
    signal = AbortSignal.timeout(12000);
  const settled = await Promise.allSettled([
    probeSchema(db, signal),
    inspectGoogle(),
    db.rpc("service_budget_status").abortSignal(signal),
    options.includeDocument
      ? checkDocument(
          db,
          userId,
          configuration.projectUrl,
          options.fetcher || fetch,
          signal,
        )
      : Promise.resolve(
          documentChecks(
            "not_tested",
            "Select the optional document check to test one completed upload owned by this account.",
          ),
        ),
  ]);
  const database =
    settled[0].status === "fulfilled"
      ? settled[0].value
      : schemaProbes.map((probe) => failedProbe(probe, null));
  const google =
    settled[1].status === "fulfilled" ? settled[1].value.google : "unknown";
  const budget = settled[2].status === "fulfilled" ? settled[2].value : null;
  const readableLimits =
    budget &&
    !budget.error &&
    z
      .object({
        monthly_limit_cents: z.number(),
        estimated_cents: z.number(),
        daily_user_requests: z.number(),
      })
      .safeParse(budget.data).success;
  const site = publicLocation(configuration.siteUrl),
    project = publicLocation(configuration.projectUrl);
  const checks: SetupCheck[] = [
    {
      id: "google-session",
      group: "account",
      title: "Current Google session",
      state: "passed",
      detail: "This request was verified as a signed-in Google-linked account.",
    },
    {
      id: "google-provider",
      group: "account",
      title: "Google sign-in availability",
      state:
        google === "enabled"
          ? "passed"
          : google === "disabled"
            ? "needs_setup"
            : "unknown",
      detail:
        google === "enabled"
          ? "Supabase currently advertises Google sign-in as enabled."
          : google === "disabled"
            ? "Supabase reports Google sign-in disabled. Check the Google provider settings."
            : "Google provider availability could not be read. A fresh OAuth round trip was not tested.",
    },
    {
      id: "site-origin",
      group: "account",
      title: "Application callback origin",
      state: site ? "configured" : "needs_setup",
      detail: site
        ? "A site origin is configured. Verify its /auth/callback URL in Supabase redirect settings when testing a fresh sign-in."
        : "Set the canonical site URL for this deployment.",
    },
    ...database,
    {
      id: "request-limits",
      group: "database",
      title: "Request-limit reporting",
      state: readableLimits ? "passed" : "unknown",
      detail: readableLimits
        ? "The app can read its configured request limits. No service request was reserved."
        : "Request-limit reporting could not be confirmed. Check the intelligence/database upgrade.",
    },
    ...[
      {
        id: "ai",
        title: "Optional AI services",
        present: configuration.ai,
        detail:
          "Live AI mode and a server key are present. A paid request and key validity have not been tested.",
      },
      {
        id: "places",
        title: "Optional Google Places search",
        present: configuration.places,
        detail:
          "A server Places key is present. API authorization, billing and actual search have not been tested.",
      },
      {
        id: "maps",
        title: "Optional interactive Google Maps",
        present: configuration.maps,
        detail:
          "A browser Maps key is present. Referrer restrictions and actual map loading have not been tested.",
      },
    ].map((item) => ({
      id: item.id,
      group: "integrations" as const,
      title: item.title,
      state: item.present ? ("configured" as const) : ("optional" as const),
      detail: item.present
        ? item.detail
        : "Not configured. Manual planning and the basic checklist/budget tools remain available.",
    })),
    ...(settled[3].status === "fulfilled"
      ? settled[3].value
      : documentChecks(
          "unknown",
          "The optional document check could not finish.",
        )),
    {
      id: "saving",
      group: "verification",
      title: "Saving and persistence",
      state: "not_tested",
      detail:
        "These checks do not write data. Save and reopen a real test trip to verify persistence.",
    },
    {
      id: "sharing",
      group: "verification",
      title: "Owner, Editor and Viewer privacy",
      state: "not_tested",
      detail:
        "A single account cannot establish cross-account authorization. Verify an invitation and role changes with a second Google account.",
    },
    {
      id: "storage-policies",
      group: "verification",
      title: "Private bucket and storage policies",
      state: "not_tested",
      detail:
        "Administrator bucket settings and other users’ access policies were not inspected. An optional single-file read is only a sample.",
    },
  ];
  return {
    checkedAt,
    release: "phase-4",
    schemaVersionRequired: 10,
    commit:
      configuration.commit && /^[a-f0-9]{7,40}$/.test(configuration.commit)
        ? configuration.commit
        : null,
    siteOrigin: site?.origin || null,
    projectHost: project?.host || null,
    database: {
      passed: database.filter((item) => item.state === "passed").length,
      total: schemaProbes.length,
    },
    checks,
    scope:
      "Read checks using the signed-in account. Schema reads do not prove write permissions, cross-account privacy or complete migration application. Optional service states report configuration presence, not successful provider calls.",
  };
}
