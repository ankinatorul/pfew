"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { joinSharedTrip } from "../app/collaboration-actions";
import { rememberActiveTrip } from "../lib/active-trip-store";
export function JoinTrip({
  state,
  token,
  tripName,
  userId = "",
}: {
  state: "valid" | "invalid" | "signed_out" | "unavailable";
  token: string;
  tripName?: string;
  userId?: string;
}) {
  const router = useRouter(),
    running = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function join() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("token", token);
      const result = await joinSharedTrip(form);
      if (result.error || !result.tripId) {
        setError(result.error || "Couldn’t confirm joining. Try again.");
        return;
      }
      rememberActiveTrip(userId, result.tripId);
      router.replace("/trips/" + result.tripId);
      router.refresh();
    } catch {
      setError("Couldn’t confirm joining. Check your connection and retry.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="invitation-page" aria-labelledby="join-title">
      <span className="invitation-symbol">
        <Users aria-hidden="true" size={28} />
      </span>
      <h1 id="join-title">
        {state === "valid"
          ? `Join ${tripName || "the trip"}`
          : state === "signed_out"
            ? "Plan an adventure together"
            : state === "unavailable"
              ? "Sharing isn’t available yet"
              : "This sharing link is no longer active"}
      </h1>
      <p>
        {state === "valid"
          ? "Joining gives you Editor access to this trip’s shared plans."
          : state === "signed_out"
            ? "Sign in with Google to view and join this trip."
            : state === "unavailable"
              ? "Please try again after the project’s next update."
              : "Ask the owner for the current sharing link."}
      </p>
      {state === "valid" && (
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void join()}
        >
          {busy ? "Joining…" : "Join trip"}
        </button>
      )}
      {state === "signed_out" && (
        <a
          className="button primary"
          href={"/login?next=" + encodeURIComponent("/join/" + token)}
        >
          Sign in with Google
        </a>
      )}
      <Link className="sharing-secondary-link" href="/trips">
        My Trips
      </Link>
      {error && (
        <p className="sharing-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
