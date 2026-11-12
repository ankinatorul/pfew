import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { AppShellView } from "../../components/app-shell-view";
import { PackingManager } from "../../components/packing-manager";
import { DocumentManager } from "../../components/document-manager";
import { ReadinessReminders } from "../../components/readiness-reminders";
import { PackingSuggestions } from "../../components/readiness-suggestions";
import { overviewTrip, overviewTask } from "./trip-overview";
import { validFileType, MAX_FILE_SIZE } from "../../lib/files";
import { normalizedTitle } from "../../lib/readiness";
import type { Trip } from "../../lib/domain";
import type {
  ManagedPackingItem,
  ManagedPackingList,
  TripFile,
  ReadinessTask,
  PackingCommand,
} from "../../lib/packing-documents";
const trip: Trip = {
    ...overviewTrip,
    name: "A little spring escape",
    theme: "Tropical",
  },
  list = "44444444-4444-4444-8444-444444444444",
  source = "77777777-7777-4777-8777-777777777777";
type Store = {
  lists: ManagedPackingList[];
  items: ManagedPackingItem[];
  files: TripFile[];
  tasks: ReadinessTask[];
};
const initial: Store = {
  lists: [
    { id: list, trip_id: trip.id, traveler: "My list", packing_revision: 0 },
  ],
  items: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      trip_id: trip.id,
      list_id: list,
      title: "Charging cable",
      category: "Electronics",
      quantity: 1,
      packed: false,
      notes: "For my phone",
      packing_revision: 0,
      position: 0,
    },
    {
      id: "66666666-6666-4666-8666-666666666666",
      trip_id: trip.id,
      list_id: list,
      title: "Everyday clothing",
      category: "Clothing",
      quantity: 3,
      packed: true,
      notes: "",
      packing_revision: 0,
      position: 1,
    },
  ],
  files: [
    {
      id: "88888888-8888-4888-8888-888888888888",
      trip_id: trip.id,
      booking_id: "99999999-9999-4999-8999-999999999999",
      filename: "confirmation.pdf",
      display_name: "Saved flight confirmation",
      content_type: "application/pdf",
      size: 1500,
      created_at: "2026-11-12T10:00:00Z",
      state: "ready",
      document_kind: "booking",
      document_category: "Tickets",
      document_revision: 0,
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      trip_id: trip.id,
      booking_id: null,
      filename: "insurance.pdf",
      display_name: "Travel insurance",
      content_type: "application/pdf",
      size: 2500,
      created_at: "2026-11-12T11:00:00Z",
      state: "ready",
      document_kind: "trip",
      document_category: "Insurance",
      document_revision: 0,
    },
  ],
  tasks: [
    {
      ...overviewTask({ title: "Finish packing", category: "Other" }),
      readiness_revision: 0,
    },
    {
      ...overviewTask({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        title: "Check travel documents",
        category: "Documents",
      }),
      readiness_revision: 0,
    },
  ],
};
function Fixture() {
  const params = new URLSearchParams(location.search),
    mode = params.get("mode") || "normal",
    key = "fixture:readiness:" + mode;
  const [store, setStore] = useState<Store>(
      () =>
        JSON.parse(sessionStorage.getItem(key) || "null") ||
        (mode === "empty"
          ? { lists: [], items: [], files: [], tasks: [] }
          : initial),
    ),
    [view, setView] = useState<"packing" | "documents">("packing"),
    [failed, setFailed] = useState(false);
  const commit = (next: Store) => {
    sessionStorage.setItem(key, JSON.stringify(next));
    setStore(next);
  };
  const Link = ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a
      {...props}
      href={href}
      onClick={(e) => {
        const v = new URL(href, location.origin).searchParams.get("view");
        if (v === "packing" || v === "documents") {
          e.preventDefault();
          setView(v);
        }
      }}
    >
      {children}
    </a>
  );
  async function packing(c: PackingCommand) {
    await new Promise((r) => setTimeout(r, 60));
    if ((mode === "failure" || mode === "toggle-failure") && !failed) {
      setFailed(true);
      return { error: "Not saved. Your input is still here." };
    }
    const next = structuredClone(store);
    if (c.op === "list") {
      next.lists.push({
        id: c.id,
        trip_id: trip.id,
        traveler: c.traveler,
        packing_revision: 0,
      });
      commit(next);
      return { id: c.id, message: "Packing list saved." };
    }
    if (c.op === "save") {
      const old = next.items.find((i) => i.id === c.input.id);
      if (
        next.items.some(
          (i) =>
            i.list_id === c.input.list_id &&
            i.id !== c.input.id &&
            normalizedTitle(i.title) === normalizedTitle(c.input.title),
        )
      )
        return { message: "An item with this name already exists." };
      next.items = next.items
        .filter((i) => i.id !== c.input.id)
        .concat({
          ...c.input,
          trip_id: trip.id,
          packed: old?.packed || false,
          packing_revision: old ? (old.packing_revision || 0) + 1 : 0,
          position: old?.position || next.items.length,
        });
    }
    if (c.op === "packed")
      next.items = next.items.map((i) =>
        i.id === c.id
          ? {
              ...i,
              packed: c.packed,
              packing_revision: (i.packing_revision || 0) + 1,
            }
          : i,
      );
    if (c.op === "delete") next.items = next.items.filter((i) => i.id !== c.id);
    if (c.op === "reorder")
      c.order.forEach((v, index) => {
        const row = next.items.find((i) => i.id === v.id)!;
        row.position = index;
        row.packing_revision = (row.packing_revision || 0) + 1;
      });
    if (c.op === "delete-list") {
      next.lists = next.lists.filter((l) => l.id !== c.id);
      next.items = next.items.filter((i) => i.list_id !== c.id);
    }
    if (c.op === "copy" || c.op === "template") {
      if (
        !next.items.some(
          (i) => i.list_id === c.list_id && i.title === "A copied hat",
        )
      )
        next.items.push({
          id: crypto.randomUUID(),
          trip_id: trip.id,
          list_id: c.list_id,
          title: "A copied hat",
          category: "Accessories",
          quantity: 1,
          packed: false,
          notes: "",
          packing_revision: 0,
        });
    }
    commit(next);
    return { message: "Packing saved." };
  }
  useEffect(() => {
    window.packingFixtureAdd = async (form) => {
      const next = structuredClone(store),
        values = JSON.parse(String(form.get("items"))) as {
          title: string;
          category: string;
          quantity: number;
        }[];
      let added = 0;
      for (const i of values) {
        if (
          !next.items.some(
            (old) =>
              old.list_id === form.get("list_id") &&
              normalizedTitle(old.title) === normalizedTitle(i.title),
          )
        ) {
          next.items.push({
            ...i,
            id: crypto.randomUUID(),
            trip_id: trip.id,
            list_id: String(form.get("list_id")),
            packed: false,
            notes: "",
            packing_revision: 0,
          });
          added++;
        }
      }
      sessionStorage.setItem(key, JSON.stringify(next));
      setStore(next);
      return { added, skipped: values.length - added };
    };
  }, [store, key]);
  const reminders = (
    <ReadinessReminders
      tasks={store.tasks}
      topic={view === "packing" ? "packing" : "documents"}
      today="2027-04-25"
      allowed={mode !== "viewer" && mode !== "pending"}
      save={async (input, remove) => {
        const next = structuredClone(store);
        if (remove) next.tasks = next.tasks.filter((t) => t.id !== input.id);
        else {
          if (
            !next.tasks.some(
              (t) =>
                t.id !== input.id &&
                normalizedTitle(t.title) === normalizedTitle(input.title),
            )
          )
            next.tasks = next.tasks
              .filter((t) => t.id !== input.id)
              .concat({
                ...input,
                trip_id: trip.id,
                due_date: input.due_date || null,
                priority: "normal",
                readiness_revision: input.revision + 1,
              });
        }
        commit(next);
        return { message: "Reminder saved." };
      }}
    />
  );
  const card = { ...trip, shared: false, lifecycle: "upcoming" as const };
  return (
    <AppShellView
      trips={[card]}
      activeTrip={card}
      pathname={"/trips/" + trip.id}
      view={view}
      day={null}
      accountMenu={<span>Isolated readiness fixture</span>}
      LinkComponent={Link}
    >
      {view === "packing" ? (
        <PackingManager
          trip={trip}
          lists={store.lists}
          items={store.items}
          canEdit={mode !== "viewer"}
          ready={mode !== "pending"}
          copySources={[{ id: source, label: "An owned previous list" }]}
          templateSources={[]}
          reminders={reminders}
          mutate={packing}
          LinkComponent={Link}
          suggestions={Object.fromEntries(
            store.lists.map((l) => [
              l.id,
              <PackingSuggestions
                key={l.id}
                tripId={trip.id}
                listId={l.id}
                existing={store.items.filter((i) => i.list_id === l.id)}
                context={{
                  days: 10,
                  destinations: ["A saved destination"],
                  theme: "Tropical",
                  transportModes: [],
                  hasBookings: true,
                }}
                live={false}
              />,
            ]),
          )}
        />
      ) : (
        <DocumentManager
          trip={trip}
          files={store.files}
          bookingNames={{
            "99999999-9999-4999-8999-999999999999": "Saved flight",
          }}
          canEdit={mode !== "viewer"}
          ready={mode !== "pending"}
          reminders={reminders}
          LinkComponent={Link}
          request={async (body) => {
            await new Promise((r) => setTimeout(r, 60));
            const v =
                body instanceof FormData ? Object.fromEntries(body) : body,
              next = structuredClone(store),
              id = String(v.id),
              old = next.files.find((f) => f.id === id);
            if (v.action === "upload") {
              const file = v.file as File;
              if (
                file.size > MAX_FILE_SIZE ||
                !validFileType(
                  new Uint8Array(await file.arrayBuffer()),
                  file.type,
                )
              )
                return { error: "Choose a valid PDF, JPEG or PNG up to 3 MB." };
              const f: TripFile = old || {
                id,
                trip_id: trip.id,
                booking_id: null,
                filename: file.name,
                display_name: String(v.label || file.name),
                content_type: file.type,
                size: file.size,
                state: "pending",
                document_kind: "trip",
                document_category: String(v.category || "Other"),
                document_revision: 0,
                created_at: "2026-11-12T12:00:00Z",
              };
              if (mode === "upload-failure" && !failed) {
                setFailed(true);
                next.files.push(f);
                commit(next);
                return {
                  error:
                    "Original saved. Check saved upload to finish its metadata.",
                };
              }
              f.state = "ready";
              next.files = next.files.filter((x) => x.id !== id).concat(f);
              commit(next);
              return { file: f, message: "Original saved." };
            }
            if (v.action === "recover") {
              if (!old) return { error: "Original unavailable." };
              old.state = "ready";
              commit(next);
              return { file: old, message: "Original saved." };
            }
            if (v.action === "metadata") {
              if (!old) return { error: "Unavailable." };
              old.display_name = String(v.label);
              old.document_category = String(v.category);
              old.documents_hidden = Boolean(v.hidden);
              old.document_revision = (old.document_revision || 0) + 1;
              commit(next);
              return { message: "Document updated." };
            }
            if (v.action === "delete") {
              if (old?.document_kind !== "trip")
                return { error: "Cannot delete booking shortcut." };
              next.files = next.files.filter((f) => f.id !== id);
              commit(next);
              return { message: "Document removed." };
            }
            return { error: "Unsupported fixture action" };
          }}
        />
      )}
    </AppShellView>
  );
}
createRoot(document.getElementById("fixture-root")!).render(<Fixture />);
