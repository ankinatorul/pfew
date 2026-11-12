"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function BookingDrawer({
  title,
  busy,
  onClose,
  children,
  returnFocus,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
  returnFocus: HTMLElement | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current!;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    node.showModal();
    node.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
    const viewport = window.visualViewport;
    const resize = () => {
      if (viewport) {
        node.style.height = `${Math.min(viewport.height, window.innerHeight)}px`;
        node.style.top = `${viewport.offsetTop}px`;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => {
      window.removeEventListener("resize", resize);
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      node.close();
      document.documentElement.style.overflow = previous;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, [returnFocus]);
  return (
    <dialog
      ref={dialog}
      className="booking-drawer"
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
          aria-label="Close booking editor"
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
