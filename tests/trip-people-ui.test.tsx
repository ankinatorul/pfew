// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripPeople } from "../components/trip-people";
import { InvitationLink } from "../components/invitation-link";
import { parseTripPeople } from "../lib/trip-people";
import type { TripPerson } from "../lib/collaboration";
const people: TripPerson[] = [
  {
    userId: "owner",
    membershipId: null,
    role: "owner",
    name: "Anna",
    email: "anna@example.com",
    avatarUrl: null,
    initials: "A",
  },
  {
    userId: "editor",
    membershipId: "member",
    role: "editor",
    name: "Mark",
    email: "current@example.com",
    avatarUrl: null,
    initials: "M",
  },
];
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
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("shared people are one accessible target; owner sees current identity and Manage sharing", async () => {
  const user = userEvent.setup(),
    manage = vi.fn();
  render(<TripPeople people={people} owner onManage={manage} />);
  const trigger = screen.getByRole("button", { name: /Shared with 1/ });
  await user.click(trigger);
  expect(
    screen.getByRole("dialog", { name: "People on this trip" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "current@example.com" }),
  ).toBeTruthy();
  expect(screen.getByText("Owner")).toBeTruthy();
  expect(screen.getByText("Editor")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Manage sharing" }));
  expect(manage).toHaveBeenCalledWith(trigger);
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("editors see no management controls, solo trips are hidden and removed people disappear on rerender", async () => {
  const user = userEvent.setup();
  const view = render(
    <TripPeople people={people} owner={false} onManage={vi.fn()} />,
  );
  await user.click(screen.getByRole("button", { name: /Shared with 1/ }));
  expect(screen.queryByRole("button", { name: "Manage sharing" })).toBeNull();
  view.rerender(
    <TripPeople people={[people[0]]} owner={false} onManage={vi.fn()} />,
  );
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("shows at most three avatars plus the correct extra count", () => {
  render(
    <TripPeople
      people={[
        ...people,
        ...Array.from({ length: 4 }, (_, i) => ({
          ...people[1],
          userId: "other" + i,
        })),
      ]}
      owner
      onManage={vi.fn()}
    />,
  );
  expect(
    document.querySelectorAll(".trip-people-avatars .account-avatar"),
  ).toHaveLength(3);
  expect(screen.getByText("+3")).toBeTruthy();
  expect(screen.getByText("6 people")).toBeTruthy();
});
it("copy success appears only after acknowledgement, resets at two seconds and does not change button width class", async () => {
  vi.useFakeTimers();
  let resolve!: () => void;
  const write = vi.fn(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: write },
  });
  render(<InvitationLink url="https://pfew.example/invites/token" />);
  const button = screen.getByRole("button", { name: "Copy link" });
  fireEvent.click(button);
  expect(screen.queryByRole("button", { name: "Copied!" })).toBeNull();
  await act(async () => resolve());
  expect(screen.getByRole("button", { name: "Copied!" }).className).toContain(
    "sharing-copy",
  );
  expect(screen.getByRole("status").textContent).toContain("copied");
  act(() => {
    vi.advanceTimersByTime(1999);
  });
  expect(screen.getByRole("button", { name: "Copied!" })).toBeTruthy();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
});
it("clipboard failure never shows Copied and focuses a selectable read-only URL", async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
    new Error("denied"),
  );
  render(<InvitationLink url="https://pfew.example/invites/token" />);
  await user.click(screen.getByRole("button", { name: "Copy link" }));
  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "Copied!" })).toBeNull();
  const input = screen.getByLabelText("Invitation URL") as HTMLInputElement;
  expect(document.activeElement).toBe(input);
  expect(input.readOnly).toBe(true);
  expect(input.selectionEnd).toBe(input.value.length);
});
it("uses friendly email initials, filters untrusted photo URLs and never treats IDs as display names", () => {
  const value = [
    {
      user_id: "private-id",
      membership_id: null,
      role: "owner",
      name: null,
      email: "anna@example.com",
      avatar_url: "https://evil.example/pixel",
    },
    {
      user_id: "editor-id",
      membership_id: "membership-id",
      role: "editor",
      name: "Mark Smith",
      email: "current@example.com",
      avatar_url: "https://lh3.googleusercontent.com/photo",
    },
  ];
  const parsed = parseTripPeople(value)!;
  expect(parsed[0].name).toBe("anna");
  expect(parsed[0].initials).toBe("A");
  expect(parsed[0].avatarUrl).toBeNull();
  expect(parsed[1].initials).toBe("MS");
  expect(parsed[1].avatarUrl).toContain("googleusercontent.com");
  expect(parseTripPeople([])).toBeNull();
});
