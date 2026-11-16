"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function BookingDrawer({
  title,
  busy,
  onClose,
  children,
  returnFocus,
  closeLabel = "Close booking editor",
  presentation = "drawer",
  initialFocus = 'input[name="title"]',
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
  returnFocus: HTMLElement | null;
  closeLabel?: string;
  initialFocus?: string;
  presentation?: "drawer" | "people";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current!;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    node.showModal();
    node.querySelector<HTMLElement>(initialFocus)?.focus({ preventScroll: true });
    const viewport = window.visualViewport;
    const resize = () => {
      if (presentation === "people") {
        const height = viewport?.height || window.innerHeight;
        node.style.height = "auto";
        node.style.maxHeight = `${Math.min(540, height * 0.85)}px`;
        if (window.innerWidth <= 600) {
          node.style.top = "auto";
          node.style.bottom = `${Math.max(0, window.innerHeight - height - (viewport?.offsetTop || 0))}px`;
          node.style.left = "0";
        } else {
          const r = node.getBoundingClientRect(),
            anchor = returnFocus?.getBoundingClientRect();
          node.style.left = `${Math.max(12, Math.min(anchor?.left || 12, window.innerWidth - r.width - 12))}px`;
          node.style.top = `${Math.max(12, Math.min((anchor?.bottom || 12) + 8, window.innerHeight - r.height - 12))}px`;
          node.style.bottom = "auto";
        }
        return;
      }
      if (viewport) {
        node.style.height = `${Math.min(viewport.height, window.innerHeight)}px`;
        node.style.top = `${viewport.offsetTop}px`;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    if (presentation === "people")
      window.addEventListener("scroll", resize, true);
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => {
      window.removeEventListener("resize", resize);
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      if (presentation === "people")
        window.removeEventListener("scroll", resize, true);
      node.close();
      document.documentElement.style.overflow = previous;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, [returnFocus, initialFocus, presentation]);
  return (
    <dialog
      ref={dialog}
      className={
        "booking-drawer" +
        (presentation === "people" ? " trip-people-panel" : "")
      }
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const nodes = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button, input, select, textarea, summary, a[href], [tabindex="0"]',
          ),
        ).filter(
          (node) =>
            node.getClientRects().length &&
            !node.matches(":disabled") &&
            !node.closest("[inert]") &&
            !(node instanceof HTMLInputElement && node.type === "hidden"),
        );
        const first = nodes[0],
          last = nodes.at(-1),
          active = document.activeElement;
        if (!first) {
          event.preventDefault();
          event.currentTarget.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || busy) return;
        const r = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        )
          onClose();
      }}
    >
      <header className="booking-drawer-header">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="booking-drawer-close"
          aria-label={closeLabel}
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      {children}
    </dialog>
  );
}
