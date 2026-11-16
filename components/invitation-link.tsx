"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
export function InvitationLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false),
    [copying, setCopying] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    active = useRef(true),
    running = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  async function copy() {
    if (running.current) return;
    running.current = true;
    setCopying(true);
    setCopied(false);
    setError("");
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(url);
      if (!active.current) return;
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      if (!active.current) return;
      setError("Couldn’t copy. Select the link and copy it.");
      input.current?.focus();
      input.current?.select();
    } finally {
      running.current = false;
      if (active.current) setCopying(false);
    }
  }
  return (
    <section className="sharing-link" aria-label="Invitation link ready">
      <strong>Invitation link ready</strong>
      <div className="sharing-link-controls">
        <input
          ref={input}
          aria-label="Invitation URL"
          type="text"
          readOnly
          spellCheck={false}
          value={url}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          className={`button primary sharing-copy ${copied ? "sharing-copy-done" : ""}`}
          disabled={copying}
          onClick={() => void copy()}
        >
          {copied ? (
            <Check size={16} aria-hidden="true" />
          ) : (
            <Copy size={16} aria-hidden="true" />
          )}
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
      <small>Send this link to your collaborator.</small>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Invitation link copied." : ""}
      </span>
      {error && (
        <small className="sharing-error" role="alert">
          {error}
        </small>
      )}
    </section>
  );
}
