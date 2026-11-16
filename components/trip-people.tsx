"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { TripPerson } from "../lib/collaboration";
import { AccountAvatar } from "./account-avatar";
import { BookingDrawer } from "./booking-drawer";
export function PersonDetails({
  person,
  showEmail = true,
}: {
  person: TripPerson;
  showEmail?: boolean;
}) {
  return (
    <div className="trip-person">
      <AccountAvatar key={person.avatarUrl} profile={person} />
      <div className="trip-person-identity">
        <strong>{person.name}</strong>
        {showEmail && person.email && (
          <a href={"mailto:" + person.email}>{person.email}</a>
        )}
        <span className="sharing-tag">
          {person.role === "owner"
            ? "Owner"
            : person.role === "viewer"
              ? "Viewer"
              : "Editor"}
        </span>
      </div>
    </div>
  );
}
export function TripPeople({
  people,
  owner,
  onManage,
}: {
  people: TripPerson[];
  owner: boolean;
  onManage: (opener: HTMLElement) => void;
}) {
  const [open, setOpen] = useState(false),
    [opener, setOpener] = useState<HTMLElement | null>(null);
  if (people.length < 2) return null;
  return (
    <>
      <button
        type="button"
        className="trip-people-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Shared with ${people.length - 1} ${people.length === 2 ? "other person" : "other people"}. View people on this trip`}
        onClick={(e) => {
          setOpener(e.currentTarget);
          setOpen(true);
        }}
      >
        <span className="trip-people-avatars" aria-hidden="true">
          {people.slice(0, 3).map((person) => (
            <AccountAvatar
              key={person.userId + person.avatarUrl}
              profile={person}
            />
          ))}
          {people.length > 3 && (
            <span className="trip-people-extra">+{people.length - 3}</span>
          )}
        </span>
        <span className="trip-people-label">
          <small>Shared with</small>
          <strong>{people.length} people</strong>
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <BookingDrawer
          presentation="people"
          title="People on this trip"
          closeLabel="Close people"
          initialFocus="button"
          busy={false}
          onClose={() => setOpen(false)}
          returnFocus={opener}
        >
          <div className="trip-people-body">
            {people.map((person) => (
              <PersonDetails key={person.userId} person={person} />
            ))}
            {owner && (
              <button
                type="button"
                className="button trip-people-manage"
                onClick={() => {
                  setOpen(false);
                  if (opener) onManage(opener);
                }}
              >
                Manage sharing
              </button>
            )}
          </div>
        </BookingDrawer>
      )}
    </>
  );
}
