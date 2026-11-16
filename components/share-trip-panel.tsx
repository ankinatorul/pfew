"use client";
import { useRef, useState } from "react";
import { InvitationLink } from "./invitation-link";
import { TripPeople, PersonDetails } from "./trip-people";
import { Share2, Users } from "lucide-react";
import { BookingDrawer } from "./booking-drawer";
import type { SharingData, CollaborationReply } from "../lib/collaboration";
import type { InviteState } from "../app/collaboration-actions";
export function ShareTripPanel({
  data,
  defaultOpen = false,
  invite,
  manage,
  onRefresh,
}: {
  data: SharingData;
  defaultOpen?: boolean;
  invite: (form: FormData) => Promise<InviteState>;
  manage: (form: FormData) => Promise<CollaborationReply>;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen),
    [opener, setOpener] = useState<HTMLElement | null>(null),
    [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const running = useRef(false),
    pendingTitle = useRef<HTMLHeadingElement>(null);
  async function run(task: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
    } catch {
      setError("We couldn’t confirm that change. Refresh before trying again.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function request(operation: "remove" | "revoke", id: string, revision = 0) {
    const form = new FormData();
    form.set("trip_id", data.tripId);
    form.set("id", id);
    form.set("revision", String(revision));
    form.set("operation", operation);
    return manage(form);
  }
  async function send(recipient: string) {
    const form = new FormData();
    form.set("trip_id", data.tripId);
    form.set("email", recipient);
    const reply = await invite(form);
    if (reply.error) {
      setError(reply.error);
      onRefresh();
      if (/pending/i.test(reply.error)) pendingTitle.current?.focus();
      return false;
    }
    if (!reply.url) {
      setError(
        "We couldn’t confirm the invitation. Refresh to check before retrying.",
      );
      return false;
    }
    setLink({
      email: recipient,
      url: new URL(reply.url, window.location.origin).href,
    });
    setEmail("");
    setMessage("Your link is ready. Send it to your collaborator.");
    onRefresh();
    return true;
  }
  return (
    <>
      {data.peopleReady && data.people && (
        <TripPeople
          people={data.people}
          owner={data.owner}
          onManage={(trigger) => {
            setOpener(trigger);
            setOpen(true);
          }}
        />
      )}
      <button
        type="button"
        className="button share-trip-trigger"
        onClick={(event) => {
          setOpener(event.currentTarget);
          setOpen(true);
        }}
      >
        <Share2 size={16} aria-hidden="true" />
        Share
      </button>
      {open && (
        <BookingDrawer
          title="Share trip"
          closeLabel="Close sharing"
          initialFocus='input[name="email"]'
          busy={busy}
          onClose={() => setOpen(false)}
          returnFocus={opener}
        >
          <div className="sharing-body">
            <p className="sharing-trip-name">{data.tripName}</p>
            {!data.ready ? (
              <div className="sharing-empty" role="status">
                <Users size={26} />
                <h3>Sharing isn’t available yet</h3>
                <p>
                  {data.error ||
                    "Your trip is safe. Sharing will be available after the project’s next update."}
                </p>
                <button type="button" className="button" onClick={onRefresh}>
                  Refresh
                </button>
              </div>
            ) : (
              <>
                <p className="sharing-role">
                  {data.owner ? "You own this trip" : "Shared with you"}
                </p>
                {data.owner ? (
                  <form
                    className="sharing-invite-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(async () => {
                        setLink(null);
                        await send(email.trim());
                      });
                    }}
                  >
                    <h3>Invite someone</h3>
                    <label htmlFor="collaborator-email">Email address</label>
                    <input
                      id="collaborator-email"
                      name="email"
                      type="email"
                      required
                      maxLength={254}
                      autoComplete="email"
                      placeholder="Enter collaborator’s email"
                      value={email}
                      disabled={busy}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                    <button className="button primary" disabled={busy}>
                      {busy ? "Working…" : "Create invite link"}
                    </button>
                    <small>
                      We won’t send an email. You can share the link yourself.
                    </small>
                  </form>
                ) : (
                  <p className="sharing-muted">
                    Only the trip owner can invite or remove collaborators.
                  </p>
                )}
                {link && <InvitationLink key={link.url} url={link.url} />}
                {data.owner && (
                  <section className="sharing-section">
                    <h3 ref={pendingTitle} tabIndex={-1}>
                      Pending invitations
                      {data.pending.length ? ` · ${data.pending.length}` : ""}
                    </h3>
                    {!data.pending.length ? (
                      <p className="sharing-muted">No pending invitations.</p>
                    ) : (
                      data.pending.map((p) => (
                        <article className="sharing-person" key={p.id}>
                          <strong>{p.email}</strong>
                          <span className="sharing-tag">Pending</span>
                          <small>
                            Expires{" "}
                            {new Intl.DateTimeFormat("en", {
                              day: "numeric",
                              month: "short",
                              timeZone: "UTC",
                            }).format(new Date(p.expires_at))}
                          </small>
                          <div className="sharing-actions">
                            <button
                              type="button"
                              className="button"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `Revoke the invitation for ${p.email}? The old link will stop working.`,
                                  )
                                )
                                  return;
                                void run(async () => {
                                  const result = await request("revoke", p.id);
                                  if (result.error) {
                                    setError(result.error);
                                    return;
                                  }
                                  if (
                                    link?.email.toLowerCase() ===
                                    p.email.toLowerCase()
                                  )
                                    setLink(null);
                                  setMessage("Invitation link revoked.");
                                  onRefresh();
                                });
                              }}
                            >
                              Revoke invitation
                            </button>
                            <button
                              type="button"
                              className="button"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `Replace the invitation for ${p.email}? The old link will stop working.`,
                                  )
                                )
                                  return;
                                void run(async () => {
                                  const result = await request("revoke", p.id);
                                  if (result.error) {
                                    setError(result.error);
                                    return;
                                  }
                                  setLink(null);
                                  if (!(await send(p.email)))
                                    setMessage(
                                      "The old link was revoked. Invite again if a replacement wasn’t created.",
                                    );
                                });
                              }}
                            >
                              Create new link
                            </button>
                          </div>
                        </article>
                      ))
                    )}
                  </section>
                )}
                <section className="sharing-section">
                  <h3>People on this trip</h3>
                  {!data.peopleReady && (
                    <p className="sharing-muted">
                      Profile details aren’t available yet.
                    </p>
                  )}
                  <article className="sharing-person">
                    {data.peopleReady &&
                    data.people?.find((p) => p.role === "owner") ? (
                      <PersonDetails
                        person={data.people.find((p) => p.role === "owner")!}
                      />
                    ) : (
                      <>
                        <strong>{data.owner ? "You" : "Trip owner"}</strong>
                        <span className="sharing-tag">Owner</span>
                      </>
                    )}
                  </article>
                  {data.members.map((m) => (
                    <article className="sharing-person" key={m.id}>
                      {data.peopleReady &&
                      data.people?.find((p) => p.membershipId === m.id) ? (
                        <PersonDetails
                          person={data.people.find(
                            (p) => p.membershipId === m.id,
                          )!}
                        />
                      ) : (
                        <>
                          <strong>{m.label}</strong>
                          <span className="sharing-tag">
                            {m.role === "viewer" ? "Viewer" : "Editor"}
                          </span>
                        </>
                      )}
                      {data.owner && (
                        <button
                          type="button"
                          className="sharing-remove"
                          disabled={busy}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Remove ${m.label} from this trip? Shared plans stay saved. Their private files are unchanged.`,
                              )
                            )
                              return;
                            void run(async () => {
                              const result = await request(
                                "remove",
                                m.id,
                                m.member_revision,
                              );
                              if (result.error) {
                                setError(result.error);
                                return;
                              }
                              setMessage("Collaborator removed.");
                              onRefresh();
                            });
                          }}
                        >
                          Remove collaborator
                        </button>
                      )}
                    </article>
                  ))}
                </section>
              </>
            )}
            {error && (
              <p role="alert" className="sharing-error">
                {error}
              </p>
            )}
            <p role="status" className="sharing-feedback">
              {message}
            </p>
          </div>
        </BookingDrawer>
      )}
    </>
  );
}
