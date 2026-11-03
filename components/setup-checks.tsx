"use client";
import { useState } from "react";
import {
  setupReportSchema,
  checkStateLabels,
  type SetupReport,
} from "../lib/setup-check-types";
import { useOnline } from "./essentials/online";
import { Button } from "./button";
export function SetupChecks() {
  const [report, setReport] = useState<SetupReport | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copyMessage, setCopyMessage] = useState(""),
    [showText, setShowText] = useState(false),
    online = useOnline();
  async function run(form: FormData) {
    setBusy(true);
    setError("");
    setReport(null);
    setCopyMessage("");
    setShowText(false);
    try {
      const response = await fetch(
        "/api/setup-checks" +
          (form.get("document") === "yes" ? "?document=1" : ""),
        { cache: "no-store", signal: AbortSignal.timeout(30000) },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Checks unavailable.");
      setReport(setupReportSchema.parse(data));
    } catch (error) {
      setError(
        error instanceof Error && error.name !== "ZodError"
          ? error.message
          : "The check response could not be read. Retry in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }
  const text = report ? JSON.stringify(report, null, 2) : "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage(
        "Report copied. You can paste it into this chat for help.",
      );
    } catch {
      setShowText(true);
      setCopyMessage("Select and copy the report text below.");
    }
  }
  return (
    <>
      <section className="card">
        <h2>Run checks from your account.</h2>
        <p>
          Checks use your Google session to read expected database fields and
          optional-service configuration. They make no paid AI or Maps calls.
        </p>
        <form action={run} className="form">
          <fieldset disabled={busy || !online}>
            <label>
              <input type="checkbox" name="document" value="yes" />
              Include read tests for one of my uploaded documents
            </label>
            <p className="muted">
              This optional test requests a short signed read and checks an
              unsigned public URL for one completed upload you own. File
              contents, names and download links are excluded from the report.
            </p>
            <Button disabled={busy}>
              {busy ? "Checking your setup…" : "Run read checks"}
            </Button>
          </fieldset>
          {!online && <p role="status">Reconnect to run setup checks.</p>}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </form>
      </section>
      {report && (
        <section aria-label="Setup check results">
          <div className="section-top">
            <div>
              <h2>
                {report.database.passed} of {report.database.total} database
                read checks passed.
              </h2>
              <p className="muted">
                Checked {new Date(report.checkedAt).toLocaleString()}. Required
                schema: {report.schemaVersionRequired}
                {report.commit ? " · build " + report.commit.slice(0, 7) : ""}.
              </p>
            </div>
            <Button variant="secondary" onClick={copy}>
              Copy diagnostic report
            </Button>
          </div>
          <p>{report.scope}</p>
          {copyMessage && <p role="status">{copyMessage}</p>}
          {showText && (
            <label>
              Diagnostic report
              <textarea readOnly rows={12} value={text} />
            </label>
          )}
          {(
            ["account", "database", "integrations", "verification"] as const
          ).map((group) => (
            <details key={group} open={group !== "database"}>
              <summary>
                {group === "account"
                  ? "Google account and application"
                  : group === "database"
                    ? "Database read details"
                    : group === "integrations"
                      ? "Optional integrations"
                      : "Checks still requiring a functional test"}
              </summary>
              <div className="grid">
                {report.checks
                  .filter((check) => check.group === group)
                  .map((check) => (
                    <article className="card" key={check.id}>
                      <span className={"pill check-state-" + check.state}>
                        {checkStateLabels[check.state]}
                      </span>
                      <h3>{check.title}</h3>
                      <p>{check.detail}</p>
                      {check.code && (
                        <p className="muted">Diagnostic code: {check.code}</p>
                      )}
                    </article>
                  ))}
              </div>
            </details>
          ))}
        </section>
      )}
    </>
  );
}
