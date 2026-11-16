"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { respondInvitationState } from "../app/collaboration-actions";
import { InvitationExperience, InvitationInbox } from "./invitation-experience";
import type { InvitationSummary } from "../lib/collaboration";
export function InvitationClient({
  token,
  ...props
}: Omit<ComponentProps<typeof InvitationExperience>, "respond"> & {
  token: string;
}) {
  const router = useRouter();
  return (
    <InvitationExperience
      {...props}
      LinkComponent={Link}
      respond={async (decision) => {
        const form = new FormData();
        form.set("token", token);
        form.set("decision", decision);
        const result = await respondInvitationState(form);
        if (!result.error) router.refresh();
        return result;
      }}
    />
  );
}
export function InvitationInboxClient({
  invitations,
  userId,
}: {
  invitations: InvitationSummary[];
  userId: string;
}) {
  const router = useRouter();
  return (
    <InvitationInbox
      initialInvitations={invitations}
      userId={userId}
      onRefresh={() => router.refresh()}
      respond={(id, decision) => {
        const form = new FormData();
        form.set("id", id);
        form.set("decision", decision);
        return respondInvitationState(form);
      }}
    />
  );
}
