"use client";
import { useRef, useState, type ElementType, type ReactNode } from "react";
import { Check, Users } from "lucide-react";
import type {
  CollaborationReply,
  InvitationStatus,
  InvitationSummary,
} from "../lib/collaboration";
import { rememberActiveTrip } from "../lib/active-trip-store";
export function OpenSharedTrip({
  tripId,
  userId,
  children = "Open trip",
}: {
  tripId: string;
  userId: string;
  children?: ReactNode;
}) {
  return (
    <a
      className="button primary"
      href={`/trips/${tripId}`}
      onClick={() => rememberActiveTrip(userId, tripId)}
    >
      {children}
    </a>
  );
}
export function InvitationExperience({
  initialStatus,
  tripName,
  tripId,
  userId,
  linkBased = false,
  signInHref,
  accountAction,
  LinkComponent = "a",
  respond,
}: {
  initialStatus: InvitationStatus;
  tripName?: string;
  tripId?: string;
  linkBased?: boolean;
  userId: string;
  signInHref?: string;
  accountAction?: ReactNode;
  LinkComponent?: ElementType;
  respond: (decision: "accept" | "decline") => Promise<CollaborationReply>;
}) {
  const [reply, setReply] = useState<CollaborationReply>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const running = useRef(false);
  const state = reply.status || initialStatus;
  const copy: Record<string, [string, string]> = {
    valid: [
      `Join ${tripName || "the trip"}`,
      "Plan together, keep everything in one place.",
    ],
    accepted: [
      reply.status ? "You’re in!" : "You’ve already joined",
      "Your shared trip is ready.",
    ],
    declined: ["Invitation declined", "You haven’t joined this trip."],
    expired: [
      "This invitation has expired",
      "Ask the trip owner for a new invitation link.",
    ],
    revoked: [
      "This invitation is no longer active",
      "Ask the trip owner if you need access.",
    ],
    wrong_account: [
      "This invitation isn’t available for this account",
      "Try another account or ask the owner for a new link.",
    ],
    invalid: [
      "This invitation link isn’t valid",
      "Ask the trip owner to send a fresh link.",
    ],
    unavailable: [
      "Sharing isn’t available yet",
      "Your invitation hasn’t been accepted or changed. Try again after the project’s next update.",
    ],
    used: [
      "This invitation has already been used",
      "Ask the owner for a new link.",
    ],
    already_member: [
      "You’re already on this trip",
      "Open your shared trip to keep planning.",
    ],
    signed_out: [
      "An adventure together",
      "Sign in to view this invitation and join the trip.",
    ],
  };
  async function decide(decision: "accept" | "decline") {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await respond(decision);
      if (result.error) setError(result.error);
      else if (
        !result.status ||
        (result.status === "accepted" && !result.tripId)
      )
        setError(
          "We couldn’t confirm your response. Refresh to check before retrying.",
        );
      else setReply(result);
    } catch {
      setError(
        "We couldn’t confirm your response. Your invitation hasn’t been discarded. Refresh before retrying.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="invitation-page" aria-labelledby="invitation-title">
      <span className="invitation-symbol">
        {state === "accepted" ? <Check size={28} /> : <Users size={28} />}
      </span>
      <p className="eyebrow">An adventure together</p>
      <h1 id="invitation-title">{copy[state][0]}</h1>
      <p>{copy[state][1]}</p>
      {state === "valid" && (
        <div className="sharing-actions">
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void decide("accept")}
          >
            {busy ? "Saving…" : "Join trip"}
          </button>
          {linkBased ? (
            <LinkComponent className="button" href="/trips">
              Not now
            </LinkComponent>
          ) : (
            <button
              className="button"
              disabled={busy}
              onClick={() => void decide("decline")}
            >
              Decline
            </button>
          )}
        </div>
      )}
      {(state === "accepted" || state === "already_member") &&
        (reply.tripId || tripId) && (
          <OpenSharedTrip tripId={(reply.tripId || tripId)!} userId={userId} />
        )}
      {state === "signed_out" && (
        <a className="button primary" href={signInHref}>
          Sign in to continue
        </a>
      )}
      {state === "wrong_account" && accountAction}
      {!["valid", "signed_out"].includes(state) && (
        <LinkComponent className="sharing-secondary-link" href="/trips">
          My Trips
        </LinkComponent>
      )}
      {error && (
        <p className="sharing-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
export function InvitationInbox({
  initialInvitations,
  userId,
  respond,
  onRefresh,
}: {
  initialInvitations: InvitationSummary[];
  userId: string;
  respond: (
    id: string,
    decision: "accept" | "decline",
  ) => Promise<CollaborationReply>;
  onRefresh: () => void;
}) {
  const [completed, setCompleted] = useState<
      Record<
        string,
        { invitation: InvitationSummary; reply: CollaborationReply }
      >
    >({}),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const running = useRef(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const invitations = [
    ...initialInvitations,
    ...Object.values(completed).map((c) => c.invitation),
  ].filter(
    (i, index, list) =>
      !dismissed.includes(i.id) &&
      list.findIndex((x) => x.id === i.id) === index,
  );
  if (!invitations.length) return null;
  async function decide(
    invitation: InvitationSummary,
    decision: "accept" | "decline",
  ) {
    if (running.current) return;
    running.current = true;
    setBusy(invitation.id);
    setError("");
    try {
      const reply = await respond(invitation.id, decision);
      if (reply.error) setError(reply.error);
      else if (!reply.status || (reply.status === "accepted" && !reply.tripId))
        setError("We couldn’t confirm that response. Refresh before retrying.");
      else {
        setCompleted((current) => ({
          ...current,
          [invitation.id]: { invitation, reply },
        }));
        onRefresh();
      }
    } catch {
      setError(
        "Couldn’t confirm your response. Refresh to check before retrying.",
      );
    } finally {
      running.current = false;
      setBusy("");
    }
  }
  return (
    <section className="invitation-inbox" aria-label="Pending invitations">
      <h2>Invitations for you</h2>
      {invitations.map((i) => (
        <article key={i.id} className="sharing-person">
          <strong>{i.trip_name}</strong>
          {completed[i.id] ? (
            <div role="status">
              {completed[i.id].reply.status === "accepted" ? (
                <>
                  You’ve joined.{" "}
                  <OpenSharedTrip
                    tripId={completed[i.id].reply.tripId!}
                    userId={userId}
                  />
                </>
              ) : (
                "Invitation declined."
              )}
              <button
                type="button"
                className="button"
                onClick={() => setDismissed((current) => [...current, i.id])}
              >
                Dismiss
              </button>
            </div>
          ) : (
            <>
              <p>Invited to plan together</p>
              <div className="sharing-actions">
                <button
                  className="button primary"
                  disabled={!!busy}
                  onClick={() => void decide(i, "accept")}
                >
                  Accept
                </button>
                <button
                  className="button"
                  disabled={!!busy}
                  onClick={() => void decide(i, "decline")}
                >
                  Decline
                </button>
              </div>
            </>
          )}
        </article>
      ))}
      {error && (
        <p className="sharing-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
