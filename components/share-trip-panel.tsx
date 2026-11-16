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
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [localLink, setLink] = useState<
      (NonNullable<SharingData["sharingLink"]> & { tripId: string }) | undefined
    >();
  const link =
    localLink?.tripId === data.tripId &&
    localLink.revision >= (data.sharingLink?.revision || 0)
      ? localLink
      : data.sharingLink;
  const running = useRef(false);
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
  function request(operation: "remove", id: string, revision = 0) {
    const form = new FormData();
    form.set("trip_id", data.tripId);
    form.set("id", id);
    form.set("revision", String(revision));
    form.set("operation", operation);
    return manage(form);
  }
  async function change(operation: "enable" | "disable" | "reset") {
    const form = new FormData();
    form.set("trip_id", data.tripId);
    form.set("operation", operation);
    form.set("revision", String(link?.revision || 0));
    const result = await invite(form);
    if (result.error) {
      setError(result.error);
      onRefresh();
      return;
    }
    if (
      typeof result.enabled !== "boolean" ||
      typeof result.revision !== "number"
    ) {
      setError("Couldn’t confirm sharing. Refresh before trying again.");
      return;
    }
    setLink({
      tripId: data.tripId,
      enabled: result.enabled,
      revision: result.revision,
      url: result.url,
    });
    setMessage(
      operation === "disable"
        ? "Link sharing disabled. Existing members keep access."
        : operation === "reset"
          ? "Link reset. Previously shared links no longer work."
          : "Sharing enabled.",
    );
    onRefresh();
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
          title="Share this trip"
          closeLabel="Close sharing"
          initialFocus="button"
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
                  <section
                    className="sharing-invite-form"
                    aria-label="Trip sharing link"
                  >
                    <p>Anyone with this link can join and edit your trip.</p>
                    {!data.linkReady ? (
                      <p role="status">Sharing links aren’t available yet.</p>
                    ) : link?.enabled && link.url ? (
                      <>
                        <InvitationLink
                          key={link.url}
                          url={
                            typeof window !== "undefined"
                              ? new URL(link.url, window.location.origin).href
                              : link.url
                          }
                          reusable
                        />
                        <div className="sharing-actions">
                          <button
                            type="button"
                            className="button"
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Reset this link? Previously shared links will stop working. Existing members keep access.",
                                )
                              )
                                void run(() => change("reset"));
                            }}
                          >
                            Reset link
                          </button>
                          <button
                            type="button"
                            className="button"
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Disable sharing? This link will stop working. Existing members keep access.",
                                )
                              )
                                void run(() => change("disable"));
                            }}
                          >
                            Disable sharing
                          </button>
                        </div>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="button primary"
                        disabled={busy}
                        onClick={() => void run(() => change("enable"))}
                      >
                        {busy ? "Working…" : "Enable sharing"}
                      </button>
                    )}
                    <small>
                      Removed collaborators can rejoin with the active link.
                      Reset the link to invalidate old copies.
                    </small>
                  </section>
                ) : (
                  <p className="sharing-muted">
                    Only the trip owner can manage sharing or remove
                    collaborators.
                  </p>
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
                        showEmail={false}
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
                          showEmail={false}
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
                                `Remove ${m.label} from this trip? Shared plans stay saved. Their private files are unchanged. They can rejoin with the active sharing link; reset it to invalidate old copies.`,
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
