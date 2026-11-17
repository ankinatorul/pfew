"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { GripVertical, MoreHorizontal } from "lucide-react";
export function DestinationSortList<T extends { id: string; title: string }>({
  items,
  canReorder,
  busy,
  onMove,
  render,
}: {
  items: T[];
  canReorder: boolean;
  busy: boolean;
  onMove: (from: number, to: number) => Promise<boolean | void>;
  render: (item: T, index: number) => ReactNode;
}) {
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null),
    [message, setMessage] = useState("");
  const state = useRef<{ from: number; to: number } | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    root = useRef<HTMLOListElement>(null),
    signature = useRef("");
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function clear() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    state.current = null;
    setDrag(null);
  }
  function start(index: number) {
    signature.current = items.map((i) => i.id).join("\u0000");
    const v = { from: index, to: index };
    state.current = v;
    setDrag(v);
    setMessage(
      `Moving ${items[index].title}. Use arrow keys, then Enter to place.`,
    );
  }
  function target(index: number) {
    if (!state.current) return;
    const v = {
      ...state.current,
      to: Math.max(0, Math.min(items.length - 1, index)),
    };
    state.current = v;
    setDrag(v);
    setMessage(`Position ${v.to + 1} of ${items.length}`);
  }
  async function finish() {
    const v = state.current;
    clear();
    if (signature.current !== items.map((i) => i.id).join("\u0000")) {
      setMessage("Destinations changed. Please try again.");
      return;
    }
    if (v && v.from !== v.to) {
      const ok = await onMove(v.from, v.to);
      if (ok !== false) setMessage("Destination order updated.");
    }
  }
  return (
    <>
      <ol
        ref={root}
        className="destination-sort-list"
        aria-label="Destinations"
      >
        {items.map((item, index) => (
          <li
            data-sort-index={index}
            key={item.id}
            className={`${drag?.from === index ? "is-dragging" : ""} ${drag?.to === index ? "is-drop-target" : ""}`}
          >
            {canReorder && items.length > 1 && (
              <button
                type="button"
                className="destination-drag-handle"
                onContextMenu={(e) => e.preventDefault()}
                aria-label={`Reorder ${item.title}`}
                aria-pressed={drag?.from === index}
                disabled={busy}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  if (e.pointerType === "touch")
                    timer.current = setTimeout(() => start(index), 300);
                  else start(index);
                }}
                onPointerMove={(e) => {
                  if (!state.current) return;
                  e.preventDefault();
                  const node = document
                    .elementFromPoint(e.clientX, e.clientY)
                    ?.closest<HTMLElement>("[data-sort-index]");
                  if (node && root.current?.contains(node))
                    target(Number(node.dataset.sortIndex));
                }}
                onPointerUp={() => {
                  void finish();
                }}
                onPointerCancel={clear}
                onLostPointerCapture={clear}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    clear();
                    return;
                  }
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    if (state.current) void finish();
                    else start(index);
                  } else if (
                    state.current &&
                    ["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)
                  ) {
                    e.preventDefault();
                    target(
                      e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? items.length - 1
                          : state.current.to + (e.key === "ArrowDown" ? 1 : -1),
                    );
                  }
                }}
              >
                <GripVertical size={20} aria-hidden="true" />
              </button>
            )}
            <div className="destination-sort-content">
              {render(item, index)}
            </div>
            {canReorder && items.length > 1 && (
              <details className="destination-order-menu">
                <summary aria-label={`Actions for ${item.title}`}>
                  <MoreHorizontal size={20} aria-hidden="true" />
                </summary>
                <label>
                  Move to position
                  <select
                    aria-label={`Move ${item.title} to position`}
                    value={index}
                    disabled={busy}
                    onChange={(e) => void onMove(index, Number(e.target.value))}
                  >
                    {items.map((_, i) => (
                      <option key={i} value={i}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
              </details>
            )}
          </li>
        ))}
      </ol>
      <span className="sr-only" role="status" aria-live="polite">
        {message}
      </span>
    </>
  );
}
