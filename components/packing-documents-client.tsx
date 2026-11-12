"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PackingManager, type PackingProps } from "./packing-manager";
import { DocumentManager, type DocumentsProps } from "./document-manager";
import { ReadinessReminders } from "./readiness-reminders";
import { changePacking, changeReminder } from "../app/packing-document-actions";
import type { ReadinessTask } from "../lib/packing-documents";
export function PackingClient(props: PackingProps) {
  const router = useRouter();
  return (
    <PackingManager
      {...props}
      LinkComponent={Link}
      mutate={async (command) => {
        const r = await changePacking(props.trip.id, command);
        if (!r.error) router.refresh();
        return r;
      }}
    />
  );
}
export function DocumentsClient(props: DocumentsProps) {
  const router = useRouter();
  return (
    <DocumentManager
      {...props}
      LinkComponent={Link}
      onRefresh={() => router.refresh()}
    />
  );
}
export function ReminderClient(props: {
  tripId: string;
  tasks: ReadinessTask[];
  topic: "packing" | "documents";
  today: string;
  allowed: boolean;
}) {
  const router = useRouter();
  return (
    <ReadinessReminders
      {...props}
      save={async (input, remove) => {
        const r = await changeReminder(props.tripId, input, remove);
        if (!r.error) router.refresh();
        return r;
      }}
    />
  );
}
