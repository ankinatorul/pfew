"use client";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { TripBasicsForm, DraftChoices } from "./trip-basics";
import { saveTripDraft } from "../app/trip-draft-actions";
import { localBasicsList, subscribeLocalBasics } from "../lib/trip-draft-cache";
import type { PrivateDraft } from "../lib/trip-drafts";
type Props = {
  userId: string;
  id: string;
  draft?: PrivateDraft;
  drafts: PrivateDraft[];
  ready: boolean;
  explicit: boolean;
};
export function CreateTrip(props: Props) {
  const hydrated = useSyncExternalStore(
    subscribeLocalBasics,
    () => true,
    () => false,
  );
  if (!hydrated) return <p role="status">Opening your travel space…</p>;
  return <CreateTripContent {...props} />;
}
function CreateTripContent(props: Props) {
  const router = useRouter();
  const [choose] = useState(
    () =>
      !props.explicit &&
      (props.drafts.length > 0 ||
        JSON.parse(localBasicsList(props.userId)).length > 0),
  );
  if (choose)
    return (
      <DraftChoices
        userId={props.userId}
        drafts={props.drafts}
        newId={props.id}
      />
    );
  return (
    <TripBasicsForm
      {...props}
      save={saveTripDraft}
      onSaved={(draft) => {
        router.push(`/trips/new?draft=${draft.id}`);
        router.refresh();
      }}
    />
  );
}
