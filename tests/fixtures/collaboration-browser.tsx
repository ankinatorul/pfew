import React, { useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { AppShellView } from "../../components/app-shell-view";
import { ShareTripPanel } from "../../components/share-trip-panel";
import {
  InvitationExperience,
  InvitationInbox,
} from "../../components/invitation-experience";
import { FilePrivacyControl } from "../../components/file-privacy-control";
import type { SharingData, InvitationStatus } from "../../lib/collaboration";
import type { TripFile } from "../../lib/packing-documents";
import { overviewTrip } from "./trip-overview";
const trip = {
  ...overviewTrip,
  name: "A spring escape",
  shared: false,
  lifecycle: "upcoming" as const,
};
const file = {
  id: "file",
  trip_id: trip.id,
  owner_id: "owner",
  filename: "Train tickets.pdf",
  content_type: "application/pdf",
  size: 10,
  created_at: "2026-11-01",
  state: "ready",
  document_kind: "trip",
  document_category: "Tickets",
  document_revision: 0,
} as TripFile;
function Fixture() {
  const mode = new URL(location.href).searchParams.get("mode") || "owner";
  const [data, setData] = useState<SharingData>({
    ready: mode !== "unavailable",
    tripId: trip.id,
    tripName: trip.name,
    owner: mode !== "editor",
    userId: "owner",
    members: [
      {
        id: "member",
        label: "friend@example.com",
        member_revision: 0,
        role: "editor",
      },
    ],
    pending: [
      {
        id: "pending",
        email: "pending@example.com",
        expires_at: "2027-01-01T00:00:00Z",
      },
    ],
  });
  const saved = useRef(data);
  const commit = (next: SharingData) => {
    saved.current = next;
    setData(next);
  };
  const [revision, setRevision] = useState(0);
  const [scope, setScope] = useState<"private" | "shared">("private");
  const status = mode.replace("invite-", "") as InvitationStatus;
  return (
    <AppShellView
      trips={[trip]}
      activeTrip={trip}
      pathname="/trips"
      view="hub"
      day={null}
      accountMenu={<span>Isolated collaboration fixture</span>}
    >
      {mode.startsWith("invite-") ? (
        <InvitationExperience
          initialStatus={status}
          tripName={status === "valid" ? trip.name : undefined}
          userId="editor"
          signInHref="/login?next=%2Finvites%2Fexample"
          accountAction={
            <button className="button">Use a different account</button>
          }
          respond={async (decision) => ({
            status: decision === "accept" ? "accepted" : "declined",
            ...(decision === "accept" ? { tripId: trip.id } : {}),
          })}
        />
      ) : (
        <>
          <header className="overview-header">
            <h1>{trip.name}</h1>
            <p>Paris · 1–10 May 2027</p>
            <ShareTripPanel
              data={data}
              onRefresh={() => {}}
              invite={async (f) => {
                const email = String(f.get("email"));
                if (saved.current.pending.some((p) => p.email === email))
                  return {
                    error:
                      "An invitation is already pending. Cancel it before creating another.",
                  };
                commit({
                  ...saved.current,
                  pending: [
                    ...saved.current.pending,
                    {
                      id: crypto.randomUUID(),
                      email,
                      expires_at: "2027-01-01",
                    },
                  ],
                });
                return { url: "/invites/" + "a".repeat(64) };
              }}
              manage={async (f) => {
                const d = saved.current;
                commit({
                  ...d,
                  members:
                    f.get("operation") === "remove"
                      ? d.members.filter((m) => m.id !== f.get("id"))
                      : d.members,
                  pending:
                    f.get("operation") === "revoke"
                      ? d.pending.filter((i) => i.id !== f.get("id"))
                      : d.pending,
                });
                return {};
              }}
            />
          </header>
          <InvitationInbox
            initialInvitations={[
              {
                id: "inbox",
                trip_name: "A shared weekend",
                role: "editor",
                expires_at: "2027-01-01",
              },
            ]}
            userId="editor"
            onRefresh={() => {}}
            respond={async (_id, decision) => ({
              status: decision === "accept" ? "accepted" : "declined",
              ...(decision === "accept" ? { tripId: trip.id } : {}),
            })}
          />
          <section className="invitation-inbox">
            <h2>Your documents</h2>
            <article>
              <h3>Train tickets</h3>
              <FilePrivacyControl
                key={revision}
                file={{
                  ...file,
                  file_scope: scope,
                  document_revision: revision,
                }}
                tripId={trip.id}
                userId="owner"
                canEdit
                ready={data.ready}
                request={async (f) => {
                  setScope(f.get("scope") as "private" | "shared");
                  setRevision((r) => r + 1);
                  return {};
                }}
              />
            </article>
            <article>
              <h3>Passport</h3>
              <FilePrivacyControl
                file={{
                  ...file,
                  id: "passport",
                  document_category: "Passport & ID",
                }}
                tripId={trip.id}
                userId="owner"
                canEdit
                ready={data.ready}
              />
            </article>
          </section>
        </>
      )}
    </AppShellView>
  );
}
createRoot(document.getElementById("fixture-root")!).render(<Fixture />);
