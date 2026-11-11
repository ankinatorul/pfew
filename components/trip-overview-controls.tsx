"use client";
import { useFormStatus } from "react-dom";
import { decideFinding } from "../app/intelligence-actions";
import { useOnline } from "./essentials/online";
import { Button } from "./button";

function DismissSubmit({ title }: { title: string }) {
  const { pending } = useFormStatus();
  const online = useOnline();
  return (
    <Button
      variant="secondary"
      disabled={pending || !online}
      aria-label={"Dismiss suggestion: " + title}
    >
      {pending ? "Saving…" : "Dismiss"}
    </Button>
  );
}
export function FindingDismiss({
  tripId,
  findingId,
  title,
}: {
  tripId: string;
  findingId: string;
  title: string;
}) {
  return (
    <form action={decideFinding}>
      <input type="hidden" name="trip_id" value={tripId} />
      <input type="hidden" name="finding_id" value={findingId} />
      <input type="hidden" name="decision" value="dismissed" />
      <DismissSubmit title={title} />
    </form>
  );
}
