"use client";
import { useRouter } from "next/navigation";
import { createInvitation, manageSharing } from "../app/collaboration-actions";
import type { SharingData } from "../lib/collaboration";
import { ShareTripPanel } from "./share-trip-panel";
export function ShareTripClient({
  data,
  defaultOpen,
}: {
  data: SharingData;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  return (
    <ShareTripPanel
      data={data}
      defaultOpen={defaultOpen}
      invite={(form) => createInvitation({}, form)}
      manage={manageSharing}
      onRefresh={() => router.refresh()}
    />
  );
}
