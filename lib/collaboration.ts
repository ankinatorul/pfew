import type { AccountProfile } from "./account-profile";
export type InvitationStatus =
  | "valid"
  | "accepted"
  | "declined"
  | "expired"
  | "revoked"
  | "wrong_account"
  | "invalid"
  | "unavailable"
  | "signed_out"
  | "used"
  | "already_member";
export type InvitationSummary = {
  id: string;
  trip_name: string;
  role: string;
  expires_at: string;
};
export type SharedMember = {
  role?: "editor" | "viewer";
  id: string;
  label: string;
  member_revision: number;
  self?: boolean;
};
export type PendingInvite = {
  id: string;
  kind?: "email" | "link";
  expires_at: string;
};
export type TripPerson = AccountProfile & {
  userId: string;
  membershipId: string | null;
  role: "owner" | "editor" | "viewer";
};
export type SharingData = {
  people?: TripPerson[];
  peopleReady?: boolean;
  ready: boolean;
  linkReady?: boolean;
  sharingLink?: { enabled: boolean; revision: number; url?: string };
  error?: string;
  tripId: string;
  tripName: string;
  owner: boolean;
  userId: string;
  members: SharedMember[];
  pending: PendingInvite[];
};
export type CollaborationReply = {
  error?: string;
  tripId?: string;
  status?: "accepted" | "declined";
  message?: string;
};
