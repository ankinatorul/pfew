"use client";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal, Pencil, CalendarDays, Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { useOnline } from "../essentials/online";
export function PfewCheckSubmit({ checked }: { checked: boolean }) {
  const { pending } = useFormStatus();
  const online = useOnline();
  return (
    <button type="submit" disabled={pending || !online}>
      {!online
        ? "Reconnect to check"
        : pending
          ? "Checking your trip…"
          : checked
            ? "Refresh Trip Check"
            : "Check my trip"}
    </button>
  );
}
function DeleteItem() {
  const { pending } = useFormStatus();
  return (
    <Menu.Item
      asChild
      onSelect={(event) => event.preventDefault()}
      disabled={pending}
    >
      <button
        className="pfew-menu-item pfew-menu-danger"
        type="submit"
        disabled={pending}
      >
        <Trash2 size={16} aria-hidden="true" />
        {pending ? "Removing…" : "Delete destination"}
      </button>
    </Menu.Item>
  );
}
export function PfewContextMenu({
  tripId,
  itemId,
  title,
  deleteAction,
}: {
  tripId: string;
  itemId: string;
  title: string;
  deleteAction: (form: FormData) => void | Promise<void>;
}) {
  const online = useOnline();
  const edit = "/trips/" + tripId + "?view=add&edit=" + itemId;
  return (
    <Menu.Root>
      <Menu.Trigger
        className="pfew-context-trigger"
        aria-label={"Options for " + title}
      >
        <MoreHorizontal size={22} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="pfew-context-panel" align="end" sideOffset={8}>
          <Menu.Item asChild disabled={!online}>
            <a
              className="pfew-menu-item"
              href={online ? edit : undefined}
              aria-disabled={!online}
            >
              <Pencil size={16} aria-hidden="true" />
              Edit details
            </a>
          </Menu.Item>
          <Menu.Item asChild disabled={!online}>
            <a
              className="pfew-menu-item"
              href={online ? edit : undefined}
              aria-disabled={!online}
            >
              <CalendarDays size={16} aria-hidden="true" />
              Change dates / move
            </a>
          </Menu.Item>
          <Menu.Separator className="pfew-menu-separator" />
          {online ? (
            <form
              action={deleteAction}
              onSubmit={(event) => {
                if (
                  !window.confirm(
                    `Delete ${title} from this trip? Linked plans will keep their own records.`,
                  )
                )
                  event.preventDefault();
              }}
            >
              <input type="hidden" name="trip_id" value={tripId} />
              <input type="hidden" name="id" value={itemId} />
              <DeleteItem />
            </form>
          ) : (
            <Menu.Label className="pfew-menu-note">
              Reconnect to edit this journey.
            </Menu.Label>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
