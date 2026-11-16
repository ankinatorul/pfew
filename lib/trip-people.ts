import { z } from "zod";
import { accountProfile } from "./account-profile";
import type { TripPerson } from "./collaboration";
const rows = z.array(
  z.object({
    user_id: z.string().min(1).max(128),
    membership_id: z.string().min(1).max(128).nullable(),
    role: z.enum(["owner", "editor", "viewer"]),
    name: z.string().max(120).nullable(),
    email: z.string().email().max(320).nullable(),
    avatar_url: z.string().max(2048).nullable(),
  }),
);
export function parseTripPeople(value: unknown): TripPerson[] | null {
  const parsed = rows.safeParse(value);
  if (!parsed.success) return null;
  if (
    parsed.data.filter((p) => p.role === "owner").length !== 1 ||
    new Set(parsed.data.map((p) => p.user_id)).size !== parsed.data.length
  )
    return null;
  return parsed.data.map((p) => ({
    userId: p.user_id,
    membershipId: p.membership_id,
    role: p.role,
    ...accountProfile({
      email: p.email || undefined,
      identities: [],
      user_metadata: { name: p.name, avatar_url: p.avatar_url },
    }),
    ...(!p.name && !p.email
      ? {
          name: p.role === "owner" ? "Trip owner" : "Collaborator",
          initials: "?",
        }
      : {}),
  }));
}
