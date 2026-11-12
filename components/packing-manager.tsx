"use client";
import {
  useState,
  useRef,
  useEffect,
  type ReactNode,
  type ElementType,
} from "react";
import { Plus, ArrowUp, ArrowDown, Backpack } from "lucide-react";
import type { Trip } from "../lib/domain";
import { MoneyHeader } from "./booking-manager";
import {
  packingGroups,
  packingProgress,
  packingCategories,
  packingInput,
  type ManagedPackingItem,
  type ManagedPackingList,
  type PackingInput,
  type PackingCommand,
  type ReadinessResult,
} from "../lib/packing-documents";
export type PackingProps = {
  trip: Trip;
  lists: ManagedPackingList[];
  items: ManagedPackingItem[];
  canEdit: boolean;
  ready: boolean;
  loadError?: string;
  suggestions?: Record<string, ReactNode>;
  templates?: Record<string, ReactNode>;
  copySources: { id: string; label: string }[];
  templateSources: { id: string; label: string }[];
  reminders: ReactNode;
};
export function PackingManager({
  trip,
  lists,
  items,
  canEdit,
  ready,
  loadError,
  suggestions = {},
  templates = {},
  copySources,
  templateSources,
  reminders,
  mutate,
  LinkComponent = "a",
}: PackingProps & {
  mutate: (command: PackingCommand) => Promise<ReadinessResult>;
  LinkComponent?: ElementType;
}) {
  const [selected, setSelected] = useState(lists[0]?.id || ""),
    [quick, setQuick] = useState(""),
    [quickId, setQuickId] = useState<string | null>(null),
    [editor, setEditor] = useState<PackingInput | null>(null),
    [hidePacked, setHidePacked] = useState(false),
    [newList, setNewList] = useState(false),
    [traveler, setTraveler] = useState(""),
    [listId, setListId] = useState<string | null>(null),
    [source, setSource] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const guard = useRef(false),
    quickRef = useRef<HTMLInputElement>(null),
    editRef = useRef<HTMLInputElement>(null);
  const editorId = editor?.id;
  useEffect(() => {
    if (editorId) editRef.current?.focus();
  }, [editorId]);
  const list = lists.find((l) => l.id === selected) || lists[0],
    current = items.filter((i) => i.list_id === list?.id),
    progress = packingProgress(items),
    listProgress = packingProgress(current),
    allowed = canEdit && ready && !loadError;
  async function run(
    command: PackingCommand,
    close: false | "quick" | "editor" = false,
  ) {
    if (guard.current) return false;
    guard.current = true;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await mutate(command);
      if (result.error) {
        setError(result.error);
        return false;
      }
      setMessage(result.message || "Saved.");
      if (command.op === "list" && result.id) {
        setSelected(result.id);
        setNewList(false);
        setTraveler("");
        setListId(null);
      }
      if (close === "editor") setEditor(null);
      if (close === "quick") {
        setQuick("");
        setQuickId(null);
        quickRef.current?.focus();
      }
      return true;
    } catch {
      setError(
        "Save not confirmed. Your input is still here; reconnect and retry.",
      );
      return false;
    } finally {
      setPending(false);
      guard.current = false;
    }
  }
  function reorder(item: ManagedPackingItem, delta: number) {
    if (!list) return;
    const all = [...current].sort(
        (a, b) =>
          (a.position || 0) - (b.position || 0) ||
          a.title.localeCompare(b.title) ||
          a.id.localeCompare(b.id),
      ),
      group = all.filter((i) => i.category === item.category),
      next = group[group.findIndex((i) => i.id === item.id) + delta];
    if (!next) return;
    const a = all.findIndex((i) => i.id === item.id),
      b = all.findIndex((i) => i.id === next.id);
    [all[a], all[b]] = [all[b], all[a]];
    void run({
      op: "reorder",
      list_id: list.id,
      order: all.map((i) => ({ id: i.id, revision: i.packing_revision || 0 })),
    });
  }
  if (loadError)
    return (
      <div className="trip-packing money-page readiness-page">
        <MoneyHeader trip={trip} view="packing" LinkComponent={LinkComponent} />
        <p role="alert" className="money-notice">
          {loadError}
        </p>
      </div>
    );
  return (
    <div className="trip-packing money-page readiness-page">
      <MoneyHeader trip={trip} view="packing" LinkComponent={LinkComponent} />
      {!ready && (
        <p className="money-notice">
          Saved lists are available. New controls need reviewed update 016.
        </p>
      )}
      {!canEdit && <p className="money-notice">View-only access.</p>}
      <section className="money-card readiness-progress">
        <div>
          <span className="money-icon">
            <Backpack size={20} />
          </span>
          <h2>
            {progress.packed} of {progress.total} items packed
          </h2>
          <p className="money-muted">
            {progress.remaining} remaining
            {progress.total
              ? " · " + progress.percent + "%"
              : " · Your list starts here"}
          </p>
        </div>
        <progress
          aria-label="Trip packing progress"
          value={progress.packed}
          max={progress.total || 1}
        />
      </section>
      <div className="money-toolbar">
        {lists.length > 0 && (
          <label className="packing-list-choice">
            Packing list
            <select
              aria-label="Packing list"
              value={list?.id || ""}
              disabled={pending}
              onChange={(e) => {
                if (editor && !window.confirm("Leave this unsaved edit?"))
                  return;
                setSelected(e.target.value);
                setEditor(null);
                setQuick("");
                setQuickId(null);
                setSource("");
              }}
            >
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.traveler}
                </option>
              ))}
            </select>
          </label>
        )}
        {canEdit && (
          <button
            disabled={!allowed || pending}
            onClick={() => setNewList(!newList)}
          >
            <Plus size={16} />{" "}
            {lists.length ? "Add list" : "Start a packing list"}
          </button>
        )}
      </div>
      {newList && (
        <form
          className="packing-list-form"
          onSubmit={(e) => {
            e.preventDefault();
            const id = listId || crypto.randomUUID();
            setListId(id);
            void run({ op: "list", id, traveler });
          }}
        >
          <label>
            List name
            <input
              required
              maxLength={100}
              placeholder="My packing list"
              value={traveler}
              disabled={pending}
              onChange={(e) => setTraveler(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={pending}>
            Save list
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="money-notice money-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="money-feedback">
          {message}
        </p>
      )}
      {!lists.length ? (
        <section className="money-empty">
          <Backpack size={30} />
          <h2>A little space for what matters.</h2>
          <p>Start a list, then add the things you want to bring.</p>
        </section>
      ) : (
        list && (
          <>
            <div className="money-section-heading">
              <h2>{list.traveler}</h2>
              <span className="money-muted">
                {listProgress.packed}/{listProgress.total} packed
              </span>
            </div>
            {allowed && (
              <form
                className="packing-quick-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  const id = quickId || crypto.randomUUID();
                  setQuickId(id);
                  void run(
                    {
                      op: "save",
                      input: {
                        id,
                        revision: 0,
                        list_id: list.id,
                        title: quick,
                        category: "Other",
                        quantity: 1,
                        notes: "",
                      },
                    },
                    "quick",
                  );
                }}
              >
                <label className="sr-only" htmlFor="packing-quick-name">
                  Item name
                </label>
                <input
                  id="packing-quick-name"
                  ref={quickRef}
                  required
                  maxLength={200}
                  placeholder="Add an item…"
                  value={quick}
                  disabled={pending}
                  onChange={(e) => setQuick(e.target.value)}
                />
                <button className="button primary" disabled={pending}>
                  <Plus size={16} /> Add item
                </button>
              </form>
            )}
            <label className="packing-collapse">
              <input
                type="checkbox"
                checked={hidePacked}
                onChange={(e) => setHidePacked(e.target.checked)}
              />{" "}
              Hide packed items
            </label>
            {editor && (
              <form
                className="money-card packing-editor"
                onSubmit={(e) => {
                  e.preventDefault();
                  const parsed = packingInput.safeParse(editor);
                  if (!parsed.success) {
                    setError(parsed.error.issues[0].message);
                    return;
                  }
                  void run({ op: "save", input: parsed.data }, "editor");
                }}
              >
                <h2>Edit packing item</h2>
                <fieldset disabled={pending}>
                  <div className="money-form-grid">
                    <label>
                      Item name
                      <input
                        ref={editRef}
                        required
                        maxLength={200}
                        value={editor.title}
                        onChange={(e) =>
                          setEditor({ ...editor, title: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Quantity
                      <input
                        type="number"
                        required
                        min={1}
                        max={1000}
                        value={editor.quantity}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            quantity: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Category
                      <input
                        list="packing-categories"
                        maxLength={100}
                        value={editor.category}
                        onChange={(e) =>
                          setEditor({ ...editor, category: e.target.value })
                        }
                      />
                      <datalist id="packing-categories">
                        {[
                          ...new Set([
                            ...packingCategories,
                            ...items.map((i) => i.category),
                          ]),
                        ].map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </label>
                    <label>
                      Notes (optional)
                      <textarea
                        rows={2}
                        maxLength={1000}
                        value={editor.notes}
                        onChange={(e) =>
                          setEditor({ ...editor, notes: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <div className="money-card-actions">
                    <button className="button primary" disabled={pending}>
                      Save item
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setEditor(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </fieldset>
              </form>
            )}
            {!current.length && (
              <p className="money-notice">
                No items yet. Add your first item or preview a starter list.
              </p>
            )}
            {packingGroups(current).map((group) => (
              <section className="packing-category" key={group.category}>
                <h3>{group.category}</h3>
                <div className="money-card packing-items">
                  {group.items
                    .filter((i) => !hidePacked || !i.packed)
                    .map((item, index) => (
                      <div
                        className={
                          "packing-row" + (item.packed ? " is-packed" : "")
                        }
                        key={item.id}
                        role="group"
                        aria-label={item.title}
                      >
                        <label>
                          <input
                            type="checkbox"
                            key={item.id + ":" + (item.packing_revision || 0)}
                            defaultChecked={item.packed}
                            disabled={!allowed || pending}
                            onChange={async (e) => {
                              const checkbox = e.currentTarget;
                              const saved = await run({
                                op: "packed",
                                id: item.id,
                                revision: item.packing_revision || 0,
                                packed: checkbox.checked,
                              });
                              if (!saved && checkbox.isConnected)
                                checkbox.checked = item.packed;
                            }}
                          />
                          <span>
                            {item.title}
                            <small>
                              Quantity {item.quantity}
                              {item.notes ? " · " + item.notes : ""}
                            </small>
                          </span>
                        </label>
                        {allowed && (
                          <div className="packing-row-actions">
                            <button
                              aria-label={"Edit " + item.title}
                              disabled={pending}
                              onClick={() =>
                                setEditor({
                                  id: item.id,
                                  revision: item.packing_revision || 0,
                                  list_id: item.list_id,
                                  title: item.title,
                                  category: item.category,
                                  quantity: item.quantity,
                                  notes: item.notes || "",
                                })
                              }
                            >
                              Edit
                            </button>
                            <button
                              aria-label={"Delete " + item.title}
                              disabled={pending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Remove “" +
                                      item.title +
                                      "” from this packing list?",
                                  )
                                )
                                  void run({
                                    op: "delete",
                                    id: item.id,
                                    revision: item.packing_revision || 0,
                                  });
                              }}
                            >
                              Delete
                            </button>
                            <button
                              aria-label={"Move " + item.title + " earlier"}
                              disabled={pending || hidePacked || index === 0}
                              onClick={() => reorder(item, -1)}
                            >
                              <ArrowUp size={15} />
                            </button>
                            <button
                              aria-label={"Move " + item.title + " later"}
                              disabled={
                                pending ||
                                hidePacked ||
                                index === group.items.length - 1
                              }
                              onClick={() => reorder(item, 1)}
                            >
                              <ArrowDown size={15} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  {hidePacked && group.items.every((i) => i.packed) && (
                    <p className="money-muted">Packed items hidden.</p>
                  )}
                </div>
              </section>
            ))}
            {allowed && (
              <details className="money-card packing-reuse">
                <summary>Reuse a list or template</summary>
                <label>
                  Saved list or template
                  <select
                    aria-label="Saved list or template"
                    disabled={pending}
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    <option value="">Choose a source</option>
                    {copySources
                      .filter((s) => s.id !== list.id)
                      .map((s) => (
                        <option key={s.id} value={"copy:" + s.id}>
                          {s.label}
                        </option>
                      ))}
                    {templateSources.map((s) => (
                      <option key={s.id} value={"template:" + s.id}>
                        {s.label} · template
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={!source || pending}
                  onClick={() => {
                    const [op, id] = source.split(":");
                    void run({
                      op: op as "copy" | "template",
                      list_id: list.id,
                      source: id,
                    });
                  }}
                >
                  Copy new items
                </button>
                <p className="money-muted">
                  Packed states and notes stay in the original list.
                </p>
                {templates[list.id]}
              </details>
            )}
            {canEdit && suggestions[list.id] && (
              <div className="packing-suggestions">{suggestions[list.id]}</div>
            )}
            {allowed && (
              <details className="packing-remove-list">
                <summary>Remove this list</summary>
                <button
                  disabled={pending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Delete this packing list and its " +
                          current.length +
                          " items? Other lists, documents and reminders stay saved.",
                      )
                    )
                      void run({
                        op: "delete-list",
                        id: list.id,
                        revision: list.packing_revision || 0,
                        items: current.map((i) => ({
                          id: i.id,
                          revision: i.packing_revision || 0,
                        })),
                      });
                  }}
                >
                  Delete list
                </button>
              </details>
            )}
          </>
        )
      )}
      {reminders}
    </div>
  );
}
