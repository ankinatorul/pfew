import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { AppShellView } from "../../components/app-shell-view";
import {
  TripBasicsForm,
  DraftChoices,
  CreationProgress,
} from "../../components/trip-basics";
import type {
  PrivateDraft,
  TripBasics,
  DraftSaveResult,
} from "../../lib/trip-drafts";
const key = "fixture:private-trip-drafts";
const userId = "isolated-browser-owner";
const freshId = "11111111-1111-4111-8111-111111111111";
const nextId = "22222222-2222-4222-8222-222222222222";
const read = (): PrivateDraft[] =>
  JSON.parse(localStorage.getItem(key) || "[]");
function Fixture() {
  const query = new URLSearchParams(window.location.search);
  const id = query.get("draft") || query.get("new") || freshId;
  const [draft, setDraft] = useState(() => read().find((row) => row.id === id));
  const [handoff, setHandoff] = useState(
    Boolean(query.get("draft") && query.get("step") !== "1"),
  );
  const save = async (
    id: string,
    revision: number,
    input: unknown,
  ): Promise<DraftSaveResult> => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (query.get("fail") === "1")
      return { error: "Your draft could not be saved. Try again." };
    const rows = read();
    const existing = rows.find((row) => row.id === id);
    if (existing && existing.draft_revision !== revision)
      return { error: "This draft changed in another tab." };
    const basics = input as TripBasics;
    const row = {
      id,
      name: basics.name,
      start_date: basics.start_date,
      end_date: basics.end_date,
      draft_data: { destinations: basics.destinations },
      draft_step: 2,
      draft_revision: revision + 1,
      updated_at: new Date().toISOString(),
    };
    localStorage.setItem(
      key,
      JSON.stringify([...rows.filter((item) => item.id !== id), row]),
    );
    return { draft: row };
  };
  return (
    <AppShellView
      trips={[]}
      activeTrip={null}
      pathname="/trips/new"
      view="hub"
      day={null}
      accountMenu={<span>Isolated test</span>}
    >
      <section className="create-trip">
        {query.get("choices") === "1" ? (
          <DraftChoices userId={userId} drafts={read()} newId={nextId} />
        ) : handoff && draft ? (
          <>
            <CreationProgress step={2} />
            <h1>Your basics are safely saved.</h1>
            <p>{draft.name}</p>
            <button onClick={() => setHandoff(false)}>Edit trip basics</button>
          </>
        ) : (
          <TripBasicsForm
            key={id}
            userId={userId}
            id={id}
            draft={draft}
            ready
            save={save}
            onSaved={(saved) => {
              setDraft(saved);
              setHandoff(true);
            }}
          />
        )}
      </section>
    </AppShellView>
  );
}
createRoot(document.getElementById("fixture-root")!).render(<Fixture />);
