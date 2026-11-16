// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareTripPanel } from "../components/share-trip-panel";
import {
  InvitationExperience,
  InvitationInbox,
} from "../components/invitation-experience";
import { FilePrivacyControl } from "../components/file-privacy-control";
import type { SharingData, CollaborationReply } from "../lib/collaboration";
import type { TripFile } from "../lib/packing-documents";
const tripId = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222";
const data: SharingData = {
  tripId,
  tripName: "Spring escape",
  userId: "owner",
  owner: true,
  ready: true,
  linkReady: true,
  members: [{ id, label: "editor@example.com", member_revision: 3 }],
  pending: [{ id, kind: "link", expires_at: "2027-01-01T00:00:00Z" }],
};
const file = {
  id,
  trip_id: tripId,
  owner_id: "owner",
  filename: "ticket.pdf",
  content_type: "application/pdf",
  size: 10,
  created_at: "2026-11-01",
  state: "ready",
  document_kind: "trip",
  document_category: "Tickets",
  document_revision: 4,
} as TripFile;
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("owner creates and copies an invitation without claiming email delivery or exposing hashes", async () => {
  const user = userEvent.setup(),
    invite = vi
      .fn()
      .mockResolvedValue({
        url: "/join/" + "a".repeat(64),
        enabled: true,
        revision: 1,
      }),
    refresh = vi.fn();
  const clipboard = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue();
  render(
    <ShareTripPanel
      data={data}
      invite={invite}
      manage={vi.fn()}
      onRefresh={refresh}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Share" }));
  expect(screen.queryByLabelText("Email address")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Enable sharing" }));
  expect(invite).toHaveBeenCalledOnce();
  expect(invite.mock.calls[0][0].has("email")).toBe(false);
  await user.click(screen.getByRole("button", { name: "Copy link" }));
  expect(clipboard).toHaveBeenCalledWith(
    expect.stringContaining("/join/" + "a".repeat(64)),
  );
  expect(screen.queryByText(/Pending invitations/)).toBeNull();
  expect(
    (screen.getByLabelText("Sharing URL") as HTMLInputElement).value,
  ).toContain("/join/");
  expect(screen.getByRole("button", { name: "Copied!" })).toBeTruthy();
  expect(refresh).toHaveBeenCalled();
  await user.click(screen.getByLabelText("Close sharing"));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("confirms removal and warns about rejoining; reset and disable carry current link revision", async () => {
  const user = userEvent.setup(),
    manage = vi.fn().mockResolvedValue({}),
    invite = vi.fn().mockResolvedValue({ enabled: false, revision: 3 });
  render(
    <ShareTripPanel
      data={{
        ...data,
        sharingLink: {
          enabled: true,
          revision: 2,
          url: "/join/" + "a".repeat(64),
        },
      }}
      defaultOpen
      invite={invite}
      manage={manage}
      onRefresh={vi.fn()}
    />,
  );
  expect(screen.queryByText(/Pending invitations/)).toBeNull();
  await user.click(screen.getByRole("button", { name: "Remove collaborator" }));
  expect(manage.mock.calls[0][0].get("revision")).toBe("3");
  expect(vi.mocked(window.confirm).mock.calls[0][0]).toContain("rejoin");
  await user.click(screen.getByRole("button", { name: "Disable sharing" }));
  expect(invite.mock.calls[0][0].get("operation")).toBe("disable");
  expect(invite.mock.calls[0][0].get("revision")).toBe("2");
  expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
});
it("editors cannot manage membership and unavailable capability offers no mutation controls", () => {
  const props = {
    invite: vi.fn(),
    manage: vi.fn(),
    onRefresh: vi.fn(),
    defaultOpen: true,
  };
  const view = render(
    <ShareTripPanel {...props} data={{ ...data, owner: false }} />,
  );
  expect(screen.queryByLabelText("Email address")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Remove collaborator" }),
  ).toBeNull();
  view.rerender(<ShareTripPanel {...props} data={{ ...data, ready: false }} />);
  expect(screen.getByText("Sharing isn’t available yet")).toBeTruthy();
  expect(screen.queryByLabelText("Email address")).toBeNull();
});
it("acceptance has an explicit success and Open action, with duplicate-click protection and active-trip selection", async () => {
  let finish!: (r: CollaborationReply) => void;
  const respond = vi.fn(
    () =>
      new Promise<CollaborationReply>((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <InvitationExperience
      initialStatus="valid"
      tripName="Spring escape"
      userId="editor"
      respond={respond}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Join trip" }));
  fireEvent.click(screen.getByRole("button", { name: "Saving…" }));
  expect(respond).toHaveBeenCalledOnce();
  finish({ status: "accepted", tripId });
  await screen.findByText("You’re in!");
  const link = screen.getByRole("link", { name: "Open trip" });
  expect(link.getAttribute("href")).toBe("/trips/" + tripId);
  link.addEventListener("click", (e) => e.preventDefault());
  fireEvent.click(link);
  expect(localStorage.getItem("pfew:active-trip:editor")).toBe(tripId);
});
it.each([
  "wrong_account",
  "invalid",
  "expired",
  "revoked",
  "declined",
  "signed_out",
  "unavailable",
] as const)(
  "%s does not show trip details or acceptance controls",
  (initialStatus) => {
    render(
      <InvitationExperience
        initialStatus={initialStatus}
        userId="editor"
        respond={vi.fn()}
        signInHref="/login?next=%2Finvites%2Fx"
      />,
    );
    expect(screen.queryByRole("button", { name: "Join trip" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open trip" })).toBeNull();
  },
);
it("a failed response keeps invitation recoverable and inbox accepts/declines without an empty section", async () => {
  const user = userEvent.setup(),
    respond = vi
      .fn()
      .mockResolvedValueOnce({ error: "Check your email and retry." })
      .mockResolvedValue({ status: "declined" });
  const view = render(
    <InvitationInbox
      initialInvitations={[]}
      userId="editor"
      respond={respond}
      onRefresh={vi.fn()}
    />,
  );
  expect(screen.queryByRole("region")).toBeNull();
  view.rerender(
    <InvitationInbox
      initialInvitations={[
        {
          id,
          trip_name: "Spring escape",
          role: "editor",
          expires_at: "2027-01-01",
        },
      ]}
      userId="editor"
      respond={respond}
      onRefresh={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Accept" }));
  expect(screen.getByRole("alert").textContent).toContain("Check your email");
  expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Decline" }));
  await screen.findByText("Invitation declined.");
  await user.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByRole("region")).toBeNull();
});
it("document sharing requires uploader confirmation and revision, preserves private state after errors", async () => {
  const user = userEvent.setup(),
    request = vi
      .fn()
      .mockResolvedValueOnce({ error: "This changed. Refresh." })
      .mockResolvedValue({});
  render(
    <FilePrivacyControl
      file={file}
      tripId={tripId}
      userId="owner"
      canEdit
      ready
      request={request}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Share with trip" }));
  expect(screen.getByRole("alert").textContent).toContain("Refresh");
  expect(screen.getByText("Private")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Share with trip" }));
  await screen.findByText("Shared with trip");
  expect(request.mock.calls[0][0].get("revision")).toBe("4");
  expect(request.mock.calls[0][0].get("scope")).toBe("shared");
  await user.click(screen.getByRole("button", { name: "Make private" }));
  await waitFor(() => expect(screen.getByText("Private")).toBeTruthy());
});
it("Passport & ID and other uploaders never offer sharing controls; missing migration disables eligible controls", () => {
  const props = {
    tripId,
    userId: "owner",
    canEdit: true,
    ready: true,
    request: vi.fn(),
  };
  const view = render(
    <FilePrivacyControl
      {...props}
      file={{ ...file, document_category: "Passport & ID" }}
    />,
  );
  expect(screen.queryByRole("button")).toBeNull();
  view.rerender(
    <FilePrivacyControl
      {...props}
      file={{ ...file, owner_id: "someoneelse" }}
    />,
  );
  expect(screen.queryByRole("button")).toBeNull();
  view.rerender(<FilePrivacyControl {...props} ready={false} file={file} />);
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
});
it("accepted inbox retains Open trip after the server removes the pending invitation on refresh", async () => {
  const user = userEvent.setup(),
    respond = vi.fn().mockResolvedValue({ status: "accepted", tripId }),
    onRefresh = vi.fn();
  const view = render(
    <InvitationInbox
      initialInvitations={[
        {
          id,
          trip_name: "Spring escape",
          role: "editor",
          expires_at: "2027-01-01",
        },
      ]}
      userId="editor"
      respond={respond}
      onRefresh={onRefresh}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Accept" }));
  await screen.findByRole("link", { name: "Open trip" });
  view.rerender(
    <InvitationInbox
      initialInvitations={[]}
      userId="editor"
      respond={respond}
      onRefresh={onRefresh}
    />,
  );
  expect(
    screen.getByRole("link", { name: "Open trip" }).getAttribute("href"),
  ).toBe("/trips/" + tripId);
  expect(onRefresh).toHaveBeenCalledOnce();
});

it("unapplied reusable-link migration offers no mutation or pending invitations", () => {
  const invite = vi.fn();
  render(
    <ShareTripPanel
      data={{ ...data, linkReady: false }}
      defaultOpen
      invite={invite}
      manage={vi.fn()}
      onRefresh={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: "Enable sharing" })).toBeNull();
  expect(screen.queryByText(/Pending invitations/)).toBeNull();
  expect(screen.queryByLabelText("Email address")).toBeNull();
  expect(screen.getByText("Sharing links aren’t available yet.")).toBeTruthy();
});
it("link-based previews join only after a click and Not now never consumes an invitation", async () => {
  const user = userEvent.setup(),
    respond = vi.fn().mockResolvedValue({ status: "accepted", tripId });
  render(
    <InvitationExperience
      initialStatus="valid"
      linkBased
      tripName="Shared trip"
      userId="editor"
      respond={respond}
    />,
  );
  expect(respond).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
  expect(screen.getByRole("link", { name: "Not now" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Join trip" }));
  expect(respond).toHaveBeenCalledWith("accept");
  await screen.findByText("You’re in!");
});
it("another account sees used-link recovery without member or trip details", () => {
  render(
    <InvitationExperience
      initialStatus="used"
      userId="editor"
      respond={vi.fn()}
    />,
  );
  expect(
    screen.getByText("This invitation has already been used"),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Join trip" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Open trip" })).toBeNull();
});
