import { it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  refresh: vi.fn(),
  access: vi.fn(),
}));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(url);
  },
}));
import {
  createInvitation,
  respondInvitation,
  removeCollaborator,
  setDocumentSharing,
} from "../app/collaboration-actions";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({
    db: { rpc: mocks.rpc },
    user: { id: "owner" },
  });
  mocks.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "collaboration_version"
        ? 1
        : "11111111-1111-4111-8111-111111111111",
    error: null,
  }));
});
const trip = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222";
it("enables or resets the owner’s stable trip link through a revision-protected RPC", async () => {
  const form = new FormData();
  form.set("trip_id", trip);
  form.set("revision", "2");
  form.set("operation", "reset");
  mocks.rpc.mockResolvedValue({
    data: { enabled: true, revision: 3, secret: "a".repeat(64) },
    error: null,
  });
  const result = await createInvitation({}, form);
  expect(result.url).toBe("/join/" + "a".repeat(64));
  expect(mocks.rpc).toHaveBeenCalledWith("manage_trip_share_link", {
    target: trip,
    operation: "reset",
    expected_revision: 2,
    candidate: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty("recipient");
});
it("hashes the reusable bearer secret when explicitly joining and reports failures", async () => {
  const { joinSharedTrip } = await import("../app/collaboration-actions");
  const form = new FormData();
  form.set("token", "b".repeat(64));
  expect(await joinSharedTrip(form)).toEqual({
    status: "accepted",
    tripId: trip,
  });
  expect(mocks.rpc).toHaveBeenCalledWith("join_trip_share_link", {
    link_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(mocks.rpc.mock.calls[0][1].link_hash).not.toBe("b".repeat(64));
  mocks.rpc.mockResolvedValue({ error: { message: "disabled" } });
  expect((await joinSharedTrip(form)).error).toContain("current sharing link");
});
it("fails closed for absent infrastructure and does not pretend an invitation/email was created", async () => {
  mocks.rpc.mockResolvedValue({
    error: { code: "PGRST202", message: "Unavailable" },
  });
  const form = new FormData();
  form.set("trip_id", trip);
  const result = await createInvitation({}, form);
  expect(result.url).toBeUndefined();
  expect(result.error).toMatch(/not available|aren’t available/);
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("passes identity-bound in-app decisions, owner revocations and optimistic revisions through authorized RPCs", async () => {
  const form = new FormData();
  form.set("id", id);
  form.set("decision", "decline");
  await expect(respondInvitation(form)).rejects.toThrow();
  expect(mocks.rpc).toHaveBeenCalledWith("respond_trip_invitation", {
    invitation_id: id,
    accept: false,
  });
  form.set("trip_id", trip);
  form.set("table", "trip_members");
  form.set("revision", "3");
  await removeCollaborator(form);
  expect(mocks.rpc).toHaveBeenCalledWith("manage_trip_member", {
    target: trip,
    member: id,
    expected_revision: 3,
    remove: true,
  });
  form.set("scope", "shared");
  await setDocumentSharing(form);
  expect(mocks.rpc).toHaveBeenCalledWith("set_trip_file_scope", {
    target: trip,
    document: id,
    expected_revision: 3,
    scope: "shared",
  });
});
it("recipient acceptance returns success without redirect and hashes the link token", async () => {
  const { respondInvitationState } =
    await import("../app/collaboration-actions");
  const form = new FormData();
  form.set("token", "a".repeat(64));
  form.set("decision", "accept");
  expect(await respondInvitationState(form)).toEqual({
    status: "accepted",
    tripId: trip,
  });
  expect(mocks.rpc).toHaveBeenCalledWith("accept_trip_invitation", {
    invite_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(
    mocks.rpc.mock.calls.find((c) => c[0] === "accept_trip_invitation")?.[1]
      .invite_hash,
  ).not.toBe("a".repeat(64));
});
it("missing infrastructure and wrong-account RPC failures do not acknowledge acceptance", async () => {
  const { respondInvitationState } =
    await import("../app/collaboration-actions");
  const form = new FormData();
  form.set("id", id);
  form.set("decision", "accept");
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
  expect((await respondInvitationState(form)).error).toMatch(
    /not available|aren’t available/,
  );
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  mocks.rpc.mockImplementation(async (name: string) =>
    name === "collaboration_version"
      ? { data: 1, error: null }
      : { data: null, error: { message: "unavailable" } },
  );
  expect((await respondInvitationState(form)).error).toContain("new link");
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("stale file revisions return friendly inline failures without weakening the operation", async () => {
  const { manageSharing } = await import("../app/collaboration-actions");
  const form = new FormData();
  form.set("trip_id", trip);
  form.set("id", id);
  form.set("operation", "scope");
  form.set("scope", "shared");
  form.set("revision", "4");
  mocks.rpc.mockResolvedValue({ error: { message: "Document changed" } });
  expect((await manageSharing(form)).error).toContain("another tab");
  expect(mocks.refresh).not.toHaveBeenCalled();
});
