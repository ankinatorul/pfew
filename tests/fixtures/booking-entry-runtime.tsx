// Browser-only test doubles. No production authentication/database path uses this module.
import React from "react";
import { overviewTrip } from "./trip-overview";
export const fixtureTrip = { ...overviewTrip, owner_id: "fixture-owner" };
const key = "fixture:canonical-booking-entry";
export function records() {
  return JSON.parse(sessionStorage.getItem(key) || "[]");
}
const refresh = () => window.dispatchEvent(new Event("fixture:navigation"));
export function navigate(href: string) {
  history.pushState({}, "", href);
  refresh();
}
export default function Link({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      {...props}
      href={href}
      onClick={(e) => {
        e.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}
export const useRouter = () => ({ refresh, push: navigate, replace: navigate });
export async function access() {
  return {
    user: {
      id: new URLSearchParams(location.search).has("fixture-editor")
        ? "fixture-editor"
        : "fixture-owner",
    },
    db: {
      rpc: async () => ({
        data: new URLSearchParams(location.search).has("schema-missing")
          ? null
          : 1,
        error: null,
      }),
      from: (table: string) => {
        if (!["bookings", "booking_attachments"].includes(table))
          throw new Error("Unexpected fixture table: " + table);
        const result = {
          data: table === "bookings" ? records() : [],
          error: null,
        };
        const query = {
          select: () => query,
          eq: () => query,
          limit: async () => ({ data: [], error: null }),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve(result).then(resolve),
        };
        return query;
      },
    },
  };
}
export async function loadBookingCollection() {
  return { entries: [], attachments: [], ready: true, error: "" };
}
export async function saveManagedBooking(_trip: string, form: FormData) {
  const fields = Object.fromEntries(form),
    old = records().find((b: { id: string }) => b.id === fields.id);
  if (old && old.finance_revision !== Number(fields.revision))
    return { error: "Booking changed. Reload before saving." };
  const row = {
    ...fields,
    id: String(fields.id),
    price: fields.price === "" ? null : Number(fields.price),
    paid_amount: fields.paid_amount === "" ? null : Number(fields.paid_amount),
    latitude: fields.latitude === "" ? null : Number(fields.latitude),
    longitude: fields.longitude === "" ? null : Number(fields.longitude),
    finance_revision: old ? old.finance_revision + 1 : 0,
  };
  sessionStorage.setItem(
    key,
    JSON.stringify([
      ...records().filter((b: { id: string }) => b.id !== row.id),
      row,
    ]),
  );
  return { id: String(row.id) };
}
export async function removeManagedBooking() {
  return { error: "Not used by this fixture" };
}
export const saveExpense = removeManagedBooking,
  removeExpense = removeManagedBooking,
  saveMonetaryBudget = removeManagedBooking;
export const BudgetPlanningTools = () => null,
  UploadForm = () => null,
  RemoveAttachment = () => null;

export async function reorderDestinations() {
  return { error: "Not used by this fixture" };
}
export function seedBooking(booking: unknown) {
  sessionStorage.setItem(key, JSON.stringify([booking]));
}
