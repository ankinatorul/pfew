"use client";
import { useState, useRef, type FormEvent } from "react";
import {
  relevantReminders,
  type ReadinessTask,
  type ReminderInput,
  type ReadinessResult,
} from "../lib/packing-documents";
export function ReadinessReminders({
  tasks,
  topic,
  today,
  allowed,
  save,
}: {
  tasks: ReadinessTask[];
  topic: "packing" | "documents";
  today: string;
  allowed: boolean;
  save: (input: ReminderInput, remove?: boolean) => Promise<ReadinessResult>;
}) {
  const [editor, setEditor] = useState<ReminderInput | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const guard = useRef(false);
  const related = relevantReminders(tasks, topic),
    input = (t: ReadinessTask): ReminderInput => ({
      id: t.id,
      revision: t.readiness_revision || 0,
      title: t.title,
      due_date: t.due_date || "",
      category: t.category,
      done: t.done,
    });
  async function run(value: ReminderInput, remove = false, close = false) {
    if (guard.current) return false;
    guard.current = true;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const r = await save(value, remove);
      if (r.error) {
        setError(r.error);
        return false;
      } else {
        setMessage(r.message || "Saved.");
        if (close) setEditor(null);
      }
      return true;
    } catch {
      setError(
        "Save not confirmed. Your input is still here; reconnect and retry.",
      );
      return false;
    } finally {
      setPending(false);
      guard.current = false;
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (editor) void run(editor, false, true);
  }
  return (
    <section className="money-card readiness-reminders">
      <div className="money-section-heading">
        <h2>In-app reminders</h2>
        {allowed && (
          <button
            disabled={pending}
            onClick={() =>
              setEditor({
                id: crypto.randomUUID(),
                revision: 0,
                title: "",
                due_date: "",
                category: topic === "documents" ? "Documents" : "Other",
                done: false,
              })
            }
          >
            Add reminder
          </button>
        )}
      </div>
      <p className="money-muted">
        {topic === "documents"
          ? "An upload does not verify a document or complete a task."
          : "Packed items and preparation reminders are checked separately."}
      </p>
      {error && (
        <p role="alert" className="money-notice">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="money-muted">
          {message}
        </p>
      )}
      {editor && (
        <form onSubmit={submit} className="reminder-editor">
          <label>
            Reminder name
            <input
              required
              maxLength={200}
              placeholder={
                topic === "documents"
                  ? "Check travel documents"
                  : "Finish packing"
              }
              value={editor.title}
              disabled={pending}
              onChange={(e) => setEditor({ ...editor, title: e.target.value })}
            />
          </label>
          <label>
            Due date (optional)
            <input
              type="date"
              value={editor.due_date}
              disabled={pending}
              onChange={(e) =>
                setEditor({ ...editor, due_date: e.target.value })
              }
            />
          </label>
          <div className="money-card-actions">
            <button className="button primary" disabled={pending}>
              Save reminder
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setEditor(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {!related.length && (
        <p className="money-muted">
          No {topic === "packing" ? "packing" : "document"} reminders saved.
        </p>
      )}
      {related.map((t) => (
        <div key={t.id} className="reminder-row">
          <label>
            <input
              type="checkbox"
              key={t.id + ":" + (t.readiness_revision || 0)}
              defaultChecked={t.done}
              disabled={!allowed || pending}
              onChange={async (e) => {
                const checkbox = e.currentTarget;
                const saved = await run({
                  ...input(t),
                  done: checkbox.checked,
                });
                if (!saved && checkbox.isConnected) checkbox.checked = t.done;
              }}
            />
            <span>
              {t.title}
              <small>
                {t.due_date
                  ? "Due " +
                    t.due_date +
                    (t.due_date < today && !t.done ? " · Overdue" : "")
                  : "No due date"}
              </small>
            </span>
          </label>
          {allowed && (
            <div className="money-card-actions">
              <button disabled={pending} onClick={() => setEditor(input(t))}>
                Edit reminder
              </button>
              <button
                disabled={pending}
                onClick={() => {
                  if (
                    window.confirm(
                      "Remove this reminder? Documents and packing items stay saved.",
                    )
                  )
                    void run(input(t), true);
                }}
              >
                Remove reminder
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
